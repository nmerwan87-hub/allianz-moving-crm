import { TRPCError } from "@trpc/server"
import type { SupabaseClient } from "@supabase/supabase-js"
import { createTRPCRouter, permissionProcedure, protectedProcedure } from "@/lib/trpc/init"
import type { Context } from "@/lib/trpc/context"
import { writeActivityLog } from "@/lib/audit/activity"
import { addMinutesToTime, isoToZurich, zurichToIso } from "@/lib/format/zurich-time"
import { getCachedPermissions } from "@/modules/iam/lib/permissions"
import { transitionStatus } from "@/modules/workflow/transitions"
import {
  appointmentIdInput,
  calendarRangeInput,
  createAppointmentInput,
  leadIdInput,
  customerIdInput,
  setConfirmedInput,
  updateAppointmentInput,
  type CalendarEvent,
} from "./schema"

/**
 * Calendar (Bixin: Kalender): own appointments and home visits, linked to
 * an inquiry or customer when wanted, plus the planned jobs. Appointments
 * are edited with leads.edit; jobs are only shown here (planning happens
 * on the job).
 */

type Ctx = Context & { user: NonNullable<Context["user"]> }

const APPOINTMENT_COLUMNS =
  "id, title, type, status, scheduled_at, duration_minutes, notes, lead_id, customer_id, leads(first_name, last_name), customers(first_name, last_name, company_name, customer_type)"

async function can(ctx: Ctx, key: string): Promise<boolean> {
  if (ctx.role === "owner") return true
  if (!ctx.companyId) return false
  return (await getCachedPermissions(ctx.user.id, ctx.companyId)).keys.has(key)
}

function personName(p: Record<string, unknown> | null): string | null {
  if (!p) return null
  if (p["customer_type"] === "business" && p["company_name"]) return p["company_name"] as string
  return `${p["first_name"] as string} ${p["last_name"] as string}`
}

function mapAppointment(r: Record<string, unknown>): CalendarEvent {
  const { date, time } = isoToZurich(r["scheduled_at"] as string)
  const duration = r["duration_minutes"] as number
  const lead = personName(r["leads"] as Record<string, unknown> | null)
  const customer = personName(r["customers"] as Record<string, unknown> | null)
  const type = r["type"] as string
  return {
    id: r["id"] as string,
    source: "appointment",
    kind: type === "other" ? "other" : "site_visit",
    title:
      (r["title"] as string | null) ??
      (type === "other" ? "Termin" : `Hausbesuch ${lead ?? customer ?? ""}`.trim()),
    subtitle: lead ?? customer,
    date,
    startTime: time,
    endTime: addMinutesToTime(time, duration),
    confirmed: r["status"] === "confirmed",
    status: r["status"] as string,
    href: r["lead_id"]
      ? `/leads/${r["lead_id"] as string}`
      : r["customer_id"]
        ? `/customers/${r["customer_id"] as string}`
        : null,
    leadId: r["lead_id"] as string | null,
    customerId: r["customer_id"] as string | null,
    notes: r["notes"] as string | null,
    durationMinutes: duration,
  }
}

async function loadAppointment(sb: SupabaseClient, id: string) {
  const { data } = await sb
    .from("appointments")
    .select("id, status, lead_id")
    .eq("id", id)
    .is("deleted_at", null)
    .maybeSingle()
  if (!data) throw new TRPCError({ code: "NOT_FOUND", message: "Termin nicht gefunden." })
  return data
}

/** The linked inquiry / customer must belong to the active company. */
async function checkLinks(sb: SupabaseClient, leadId?: string | null, customerId?: string | null) {
  if (leadId) {
    const { data } = await sb.from("leads").select("id").eq("id", leadId).maybeSingle()
    if (!data) throw new TRPCError({ code: "NOT_FOUND", message: "Anfrage nicht gefunden" })
  }
  if (customerId) {
    const { data } = await sb.from("customers").select("id").eq("id", customerId).maybeSingle()
    if (!data) throw new TRPCError({ code: "NOT_FOUND", message: "Kunde nicht gefunden" })
  }
}

