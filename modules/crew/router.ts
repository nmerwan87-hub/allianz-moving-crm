import { TRPCError } from "@trpc/server"
import { createTRPCRouter, permissionProcedure } from "@/lib/trpc/init"
import { createServiceRoleClient } from "@/lib/supabase/service-role"
import { writeActivityLog } from "@/lib/audit/activity"
import { normalizePhone } from "@/lib/format/phone"
import {
  createEmployeeInput,
  updateEmployeeInput,
  createAbsenceInput,
  absenceRangeInput,
  idInput,
  type CreateEmployeeInput,
  type Employee,
  type Absence,
} from "./schema"

// Crew members are planning records; they do not log in (PRODUCT_REQUIREMENTS §3.2).
// Hourly cost (wage) is visible to owners and users with employees.edit only.

const COLUMNS =
  "id, first_name, last_name, email, phone, role, status, employment_type, hourly_rate_cents, driver_license_class, driver_license_expiry, skills, notes"

function textOrNull(v: string | null | undefined): string | null {
  const trimmed = v?.trim()
  return trimmed ? trimmed : null
}

function mapEmployee(r: Record<string, unknown>, showCost: boolean): Employee {
  return {
    id: r["id"] as string,
    firstName: r["first_name"] as string,
    lastName: r["last_name"] as string,
    name: `${r["first_name"] as string} ${r["last_name"] as string}`,
    email: r["email"] as string | null,
    phone: r["phone"] as string | null,
    role: r["role"] as Employee["role"],
    status: r["status"] as Employee["status"],
    employmentType: r["employment_type"] as Employee["employmentType"],
    hourlyCostCents: showCost ? (r["hourly_rate_cents"] as number | null) : null,
    driverLicenseClass: r["driver_license_class"] as string | null,
    driverLicenseExpiry: r["driver_license_expiry"] as string | null,
    skills: (r["skills"] as string[] | null) ?? [],
    notes: r["notes"] as string | null,
  }
}

function toRow(input: CreateEmployeeInput) {
  return {
    first_name: input.firstName,
    last_name: input.lastName,
    email: textOrNull(input.email)?.toLowerCase() ?? null,
    phone: normalizePhone(input.phone),
    role: input.role,
    status: input.status,
    employment_type: input.employmentType ?? null,
    hourly_rate_cents: input.hourlyCostCents ?? null,
    driver_license_class: textOrNull(input.driverLicenseClass),
    driver_license_expiry: input.driverLicenseExpiry ?? null,
    skills: input.skills,
    notes: textOrNull(input.notes),
  }
}

const employeesRouter = createTRPCRouter({
  list: permissionProcedure("employees.view").query(async ({ ctx }): Promise<Employee[]> => {
    const { data, error } = await ctx.supabase
      .from("employees")
      .select(COLUMNS)
      .is("deleted_at", null)
      .order("status", { ascending: true })
      .order("last_name", { ascending: true })
    if (error) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" })
    const showCost = ctx.role === "owner"
    return (data ?? []).map((r) => mapEmployee(r as Record<string, unknown>, showCost))
  }),

  create: permissionProcedure("employees.create")
    .input(createEmployeeInput)
    .mutation(async ({ ctx, input }) => {
      if (!ctx.companyId) throw new TRPCError({ code: "UNAUTHORIZED" })
      const { data, error } = await ctx.supabase
        .from("employees")
        .insert({ ...toRow(input), company_id: ctx.companyId })
        .select("id")
        .single()
      if (error || !data)
        throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Failed to save" })
      await writeActivityLog(ctx, {
        action: "employee.created",
        entityType: "employee",
        entityId: data.id as string,
        entityLabel: `${input.firstName} ${input.lastName}`,
      })
      return { id: data.id as string }
    }),

  update: permissionProcedure("employees.edit")
    .input(updateEmployeeInput)
    .mutation(async ({ ctx, input }) => {
      const { id, ...fields } = input
      const row: Record<string, unknown> = toRow(fields)
      // Only owners see wages; others must not overwrite them blindly
      if (ctx.role !== "owner") delete row["hourly_rate_cents"]

      const { data, error } = await ctx.supabase
        .from("employees")
        .update(row)
        .eq("id", id)
        .is("deleted_at", null)
        .select("id")
      if (error) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Failed to save" })
      if (!data?.length) throw new TRPCError({ code: "NOT_FOUND", message: "Employee not found" })

      await writeActivityLog(ctx, {
        action: "employee.updated",
        entityType: "employee",
        entityId: id,
        entityLabel: `${fields.firstName} ${fields.lastName}`,
      })
      return { id }
    }),

  archive: permissionProcedure("employees.delete")
    .input(idInput)
    .mutation(async ({ ctx, input }) => {
      const { data, error } = await ctx.supabase
        .from("employees")
        .update({ deleted_at: new Date().toISOString(), status: "inactive" })
        .eq("id", input.id)
        .is("deleted_at", null)
        .select("first_name, last_name")
      if (error) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" })
      if (!data?.length) throw new TRPCError({ code: "NOT_FOUND", message: "Employee not found" })
      await writeActivityLog(ctx, {
        action: "employee.archived",
        entityType: "employee",
        entityId: input.id,
        entityLabel: `${data[0]!.first_name as string} ${data[0]!.last_name as string}`,
      })
      return { id: input.id }
    }),
})

