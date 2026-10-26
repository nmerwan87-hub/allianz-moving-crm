import { z } from "zod"
import { moveTypeEnum } from "@/modules/leads/interface"

export const jobStatusEnum = z.enum([
  "scheduled",
  "confirmed",
  "in_progress",
  "completed",
  "cancelled",
  "on_hold",
])

const optionalText = (max: number) => z.string().max(max).nullable().or(z.literal("")).optional()
const dateString = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Use YYYY-MM-DD")
const timeString = z.string().regex(/^\d{2}:\d{2}$/, "Use HH:MM")

export const listJobsInput = z.object({
  from: dateString,
  to: dateString,
  includeClosed: z.boolean().default(true),
})

export const createJobInput = z.object({
  customerId: z.string().uuid(),
  moveType: moveTypeEnum,
  scheduledDate: dateString,
  startTime: timeString.nullable().optional(),
  durationHours: z.number().positive().max(24).nullable().optional(),
  crewSizeRequired: z.number().int().min(1).max(30).nullable().optional(),
  originAddress: z.string().trim().min(1, "From address is required").max(200),
  originPostalCode: optionalText(20),
  originCity: z.string().trim().min(1, "From city is required").max(100),
  destAddress: z.string().trim().min(1, "To address is required").max(200),
  destPostalCode: optionalText(20),
  destCity: z.string().trim().min(1, "To city is required").max(100),
  specialInstructions: optionalText(3000),
})

export const scheduleJobInput = z.object({
  id: z.string().uuid(),
  scheduledDate: dateString,
  startTime: timeString.nullable().optional(),
  durationHours: z.number().positive().max(24).nullable().optional(),
  crewSizeRequired: z.number().int().min(1).max(30).nullable().optional(),
  specialInstructions: optionalText(3000),
  internalNotes: optionalText(3000),
})

export const assignJobInput = z.object({
  id: z.string().uuid(),
  employeeIds: z.array(z.string().uuid()).max(30),
  leadEmployeeId: z.string().uuid().nullable().optional(),
  vehicleIds: z.array(z.string().uuid()).max(10),
  /** Save despite conflicts (the dispatcher decided) */
  force: z.boolean().default(false),
})

export const transitionJobInput = z.object({
  id: z.string().uuid(),
  to: jobStatusEnum,
  reason: optionalText(500),
  completionNotes: optionalText(3000),
})

export const idInput = z.object({ id: z.string().uuid() })

export interface ResourceConflict {
  resourceType: "employee" | "vehicle"
  resourceId: string
  resourceName: string
  conflict:
    | "employee_double_booked"
    | "employee_absent"
    | "employee_inactive"
    | "vehicle_double_booked"
    | "vehicle_unavailable"
    | "vehicle_inspection_due"
  otherJobId: string | null
  otherJobNumber: string | null
}

export interface JobCard {
  id: string
  jobNumber: string
  status: z.infer<typeof jobStatusEnum>
  scheduledDate: string
  startTime: string | null
  durationHours: number | null
  crewSizeRequired: number | null
  customerName: string
  originCity: string
  destCity: string
  totalAmountCents: number
  crew: Array<{ id: string; name: string; role: "lead" | "mover" }>
  vehicles: Array<{ id: string; name: string }>
  conflictCount: number
}

export interface Job extends JobCard {
  customerId: string
  quoteId: string | null
  quoteNumber: string | null
  moveType: z.infer<typeof moveTypeEnum>
  originAddress: string
  originPostalCode: string | null
  originFloor: number | null
  originHasElevator: boolean
  destAddress: string
  destPostalCode: string | null
  destFloor: number | null
  destHasElevator: boolean
  depositAmountCents: number
  actualStartAt: string | null
  actualEndAt: string | null
  specialInstructions: string | null
  internalNotes: string | null
  completionNotes: string | null
  cancellationReason: string | null
  conflicts: ResourceConflict[]
}
