import { z } from "zod"

const dateString = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Format JJJJ-MM-TT")
const timeString = z.string().regex(/^\d{2}:\d{2}$/, "Format HH:MM")

export const calendarRangeInput = z.object({ from: dateString, to: dateString })

/** Home visit (Hausbesuch / Besichtigung) or any own event. */
export const appointmentKindEnum = z.enum(["site_visit", "other"])

const appointmentFields = {
  title: z.string().trim().min(1, "Titel fehlt").max(200),
  kind: appointmentKindEnum,
  date: dateString,
  startTime: timeString,
  durationMinutes: z
    .number()
    .int()
    .min(15)
    .max(24 * 60),
  leadId: z.string().uuid().nullable().optional(),
  customerId: z.string().uuid().nullable().optional(),
  confirmed: z.boolean().default(false),
  notes: z.string().max(2000).nullable().optional(),
}

export const createAppointmentInput = z.object(appointmentFields)
export const updateAppointmentInput = z.object({ id: z.string().uuid(), ...appointmentFields })
export const appointmentIdInput = z.object({ id: z.string().uuid() })
export const setConfirmedInput = z.object({ id: z.string().uuid(), confirmed: z.boolean() })
export const leadIdInput = z.object({ leadId: z.string().uuid() })
export const customerIdInput = z.object({ customerId: z.string().uuid() })

export interface CalendarEvent {
  id: string
  source: "appointment" | "job"
  kind: "site_visit" | "other" | "job"
  title: string
  subtitle: string | null
  /** Swiss local date and times */
  date: string
  startTime: string | null
  endTime: string | null
  confirmed: boolean
  status: string
  href: string | null
  leadId: string | null
  customerId: string | null
  notes: string | null
  durationMinutes: number | null
}
