import { TRPCError } from "@trpc/server"
import { createTRPCRouter, permissionProcedure } from "@/lib/trpc/init"
import { writeActivityLog } from "@/lib/audit/activity"
import {
  createVehicleInput,
  updateVehicleInput,
  idInput,
  type CreateVehicleInput,
  type Vehicle,
} from "./schema"

const COLUMNS =
  "id, name, type, license_plate, make, model, year, capacity_m3, payload_kg, status, next_inspection_on, insurance_expiry, notes"

function textOrNull(v: string | null | undefined): string | null {
  const trimmed = v?.trim()
  return trimmed ? trimmed : null
}

function mapVehicle(r: Record<string, unknown>): Vehicle {
  return {
    id: r["id"] as string,
    name: r["name"] as string,
    type: r["type"] as Vehicle["type"],
    licensePlate: r["license_plate"] as string | null,
    make: r["make"] as string | null,
    model: r["model"] as string | null,
    year: r["year"] as number | null,
    capacityM3: r["capacity_m3"] === null ? null : Number(r["capacity_m3"]),
    payloadKg: r["payload_kg"] as number | null,
    status: r["status"] as Vehicle["status"],
    nextInspectionOn: r["next_inspection_on"] as string | null,
    insuranceExpiry: r["insurance_expiry"] as string | null,
    notes: r["notes"] as string | null,
  }
}

function toRow(input: CreateVehicleInput) {
  return {
    name: input.name,
    type: input.type,
    // "zh 123 456" → "ZH 123456"
    license_plate:
      textOrNull(input.licensePlate)
        ?.toUpperCase()
        .replace(/^([A-Z]{2})\s*/, "$1 ")
        .replace(/(\d)\s+(?=\d)/g, "$1") ?? null,
    make: textOrNull(input.make),
    model: textOrNull(input.model),
    year: input.year ?? null,
    capacity_m3: input.capacityM3 ?? null,
    payload_kg: input.payloadKg ?? null,
    status: input.status,
    next_inspection_on: input.nextInspectionOn ?? null,
    insurance_expiry: input.insuranceExpiry ?? null,
    notes: textOrNull(input.notes),
  }
}

export const fleetRouter = createTRPCRouter({
  list: permissionProcedure("vehicles.view").query(async ({ ctx }): Promise<Vehicle[]> => {
    const { data, error } = await ctx.supabase
      .from("vehicles")
      .select(COLUMNS)
      .is("deleted_at", null)
      .order("name")
    if (error) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" })
    return (data ?? []).map((r) => mapVehicle(r as Record<string, unknown>))
  }),

  create: permissionProcedure("vehicles.create")
    .input(createVehicleInput)
    .mutation(async ({ ctx, input }) => {
      if (!ctx.companyId) throw new TRPCError({ code: "UNAUTHORIZED" })
      const { data, error } = await ctx.supabase
        .from("vehicles")
        .insert({ ...toRow(input), company_id: ctx.companyId })
        .select("id")
        .single()
      if (error || !data)
        throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Failed to save" })
      await writeActivityLog(ctx, {
        action: "vehicle.created",
        entityType: "vehicle",
        entityId: data.id as string,
        entityLabel: input.name,
      })
      return { id: data.id as string }
    }),

  update: permissionProcedure("vehicles.edit")
    .input(updateVehicleInput)
    .mutation(async ({ ctx, input }) => {
      const { id, ...fields } = input
      const { data, error } = await ctx.supabase
        .from("vehicles")
        .update(toRow(fields))
        .eq("id", id)
        .is("deleted_at", null)
        .select("id")
      if (error) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Failed to save" })
      if (!data?.length) throw new TRPCError({ code: "NOT_FOUND", message: "Vehicle not found" })
      await writeActivityLog(ctx, {
        action: "vehicle.updated",
        entityType: "vehicle",
        entityId: id,
        entityLabel: fields.name,
      })
      return { id }
    }),

  archive: permissionProcedure("vehicles.delete")
    .input(idInput)
    .mutation(async ({ ctx, input }) => {
      const { data, error } = await ctx.supabase
        .from("vehicles")
        .update({ deleted_at: new Date().toISOString(), status: "retired" })
        .eq("id", input.id)
        .is("deleted_at", null)
        .select("name")
      if (error) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" })
      if (!data?.length) throw new TRPCError({ code: "NOT_FOUND", message: "Vehicle not found" })
      await writeActivityLog(ctx, {
        action: "vehicle.archived",
        entityType: "vehicle",
        entityId: input.id,
        entityLabel: data[0]!.name as string,
      })
      return { id: input.id }
    }),
})
