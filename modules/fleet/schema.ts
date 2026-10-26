import { z } from "zod"

export const vehicleTypeEnum = z.enum([
  "cargo_van",
  "box_truck_16ft",
  "box_truck_24ft",
  "box_truck_26ft",
  "semi_truck",
  "pickup_truck",
])
export const vehicleStatusEnum = z.enum(["available", "in_use", "maintenance", "retired"])

const optionalText = (max: number) => z.string().max(max).nullable().or(z.literal("")).optional()
const dateString = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Use YYYY-MM-DD")

const vehicleFields = {
  name: z.string().trim().min(1, "Name is required").max(80),
  type: vehicleTypeEnum,
  licensePlate: optionalText(20),
  make: optionalText(60),
  model: optionalText(60),
  year: z.number().int().min(1980).max(2100).nullable().optional(),
  capacityM3: z.number().positive().max(500).nullable().optional(),
  payloadKg: z.number().int().positive().max(60_000).nullable().optional(),
  status: vehicleStatusEnum.default("available"),
  nextInspectionOn: dateString.nullable().optional(),
  insuranceExpiry: dateString.nullable().optional(),
  notes: optionalText(2000),
}

export const createVehicleInput = z.object(vehicleFields)
export const updateVehicleInput = z.object({ id: z.string().uuid(), ...vehicleFields })
export type CreateVehicleInput = z.infer<typeof createVehicleInput>
export const idInput = z.object({ id: z.string().uuid() })

export interface Vehicle {
  id: string
  name: string
  type: z.infer<typeof vehicleTypeEnum>
  licensePlate: string | null
  make: string | null
  model: string | null
  year: number | null
  capacityM3: number | null
  payloadKg: number | null
  status: z.infer<typeof vehicleStatusEnum>
  nextInspectionOn: string | null
  insuranceExpiry: string | null
  notes: string | null
}
