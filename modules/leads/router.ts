import { TRPCError } from "@trpc/server"
import { z } from "zod"
import { createTRPCRouter, permissionProcedure } from "@/lib/trpc/init"
import { writeActivityLog } from "@/lib/audit/activity"
import {
  createLeadInput,
  updateLeadInput,
  updateLeadStatusInput,
  listLeadsInput,
  deleteLeadInput,
  type Lead,
  type LeadListResult,
} from "./schema"

// ─── Helpers ──────────────────────────────────────────────────────────────────

/** Convert empty strings to null for nullable text columns */
function nullIfEmpty(v: string | null | undefined): string | null {
  if (v === undefined) return null
  if (v === null) return null
  if (v === "") return null
  return v
}

/** Convert empty-string date to null; pass through YYYY-MM-DD */
function nullIfEmptyDate(v: string | null | undefined): string | null {
  return nullIfEmpty(v)
}

/** Map a database row (snake_case) to the Lead interface (camelCase) */
function mapLead(row: Record<string, unknown>): Lead {
  return {
    id: row["id"] as string,
    companyId: row["company_id"] as string,
    customerId: row["customer_id"] as string | null,
    assignedTo: row["assigned_to"] as string | null,
    firstName: row["first_name"] as string,
    lastName: row["last_name"] as string,
    email: row["email"] as string | null,
    phone: row["phone"] as string | null,
    moveType: row["move_type"] as string | null,
    requestedDate: row["requested_date"] as string | null,
    dateFlexible: row["date_flexible"] as boolean,
    propertySize: row["property_size"] as string | null,
    originAddress: row["origin_address"] as string | null,
    originCity: row["origin_city"] as string | null,
    originState: row["origin_state"] as string | null,
    originPostalCode: row["origin_postal_code"] as string | null,
    originCountry: row["origin_country"] as string | null,
    originFloor: row["origin_floor"] as number | null,
    originHasElevator: row["origin_has_elevator"] as boolean,
    originHasStairs: row["origin_has_stairs"] as boolean,
    originParkingNotes: row["origin_parking_notes"] as string | null,
    destAddress: row["dest_address"] as string | null,
    destCity: row["dest_city"] as string | null,
    destState: row["dest_state"] as string | null,
    destPostalCode: row["dest_postal_code"] as string | null,
    destCountry: row["dest_country"] as string | null,
    destFloor: row["dest_floor"] as number | null,
    destHasElevator: row["dest_has_elevator"] as boolean,
    destHasStairs: row["dest_has_stairs"] as boolean,
    destParkingNotes: row["dest_parking_notes"] as string | null,
    estimatedVolumeCuft: row["estimated_volume_cuft"] as number | null,
    estimatedDistanceMiles: row["estimated_distance_miles"] as number | null,
    status: row["status"] as string,
    lostReason: row["lost_reason"] as string | null,
    convertedAt: row["converted_at"] as string | null,
    source: row["source"] as string | null,
    utmSource: row["utm_source"] as string | null,
    utmMedium: row["utm_medium"] as string | null,
    utmCampaign: row["utm_campaign"] as string | null,
    referrerUrl: row["referrer_url"] as string | null,
    internalNotes: row["internal_notes"] as string | null,
    createdAt: row["created_at"] as string,
    updatedAt: row["updated_at"] as string,
    assignedToName: (row["assigned_to_name"] as string | null) ?? null,
  }
}

// ─── Procedures ───────────────────────────────────────────────────────────────