export const calendarRouter = createTRPCRouter({
  /** Appointments and jobs between two Swiss dates (inclusive). */
  events: protectedProcedure.input(calendarRangeInput).query(async ({ ctx, input }) => {
    const [seeAppointments, seeJobs] = await Promise.all([
      can(ctx, "leads.view"),
      can(ctx, "jobs.view"),
    ])
    const fromIso = zurichToIso(input.from, "00:00")
    const toIso = zurichToIso(input.to, "23:59")

    const [appointments, jobs] = await Promise.all([
      seeAppointments
        ? ctx.supabase
            .from("appointments")
            .select(APPOINTMENT_COLUMNS)
            .is("deleted_at", null)
            .neq("status", "cancelled")
            .gte("scheduled_at", fromIso)
            .lte("scheduled_at", toIso)
            .order("scheduled_at")
        : Promise.resolve({ data: [] }),
      seeJobs
        ? ctx.supabase
            .from("jobs")
            .select(
              "id, job_number, status, scheduled_date, scheduled_start_time, estimated_duration_hours, origin_city, dest_city, customer_id, customers(first_name, last_name, company_name, customer_type)",
            )
            .is("deleted_at", null)
            .neq("status", "cancelled")
            .gte("scheduled_date", input.from)
            .lte("scheduled_date", input.to)
        : Promise.resolve({ data: [] }),
    ])

    const events: CalendarEvent[] = [
      ...(appointments.data ?? []).map((a) => mapAppointment(a as Record<string, unknown>)),
      ...(jobs.data ?? []).map((j): CalendarEvent => {
        const start = (j.scheduled_start_time as string | null)?.slice(0, 5) ?? null
        const hours =
          j.estimated_duration_hours === null ? null : Number(j.estimated_duration_hours)
        return {
          id: j.id as string,
          source: "job",
          kind: "job",
          title: `${personName(j.customers as unknown as Record<string, unknown> | null) ?? "Auftrag"}`,
          subtitle: `${j.job_number as string} · ${[j.origin_city, j.dest_city].filter(Boolean).join(" → ")}`,
          date: j.scheduled_date as string,
          startTime: start,
          endTime: start && hours ? addMinutesToTime(start, Math.round(hours * 60)) : null,
          confirmed: ["confirmed", "in_progress", "completed"].includes(j.status as string),
          status: j.status as string,
          href: `/jobs/${j.id as string}`,
          leadId: null,
          customerId: j.customer_id as string,
          notes: null,
          durationMinutes: hours ? Math.round(hours * 60) : null,
        }
      }),
    ]
    events.sort((a, b) =>
      `${a.date} ${a.startTime ?? "00:00"}`.localeCompare(`${b.date} ${b.startTime ?? "00:00"}`),
    )
    return events
  }),

  /** Appointments of one inquiry (home visit block on the inquiry). */
  forLead: permissionProcedure("leads.view")
    .input(leadIdInput)
    .query(async ({ ctx, input }) => {
      const { data } = await ctx.supabase
        .from("appointments")
        .select(APPOINTMENT_COLUMNS)
        .eq("lead_id", input.leadId)
        .is("deleted_at", null)
        .neq("status", "cancelled")
        .order("scheduled_at")
      return (data ?? []).map((a) => mapAppointment(a as Record<string, unknown>))
    }),

  /** Appointments of a customer, directly or through one of their inquiries. */
  forCustomer: permissionProcedure("leads.view")
    .input(customerIdInput)
    .query(async ({ ctx, input }) => {
      const { data: leads } = await ctx.supabase
        .from("leads")
        .select("id")
        .eq("customer_id", input.customerId)
      const leadIds = (leads ?? []).map((l) => l.id as string)
      const filter = [
        `customer_id.eq.${input.customerId}`,
        ...leadIds.map((id) => `lead_id.eq.${id}`),
      ]
      const { data } = await ctx.supabase
        .from("appointments")
        .select(APPOINTMENT_COLUMNS)
        .or(filter.join(","))
        .is("deleted_at", null)
        .neq("status", "cancelled")
        .order("scheduled_at", { ascending: false })
      return (data ?? []).map((a) => mapAppointment(a as Record<string, unknown>))
    }),

  create: permissionProcedure("leads.edit")
    .input(createAppointmentInput)
    .mutation(async ({ ctx, input }) => {
      if (!ctx.companyId) throw new TRPCError({ code: "UNAUTHORIZED" })
      await checkLinks(ctx.supabase, input.leadId, input.customerId)
      const { data, error } = await ctx.supabase
        .from("appointments")
        .insert({
          company_id: ctx.companyId,
          title: input.title,
          type: input.kind,
          scheduled_at: zurichToIso(input.date, input.startTime),
          duration_minutes: input.durationMinutes,
          lead_id: input.leadId ?? null,
          customer_id: input.customerId ?? null,
          assigned_to: ctx.user.id,
          notes: input.notes?.trim() ? input.notes.trim() : null,
        })
        .select("id")
        .single()
      if (error || !data)
        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message: "Termin konnte nicht erstellt werden.",
        })
      if (input.confirmed)
        await transitionStatus(ctx.supabase, "appointment", data.id as string, "confirmed")
      await writeActivityLog(ctx, {
        action: "appointment.created",
        entityType: input.leadId ? "lead" : "appointment",
        entityId: (input.leadId ?? data.id) as string,
        metadata: { appointment_id: data.id, title: input.title, kind: input.kind },
      })
      return { id: data.id as string }
    }),

  update: permissionProcedure("leads.edit")
    .input(updateAppointmentInput)
    .mutation(async ({ ctx, input }) => {
      const current = await loadAppointment(ctx.supabase, input.id)
      await checkLinks(ctx.supabase, input.leadId, input.customerId)
      const { error } = await ctx.supabase
        .from("appointments")
        .update({
          title: input.title,
          type: input.kind,
          scheduled_at: zurichToIso(input.date, input.startTime),
          duration_minutes: input.durationMinutes,
          lead_id: input.leadId ?? null,
          customer_id: input.customerId ?? null,
          notes: input.notes?.trim() ? input.notes.trim() : null,
        })
        .eq("id", input.id)
      if (error)
        throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Speichern fehlgeschlagen" })
      const isConfirmed = current.status === "confirmed"
      if (
        input.confirmed !== isConfirmed &&
        ["scheduled", "confirmed"].includes(current.status as string)
      )
        await transitionStatus(
          ctx.supabase,
          "appointment",
          input.id,
          input.confirmed ? "confirmed" : "scheduled",
        )
      return { id: input.id }
    }),

  setConfirmed: permissionProcedure("leads.edit")
    .input(setConfirmedInput)
    .mutation(async ({ ctx, input }) => {
      const current = await loadAppointment(ctx.supabase, input.id)
      const target = input.confirmed ? "confirmed" : "scheduled"
      if (current.status !== target)
        await transitionStatus(ctx.supabase, "appointment", input.id, target)
      return { id: input.id }
    }),

  /** Removes an appointment from the calendar (kept for the record). */
  remove: permissionProcedure("leads.edit")
    .input(appointmentIdInput)
    .mutation(async ({ ctx, input }) => {
      const current = await loadAppointment(ctx.supabase, input.id)
      const { error } = await ctx.supabase
        .from("appointments")
        .update({ deleted_at: new Date().toISOString() })
        .eq("id", input.id)
      if (error) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" })
      await writeActivityLog(ctx, {
        action: "appointment.removed",
        entityType: current.lead_id ? "lead" : "appointment",
        entityId: (current.lead_id ?? input.id) as string,
        metadata: { appointment_id: input.id },
      })
      return { id: input.id }
    }),
})
