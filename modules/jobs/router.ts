import { TRPCError } from "@trpc/server"
import type { SupabaseClient } from "@supabase/supabase-js"
import { createTRPCRouter, permissionProcedure } from "@/lib/trpc/init"
import type { Context } from "@/lib/trpc/context"
import { createServiceRoleClient } from "@/lib/supabase/service-role"
import { writeActivityLog } from "@/lib/audit/activity"
import { getCachedPermissions } from "@/modules/iam/lib/permissions"
import { transitionStatus } from "@/modules/workflow/transitions"
import {
  listJobsInput,
  createJobInput,
  scheduleJobInput,
  assignJobInput,
  transitionJobInput,
  idInput,
  type Job,
  type JobCard,
  type ResourceConflict,
} from "./schema"

// ─── Helpers ──────────────────────────────────────────────────────────────────

const JOB_COLUMNS =
  "id, job_number, status, scheduled_date, scheduled_start_time, estimated_duration_hours, crew_size_required, customer_id, quote_id, move_type, origin_address, origin_postal_code, origin_city, origin_floor, origin_has_elevator, dest_address, dest_postal_code, dest_city, dest_floor, dest_has_elevator, total_amount_cents, deposit_amount_cents, actual_start_at, actual_end_at, special_instructions, internal_notes, completion_notes, cancellation_reason, customers(first_name, last_name, company_name, customer_type), quotes(quote_number), job_assignments(role, employees(id, first_name, last_name)), job_vehicles(vehicles(id, name))"

type Ctx = Context & { user: NonNullable<Context["user"]> }

function textOrNull(v: string | null | undefined): string | null {
  const trimmed = v?.trim()
  return trimmed ? trimmed : null
}

function customerName(c: Record<string, unknown> | null): string {
  if (!c) return ""
  const person = `${c["first_name"] as string} ${c["last_name"] as string}`
  return c["customer_type"] === "business" && c["company_name"]
    ? (c["company_name"] as string)
    : person
}

function mapCard(r: Record<string, unknown>, conflictCount: number): JobCard {
  const assignments = (r["job_assignments"] as Array<Record<string, unknown>> | null) ?? []
  const vehicles = (r["job_vehicles"] as Array<Record<string, unknown>> | null) ?? []
  return {
    id: r["id"] as string,
    jobNumber: r["job_number"] as string,
    status: r["status"] as JobCard["status"],
    scheduledDate: r["scheduled_date"] as string,
    startTime: ((r["scheduled_start_time"] as string | null) ?? null)?.slice(0, 5) ?? null,
    durationHours:
      r["estimated_duration_hours"] === null ? null : Number(r["estimated_duration_hours"]),
    crewSizeRequired: r["crew_size_required"] as number | null,
    customerName: customerName(r["customers"] as Record<string, unknown> | null),
    originCity: r["origin_city"] as string,
    destCity: r["dest_city"] as string,
    totalAmountCents: r["total_amount_cents"] as number,
    crew: assignments
      .map((a) => {
        const e = a["employees"] as Record<string, unknown> | null
        return e
          ? {
              id: e["id"] as string,
              name: `${e["first_name"] as string} ${e["last_name"] as string}`,
              role: a["role"] as "lead" | "mover",
            }
          : null
      })
      .filter((x): x is NonNullable<typeof x> => x !== null)
      .sort((a, b) =>
        a.role === "lead" ? -1 : b.role === "lead" ? 1 : a.name.localeCompare(b.name),
      ),
    vehicles: vehicles
      .map((v) => v["vehicles"] as Record<string, unknown> | null)
      .filter((v): v is Record<string, unknown> => v !== null)
      .map((v) => ({ id: v["id"] as string, name: v["name"] as string })),
    conflictCount,
  }
}