const absencesRouter = createTRPCRouter({
  /** Absences overlapping a date range (planning view). */
  list: permissionProcedure("employees.view")
    .input(absenceRangeInput)
    .query(async ({ ctx, input }): Promise<Absence[]> => {
      const { data, error } = await ctx.supabase
        .from("employee_absences")
        .select("id, employee_id, kind, starts_on, ends_on, note, employees(first_name, last_name)")
        .lte("starts_on", input.to)
        .gte("ends_on", input.from)
        .order("starts_on")
      if (error) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" })
      return (data ?? []).map((r) => {
        const e = r.employees as unknown as { first_name: string; last_name: string } | null
        return {
          id: r.id as string,
          employeeId: r.employee_id as string,
          employeeName: e ? `${e.first_name} ${e.last_name}` : "",
          kind: r.kind as Absence["kind"],
          startsOn: r.starts_on as string,
          endsOn: r.ends_on as string,
          note: r.note as string | null,
        }
      })
    }),

  create: permissionProcedure("employees.edit")
    .input(createAbsenceInput)
    .mutation(async ({ ctx, input }) => {
      if (!ctx.companyId) throw new TRPCError({ code: "UNAUTHORIZED" })
      // Employee must belong to the active company (RLS-visible)
      const { data: employee } = await ctx.supabase
        .from("employees")
        .select("id")
        .eq("id", input.employeeId)
        .is("deleted_at", null)
        .maybeSingle()
      if (!employee) throw new TRPCError({ code: "NOT_FOUND", message: "Employee not found" })

      const { data, error } = await createServiceRoleClient()
        .from("employee_absences")
        .insert({
          company_id: ctx.companyId,
          employee_id: input.employeeId,
          kind: input.kind,
          starts_on: input.startsOn,
          ends_on: input.endsOn,
          note: textOrNull(input.note),
          created_by: ctx.user.id,
        })
        .select("id")
        .single()
      if (error || !data) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" })
      return { id: data.id as string }
    }),

  remove: permissionProcedure("employees.edit")
    .input(idInput)
    .mutation(async ({ ctx, input }) => {
      if (!ctx.companyId) throw new TRPCError({ code: "UNAUTHORIZED" })
      const { data, error } = await createServiceRoleClient()
        .from("employee_absences")
        .delete()
        .eq("id", input.id)
        .eq("company_id", ctx.companyId)
        .select("id")
      if (error) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" })
      if (!data?.length) throw new TRPCError({ code: "NOT_FOUND", message: "Absence not found" })
      return { id: input.id }
    }),
})

export const crewRouter = createTRPCRouter({
  employees: employeesRouter,
  absences: absencesRouter,
})
