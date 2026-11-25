// Public API for the calendar (appointments, home visits, jobs as events).
// Client components import from here; the router is imported by lib/trpc/router.ts directly.

export type { CalendarEvent } from "./schema"
export { appointmentKindEnum, createAppointmentInput } from "./schema"