export const leadsRouter = createTRPCRouter({
  /** Paginated, searchable, filterable lead list scoped to the current tenant. */
  list: permissionProcedure("leads.view")
    .input(listLeadsInput)
    .query(async ({ ctx, input }): Promise<LeadListResult> => {
      const sb = ctx.supabase
      const offset = (input.page - 1) * input.pageSize

      let query = sb
        .from("leads")
        .select(
          "id, company_id, customer_id, assigned_to, first_name, last_name, email, phone, move_type, requested_date, date_flexible, property_size, origin_address, origin_city, origin_state, origin_postal_code, origin_country, origin_floor, origin_has_elevator, origin_has_stairs, origin_parking_notes, dest_address, dest_city, dest_state, dest_postal_code, dest_country, dest_floor, dest_has_elevator, dest_has_stairs, dest_parking_notes, estimated_volume_cuft, estimated_distance_miles, status, lost_reason, converted_at, source, utm_source, utm_medium, utm_campaign, referrer_url, internal_notes, created_at, updated_at",
          { count: "exact" },
        )
        .is("deleted_at", null)

      if (input.search) {
        const s = input.search.trim()
        query = query.or(
          `first_name.ilike.%${s}%,last_name.ilike.%${s}%,email.ilike.%${s}%,phone.ilike.%${s}%`,
        )
      }

      if (input.status) {
        query = query.eq("status", input.status)
      }

      if (input.source) {
        query = query.eq("source", input.source)
      }

      const sortColumn = input.sortBy
      query = query.order(sortColumn, { ascending: input.sortOrder === "asc" })
      query = query.range(offset, offset + input.pageSize - 1)

      const { data, error, count } = await query

      if (error) {
        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message: "Failed to fetch leads",
        })
      }

      const total = count ?? 0
      const totalPages = Math.ceil(total / input.pageSize) || 1

      // Fetch assigned-to names in a single query if any leads have assignees
      const assignedIds = (data ?? [])
        .map((r) => r["assigned_to"] as string | null)
        .filter((v): v is string => v !== null)

      let assigneeMap = new Map<string, string>()
      if (assignedIds.length > 0) {
        const uniqueIds = [...new Set(assignedIds)]
        const { data: assignees } = await sb
          .from("profiles")
          .select("id, first_name, last_name")
          .in("id", uniqueIds)

        if (assignees) {
          assigneeMap = new Map(
            assignees.map((a) => [
              a["id"] as string,
              `${a["first_name"] as string} ${a["last_name"] as string}`,
            ]),
          )
        }
      }

      const items: Lead[] = (data ?? []).map((row) => {
        const mapped = mapLead(row as Record<string, unknown>)
        if (mapped.assignedTo && assigneeMap.has(mapped.assignedTo)) {
          mapped.assignedToName = assigneeMap.get(mapped.assignedTo) ?? null
        }
        return mapped
      })

      return { items, total, page: input.page, pageSize: input.pageSize, totalPages }
    }),

  /** Fetch a single lead by ID. RLS ensures tenant isolation. */
  getById: permissionProcedure("leads.view")
    .input(z.object({ id: z.string().uuid() }))
    .query(async ({ ctx, input }): Promise<Lead> => {
      const sb = ctx.supabase
      const { data, error } = await sb
        .from("leads")
        .select(
          "id, company_id, customer_id, assigned_to, first_name, last_name, email, phone, move_type, requested_date, date_flexible, property_size, origin_address, origin_city, origin_state, origin_postal_code, origin_country, origin_floor, origin_has_elevator, origin_has_stairs, origin_parking_notes, dest_address, dest_city, dest_state, dest_postal_code, dest_country, dest_floor, dest_has_elevator, dest_has_stairs, dest_parking_notes, estimated_volume_cuft, estimated_distance_miles, status, lost_reason, converted_at, source, utm_source, utm_medium, utm_campaign, referrer_url, internal_notes, created_at, updated_at",
        )
        .eq("id", input.id)
        .is("deleted_at", null)
        .maybeSingle()

      if (error) {
        throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Failed to fetch lead" })
      }

      if (!data) {
        throw new TRPCError({ code: "NOT_FOUND", message: "Lead not found" })
      }

      const lead = mapLead(data as Record<string, unknown>)

      // Enrich with assignee name
      if (lead.assignedTo) {
        const { data: assignee } = await sb
          .from("profiles")
          .select("first_name, last_name")
          .eq("id", lead.assignedTo)
          .maybeSingle()
        if (assignee) {
          lead.assignedToName = `${assignee["first_name"] as string} ${assignee["last_name"] as string}`
        }
      }

      return lead
    }),

  /** Create a new lead. company_id is injected from the authenticated session, never from the client. */
  create: permissionProcedure("leads.create")
    .input(createLeadInput)
    .mutation(async ({ ctx, input }): Promise<{ id: string }> => {
      const sb = ctx.supabase

      const insertData: Record<string, unknown> = {
        company_id: ctx.companyId,
        first_name: input.firstName,
        last_name: input.lastName,
        email: nullIfEmpty(input.email),
        phone: nullIfEmpty(input.phone),
        move_type: input.moveType ?? null,
        requested_date: nullIfEmptyDate(input.requestedDate),
        date_flexible: input.dateFlexible,
        property_size: input.propertySize ?? null,
        origin_address: nullIfEmpty(input.originAddress),
        origin_city: nullIfEmpty(input.originCity),
        origin_state: nullIfEmpty(input.originState),
        origin_postal_code: nullIfEmpty(input.originPostalCode),
        origin_country: nullIfEmpty(input.originCountry) ?? "US",
        origin_floor: input.originFloor ?? null,
        origin_has_elevator: input.originHasElevator,
        origin_has_stairs: input.originHasStairs,
        origin_parking_notes: nullIfEmpty(input.originParkingNotes),
        dest_address: nullIfEmpty(input.destAddress),
        dest_city: nullIfEmpty(input.destCity),
        dest_state: nullIfEmpty(input.destState),
        dest_postal_code: nullIfEmpty(input.destPostalCode),
        dest_country: nullIfEmpty(input.destCountry) ?? "US",
        dest_floor: input.destFloor ?? null,
        dest_has_elevator: input.destHasElevator,
        dest_has_stairs: input.destHasStairs,
        dest_parking_notes: nullIfEmpty(input.destParkingNotes),
        estimated_volume_cuft: input.estimatedVolumeCuft ?? null,
        estimated_distance_miles: input.estimatedDistanceMiles ?? null,
        source: input.source ?? "manual",
        utm_source: nullIfEmpty(input.utmSource),
        utm_medium: nullIfEmpty(input.utmMedium),
        utm_campaign: nullIfEmpty(input.utmCampaign),
        referrer_url: nullIfEmpty(input.referrerUrl),
        internal_notes: nullIfEmpty(input.internalNotes),
        status: "new",
      }

      const { data, error } = await sb.from("leads").insert(insertData).select("id").single()

      if (error ?? !data) {
        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message: error?.message ?? "Failed to create lead",
        })
      }

      await writeActivityLog(ctx, {
        action: "lead.created",
        entityType: "lead",
        entityId: data["id"] as string,
        entityLabel: `${input.firstName} ${input.lastName}`,
      })

      return { id: data["id"] as string }
    }),

  /** Update a lead. company_id is never accepted from the client. */
  update: permissionProcedure("leads.edit")
    .input(updateLeadInput)
    .mutation(async ({ ctx, input }): Promise<{ id: string }> => {
      const sb = ctx.supabase
      const { id, ...rest } = input

      // Verify the lead exists and belongs to this tenant (RLS enforces this)
      const { data: existing, error: fetchError } = await sb
        .from("leads")
        .select("id, status, first_name, last_name")
        .eq("id", id)
        .is("deleted_at", null)
        .maybeSingle()

      if (fetchError) {
        throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Failed to verify lead" })
      }

      if (!existing) {
        throw new TRPCError({ code: "NOT_FOUND", message: "Lead not found" })
      }

      const updateData: Record<string, unknown> = {}

      // Only set fields that are present in the input
      if (rest.firstName !== undefined) updateData["first_name"] = rest.firstName
      if (rest.lastName !== undefined) updateData["last_name"] = rest.lastName
      if (rest.email !== undefined) updateData["email"] = nullIfEmpty(rest.email)
      if (rest.phone !== undefined) updateData["phone"] = nullIfEmpty(rest.phone)
      if (rest.moveType !== undefined) updateData["move_type"] = rest.moveType
      if (rest.requestedDate !== undefined)
        updateData["requested_date"] = nullIfEmptyDate(rest.requestedDate)
      if (rest.dateFlexible !== undefined) updateData["date_flexible"] = rest.dateFlexible
      if (rest.propertySize !== undefined) updateData["property_size"] = rest.propertySize
      if (rest.originAddress !== undefined)
        updateData["origin_address"] = nullIfEmpty(rest.originAddress)
      if (rest.originCity !== undefined) updateData["origin_city"] = nullIfEmpty(rest.originCity)
      if (rest.originState !== undefined) updateData["origin_state"] = nullIfEmpty(rest.originState)
      if (rest.originPostalCode !== undefined)
        updateData["origin_postal_code"] = nullIfEmpty(rest.originPostalCode)
      if (rest.originCountry !== undefined)
        updateData["origin_country"] = nullIfEmpty(rest.originCountry) ?? "US"
      if (rest.originFloor !== undefined) updateData["origin_floor"] = rest.originFloor
      if (rest.originHasElevator !== undefined)
        updateData["origin_has_elevator"] = rest.originHasElevator
      if (rest.originHasStairs !== undefined) updateData["origin_has_stairs"] = rest.originHasStairs
      if (rest.originParkingNotes !== undefined)
        updateData["origin_parking_notes"] = nullIfEmpty(rest.originParkingNotes)
      if (rest.destAddress !== undefined) updateData["dest_address"] = nullIfEmpty(rest.destAddress)
      if (rest.destCity !== undefined) updateData["dest_city"] = nullIfEmpty(rest.destCity)
      if (rest.destState !== undefined) updateData["dest_state"] = nullIfEmpty(rest.destState)
      if (rest.destPostalCode !== undefined)
        updateData["dest_postal_code"] = nullIfEmpty(rest.destPostalCode)
      if (rest.destCountry !== undefined)
        updateData["dest_country"] = nullIfEmpty(rest.destCountry) ?? "US"
      if (rest.destFloor !== undefined) updateData["dest_floor"] = rest.destFloor
      if (rest.destHasElevator !== undefined) updateData["dest_has_elevator"] = rest.destHasElevator
      if (rest.destHasStairs !== undefined) updateData["dest_has_stairs"] = rest.destHasStairs
      if (rest.destParkingNotes !== undefined)
        updateData["dest_parking_notes"] = nullIfEmpty(rest.destParkingNotes)
      if (rest.estimatedVolumeCuft !== undefined)
        updateData["estimated_volume_cuft"] = rest.estimatedVolumeCuft
      if (rest.estimatedDistanceMiles !== undefined)
        updateData["estimated_distance_miles"] = rest.estimatedDistanceMiles
      if (rest.source !== undefined) updateData["source"] = rest.source
      if (rest.utmSource !== undefined) updateData["utm_source"] = nullIfEmpty(rest.utmSource)
      if (rest.utmMedium !== undefined) updateData["utm_medium"] = nullIfEmpty(rest.utmMedium)
      if (rest.utmCampaign !== undefined) updateData["utm_campaign"] = nullIfEmpty(rest.utmCampaign)
      if (rest.referrerUrl !== undefined) updateData["referrer_url"] = nullIfEmpty(rest.referrerUrl)
      if (rest.internalNotes !== undefined)
        updateData["internal_notes"] = nullIfEmpty(rest.internalNotes)
      if (rest.assignedTo !== undefined) updateData["assigned_to"] = rest.assignedTo

      if (Object.keys(updateData).length === 0) {
        return { id }
      }

      const { error: updateError } = await sb.from("leads").update(updateData).eq("id", id)

      if (updateError) {
        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message: updateError.message ?? "Failed to update lead",
        })
      }

      await writeActivityLog(ctx, {
        action: "lead.updated",
        entityType: "lead",
        entityId: id,
        entityLabel: `${existing["first_name"] as string} ${existing["last_name"] as string}`,
      })

      return { id }
    }),

  /** Change a lead's status. Writes an audit entry for meaningful transitions. */
  updateStatus: permissionProcedure("leads.edit")
    .input(updateLeadStatusInput)
    .mutation(async ({ ctx, input }): Promise<{ id: string }> => {
      const sb = ctx.supabase

      const { data: existing, error: fetchError } = await sb
        .from("leads")
        .select("id, status, first_name, last_name")
        .eq("id", input.id)
        .is("deleted_at", null)
        .maybeSingle()

      if (fetchError) {
        throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Failed to verify lead" })
      }

      if (!existing) {
        throw new TRPCError({ code: "NOT_FOUND", message: "Lead not found" })
      }

      const oldStatus = existing["status"] as string
      const updateData: Record<string, unknown> = { status: input.status }

      if (input.status === "lost" && input.lostReason) {
        updateData["lost_reason"] = nullIfEmpty(input.lostReason)
      }

      // Mark conversion timestamp when lead is booked
      if (input.status === "booked" && oldStatus !== "booked") {
        updateData["converted_at"] = new Date().toISOString()
      }

      const { error: updateError } = await sb.from("leads").update(updateData).eq("id", input.id)

      if (updateError) {
        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message: updateError.message ?? "Failed to update lead status",
        })
      }

      await writeActivityLog(ctx, {
        action: "lead.status_changed",
        entityType: "lead",
        entityId: input.id,
        entityLabel: `${existing["first_name"] as string} ${existing["last_name"] as string}`,
        beforeState: { status: oldStatus },
        afterState: { status: input.status },
      })

      return { id: input.id }
    }),

  /** Soft-delete a lead by setting deleted_at. */
  delete: permissionProcedure("leads.delete")
    .input(deleteLeadInput)
    .mutation(async ({ ctx, input }): Promise<{ id: string }> => {
      const sb = ctx.supabase

      const { data: existing, error: fetchError } = await sb
        .from("leads")
        .select("id, first_name, last_name")
        .eq("id", input.id)
        .is("deleted_at", null)
        .maybeSingle()

      if (fetchError) {
        throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Failed to verify lead" })
      }

      if (!existing) {
        throw new TRPCError({ code: "NOT_FOUND", message: "Lead not found" })
      }

      const { error: updateError } = await sb
        .from("leads")
        .update({ deleted_at: new Date().toISOString() })
        .eq("id", input.id)

      if (updateError) {
        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message: "Failed to archive lead",
        })
      }

      await writeActivityLog(ctx, {
        action: "lead.archived",
        entityType: "lead",
        entityId: input.id,
        entityLabel: `${existing["first_name"] as string} ${existing["last_name"] as string}`,
      })

      return { id: input.id }
    }),
})