async function conflictsFor(
  sb: SupabaseClient,
  jobId: string,
  employeeIds?: string[],
  vehicleIds?: string[],
): Promise<ResourceConflict[]> {
  const { data, error } = await sb.rpc("job_resource_conflicts", {
    p_job_id: jobId,
    p_employee_ids: employeeIds ?? null,
    p_vehicle_ids: vehicleIds ?? null,
  })
  if (error) {
    if (error.message.includes("not_found"))
      throw new TRPCError({ code: "NOT_FOUND", message: "Job not found" })
    throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" })
  }
  const rows = (data ?? []) as Array<Record<string, unknown>>
  if (rows.length === 0) return []

  const employeeIdsInRows = rows
    .filter((r) => r["resource_type"] === "employee")
    .map((r) => r["resource_id"] as string)
  const vehicleIdsInRows = rows
    .filter((r) => r["resource_type"] === "vehicle")
    .map((r) => r["resource_id"] as string)
  const [{ data: employees }, { data: vehicles }] = await Promise.all([
    employeeIdsInRows.length
      ? sb.from("employees").select("id, first_name, last_name").in("id", employeeIdsInRows)
      : Promise.resolve({ data: [] as Array<Record<string, unknown>> }),
    vehicleIdsInRows.length
      ? sb.from("vehicles").select("id, name").in("id", vehicleIdsInRows)
      : Promise.resolve({ data: [] as Array<Record<string, unknown>> }),
  ])
  const names = new Map<string, string>([
    ...(employees ?? []).map(
      (e) =>
        [e["id"] as string, `${e["first_name"] as string} ${e["last_name"] as string}`] as const,
    ),
    ...(vehicles ?? []).map((v) => [v["id"] as string, v["name"] as string] as const),
  ])

  return rows.map((r) => ({
    resourceType: r["resource_type"] as ResourceConflict["resourceType"],
    resourceId: r["resource_id"] as string,
    resourceName: names.get(r["resource_id"] as string) ?? "",
    conflict: r["conflict"] as ResourceConflict["conflict"],
    otherJobId: r["other_job_id"] as string | null,
    otherJobNumber: r["other_job_number"] as string | null,
  }))
}

async function loadJob(sb: SupabaseClient, id: string): Promise<Record<string, unknown>> {
  const { data, error } = await sb
    .from("jobs")
    .select(JOB_COLUMNS)
    .eq("id", id)
    .is("deleted_at", null)
    .maybeSingle()
  if (error) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Failed to load job" })
  if (!data) throw new TRPCError({ code: "NOT_FOUND", message: "Job not found" })
  return data as unknown as Record<string, unknown>
}

const CLOSED = new Set(["completed", "cancelled"])

async function requirePermission(ctx: Ctx, key: string) {
  if (ctx.role === "owner") return
  if (!ctx.companyId || !(await getCachedPermissions(ctx.user.id, ctx.companyId)).keys.has(key)) {
    throw new TRPCError({ code: "FORBIDDEN", message: `Missing permission: ${key}` })
  }
}

// Which permission a status change needs
const TRANSITION_PERMISSION: Record<string, string> = {
  confirmed: "jobs.edit",
  scheduled: "jobs.edit",
  on_hold: "jobs.edit",
  in_progress: "jobs.edit",
  completed: "jobs.complete",
  cancelled: "jobs.cancel",
}

// ─── Procedures ───────────────────────────────────────────────────────────────

