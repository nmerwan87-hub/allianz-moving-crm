import { z } from "zod"

export const employeeRoleEnum = z.enum(["driver", "mover", "foreman", "specialist"])
export const employeeStatusEnum = z.enum(["active", "inactive", "terminated"])
export const employmentTypeEnum = z.enum(["full_time", "part_time", "contractor"])
export const absenceKindEnum = z.enum(["vacation", "sick", "other"])

const optionalText = (max: number) => z.string().max(max).nullable().or(z.literal("")).optional()
const dateString = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Use YYYY-MM-DD")

const employeeFields = {
  firstName: z.string().trim().min(1, "First name is required").max(100),
  lastName: z.string().trim().min(1, "Last name is required").max(100),
  email: z.string().trim().email("Invalid email").max(255).nullable().or(z.literal("")).optional(),
  phone: optionalText(50),
  role: employeeRoleEnum,
  status: employeeStatusEnum.default("active"),
  employmentType: employmentTypeEnum.nullable().optional(),
  hourlyCostCents: z.number().int().min(0).max(100_000).nullable().optional(),
  driverLicenseClass: optionalText(20),
  driverLicenseExpiry: dateString.nullable().optional(),
  skills: z.array(z.string().trim().min(1).max(40)).max(20).default([]),
  notes: optionalText(2000),
}

export const createEmployeeInput = z.object(employeeFields)
export const updateEmployeeInput = z.object({ id: z.string().uuid(), ...employeeFields })
export type CreateEmployeeInput = z.infer<typeof createEmployeeInput>

export const createAbsenceInput = z
  .object({
    employeeId: z.string().uuid(),
    kind: absenceKindEnum,
    startsOn: dateString,
    endsOn: dateString,
    note: optionalText(500),
  })
  .refine((a) => a.endsOn >= a.startsOn, {
    path: ["endsOn"],
    message: "End must not be before start",
  })

export const absenceRangeInput = z.object({ from: dateString, to: dateString })
export const idInput = z.object({ id: z.string().uuid() })

export interface Employee {
  id: string
  firstName: string
  lastName: string
  name: string
  email: string | null
  phone: string | null
  role: z.infer<typeof employeeRoleEnum>
  status: z.infer<typeof employeeStatusEnum>
  employmentType: z.infer<typeof employmentTypeEnum> | null
  hourlyCostCents: number | null
  driverLicenseClass: string | null
  driverLicenseExpiry: string | null
  skills: string[]
  notes: string | null
}

export interface Absence {
  id: string
  employeeId: string
  employeeName: string
  kind: z.infer<typeof absenceKindEnum>
  startsOn: string
  endsOn: string
  note: string | null
}