export const jobsRouter = createTRPCRouter({
  /** Jobs in a date range for the dispatch board and the job list. */
  list: permissionProcedure("jobs.view")
    .input(listJobsInput)
    .query(async ({ ctx, input }): Promise<JobCard[]> => {
      let query = ctx.supabase
        .from("jobs")
        .select(JOB_COLUMNS)
        .is("deleted_at", null)
        .gte("scheduled_date", input.from)
        .lte("scheduled_date", input.to)
      if (!input.includeClosed) query = query.not("status", "in", "(completed,cancelled)")

      const { data, error } = await query
        .order("scheduled_date")
        .order("scheduled_start_time", { nullsFirst: false })
        .limit(500)
      if (error)
        throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Failed to load jobs" })

      const rows = (data ?? []) as unknown as Array<Record<string, unknown>>
      const counts = await Promise.all(
        rows.map((r) =>
          CLOSED.has(r["status"] as string)
            ? Promise.resolve(0)
            : conflictsFor(ctx.supabase, r["id"] as string).then((c) => c.length),
        ),
      )
      return rows.map((r, i) => mapCard(r, counts[i]!))
    }),

  get: permissionProcedure("jobs.view")
    .input(idInput)
    .query(async ({ ctx, input }): Promise<Job> => {
      const r = await loadJob(ctx.supabase, input.id)
      const conflicts = CLOSED.has(r["status"] as string)
        ? []
        : await conflictsFor(ctx.supabase, input.id)
      const quote = r["quotes"] as Record<string, unknown> | null
      return {
        ...mapCard(r, conflicts.length),
        customerId: r["customer_id"] as string,
        quoteId: r["quote_id"] as string | null,
        quoteNumber: (quote?.["quote_number"] as string | undefined) ?? null,
        moveType: r["move_type"] as Job["moveType"],
        originAddress: r["origin_address"] as string,
        originPostalCode: r["origin_postal_code"] as string | null,
        originFloor: r["origin_floor"] as number | null,
        originHasElevator: r["origin_has_elevator"] as boolean,
        destAddress: r["dest_address"] as string,
        destPostalCode: r["dest_postal_code"] as string | null,
        destFloor: r["dest_floor"] as number | null,
        destHasElevator: r["dest_has_elevator"] as boolean,
        depositAmountCents: r["deposit_amount_cents"] as number,
        actualStartAt: r["actual_start_at"] as string | null,
        actualEndAt: r["actual_end_at"] as string | null,
        specialInstructions: r["special_instructions"] as string | null,
        internalNotes: r["internal_notes"] as string | null,
        completionNotes: r["completion_notes"] as string | null,
        cancellationReason: r["cancellation_reason"] as string | null,
        conflicts,
      }
    }),

  /** A job without a quote (e.g. small jobs agreed by phone). */
  create: permissionProcedure("jobs.create")
    .input(createJobInput)
    .mutation(async ({ ctx, input }): Promise<{ id: string }> => {
      if (!ctx.companyId) throw new TRPCError({ code: "UNAUTHORIZED" })
      const { data: customer } = await ctx.supabase
        .from("customers")
        .select("id")
        .eq("id", input.customerId)
        .is("deleted_at", null)
        .maybeSingle()
      if (!customer) throw new TRPCError({ code: "NOT_FOUND", message: "Customer not found" })

      const { data: number, error: numberError } = await createServiceRoleClient().rpc(
        "generate_sequence_number",
        {
          p_company_id: ctx.companyId,
          p_sequence_type: "job",
        },
      )
      if (numberError || !number) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" })

      const { data, error } = await ctx.supabase
        .from("jobs")
        .insert({
          company_id: ctx.companyId,
          customer_id: input.customerId,
          created_by: ctx.user.id,
          job_number: number,
          status: "scheduled",
          move_type: input.moveType,
          scheduled_date: input.scheduledDate,
          scheduled_start_time: input.startTime ?? null,
          estimated_duration_hours: input.durationHours ?? null,
          crew_size_required: input.crewSizeRequired ?? null,
          origin_address: input.originAddress,
          origin_postal_code: textOrNull(input.originPostalCode),
          origin_city: input.originCity,
          dest_address: input.destAddress,
          dest_postal_code: textOrNull(input.destPostalCode),
          dest_city: input.destCity,
          special_instructions: textOrNull(input.specialInstructions),
        })
        .select("id")
        .single()
      if (error || !data)
        throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Failed to create job" })

      await writeActivityLog(ctx, {
        action: "job.created",
        entityType: "job",
        entityId: data.id as string,
        entityLabel: number as string,
      })
      return { id: data.id as string }
    }),

  /** Date, time, duration, crew size, instructions. Returns the conflicts after the change. */
  schedule: permissionProcedure("jobs.edit")
    .input(scheduleJobInput)
    .mutation(async ({ ctx, input }) => {
      const before = await loadJob(ctx.supabase, input.id)
      if (CLOSED.has(before["status"] as string)) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "Completed or cancelled jobs cannot be rescheduled.",
        })
      }

      const { error } = await ctx.supabase
        .from("jobs")
        .update({
          scheduled_date: input.scheduledDate,
          scheduled_start_time: input.startTime ?? null,
          estimated_duration_hours: input.durationHours ?? null,
          crew_size_required: input.crewSizeRequired ?? null,
          special_instructions: textOrNull(input.specialInstructions),
          internal_notes: textOrNull(input.internalNotes),
        })
        .eq("id", input.id)
      if (error) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Failed to save" })

      if (before["scheduled_date"] !== input.scheduledDate) {
        await writeActivityLog(ctx, {
          action: "job.rescheduled",
          entityType: "job",
          entityId: input.id,
          entityLabel: before["job_number"] as string,
          beforeState: { scheduled_date: before["scheduled_date"] },
          afterState: { scheduled_date: input.scheduledDate },
        })
      }
      return { conflicts: await conflictsFor(ctx.supabase, input.id) }
    }),

  /**
   * Replaces crew and vehicles of a job. Conflicts (double booking, absence,
   * vehicle in maintenance …) are returned without saving unless `force`.
   */
  assign: permissionProcedure("jobs.assign")
    .input(assignJobInput)
    .mutation(async ({ ctx, input }) => {
      if (!ctx.companyId) throw new TRPCError({ code: "UNAUTHORIZED" })
      const job = await loadJob(ctx.supabase, input.id)
      if (CLOSED.has(job["status"] as string)) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "Completed or cancelled jobs cannot be changed.",
        })
      }
      if (input.leadEmployeeId && !input.employeeIds.includes(input.leadEmployeeId)) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "The crew lead must be part of the crew.",
        })
      }

      const employeeIds = [...new Set(input.employeeIds)]
      const vehicleIds = [...new Set(input.vehicleIds)]

      // Every id must be visible in the active company
      const [{ data: employees }, { data: vehicles }] = await Promise.all([
        employeeIds.length
          ? ctx.supabase.from("employees").select("id").in("id", employeeIds).is("deleted_at", null)
          : Promise.resolve({ data: [] }),
        vehicleIds.length
          ? ctx.supabase.from("vehicles").select("id").in("id", vehicleIds).is("deleted_at", null)
          : Promise.resolve({ data: [] }),
      ])
      if (
        (employees ?? []).length !== employeeIds.length ||
        (vehicles ?? []).length !== vehicleIds.length
      ) {
        throw new TRPCError({ code: "NOT_FOUND", message: "Employee or vehicle not found" })
      }

      const conflicts = await conflictsFor(ctx.supabase, input.id, employeeIds, vehicleIds)
      if (conflicts.length > 0 && !input.force) return { saved: false as const, conflicts }

      const svc = createServiceRoleClient()
      const companyId = ctx.companyId
      const delA = await svc
        .from("job_assignments")
        .delete()
        .eq("job_id", input.id)
        .eq("company_id", companyId)
      const delV = await svc
        .from("job_vehicles")
        .delete()
        .eq("job_id", input.id)
        .eq("company_id", companyId)
      if (delA.error || delV.error) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" })

      if (employeeIds.length) {
        const { error } = await svc.from("job_assignments").insert(
          employeeIds.map((employeeId) => ({
            company_id: companyId,
            job_id: input.id,
            employee_id: employeeId,
            role: employeeId === input.leadEmployeeId ? "lead" : "mover",
            assigned_by: ctx.user.id,
          })),
        )
        if (error)
          throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Failed to assign crew" })
      }
      if (vehicleIds.length) {
        const { error } = await svc.from("job_vehicles").insert(
          vehicleIds.map((vehicleId) => ({
            company_id: companyId,
            job_id: input.id,
            vehicle_id: vehicleId,
            assigned_by: ctx.user.id,
          })),
        )
        if (error)
          throw new TRPCError({
            code: "INTERNAL_SERVER_ERROR",
            message: "Failed to assign vehicles",
          })
      }

      await writeActivityLog(ctx, {
        action: "job.assigned",
        entityType: "job",
        entityId: input.id,
        entityLabel: job["job_number"] as string,
        afterState: {
          employee_ids: employeeIds,
          lead: input.leadEmployeeId ?? null,
          vehicle_ids: vehicleIds,
        },
        metadata: { overridden_conflicts: input.force ? conflicts.map((c) => c.conflict) : [] },
      })

      // Re-evaluate tasks such as "assign crew" right away
      await svc.rpc("sync_system_tasks", { p_company_id: companyId })
      return { saved: true as const, conflicts }
    }),

  /** Status change through the workflow engine (guards: crew before start, reason for cancel). */
  transition: permissionProcedure("jobs.view")
    .input(transitionJobInput)
    .mutation(async ({ ctx, input }) => {
      await requirePermission(ctx, TRANSITION_PERMISSION[input.to] ?? "jobs.edit")
      const job = await loadJob(ctx.supabase, input.id)

      if (input.to === "completed" && textOrNull(input.completionNotes)) {
        await ctx.supabase
          .from("jobs")
          .update({ completion_notes: textOrNull(input.completionNotes) })
          .eq("id", input.id)
      }
      await transitionStatus(ctx.supabase, "job", input.id, input.to, input.reason)

      await writeActivityLog(ctx, {
        action: `job.${input.to}`,
        entityType: "job",
        entityId: input.id,
        entityLabel: job["job_number"] as string,
        beforeState: { status: job["status"] },
        afterState: { status: input.to },
      })
      return { id: input.id }
    }),
})
