export const JOB_STATUS_LABELS: Record<string, string> = {
  scheduled: "Planned",
  confirmed: "Confirmed",
  in_progress: "In progress",
  completed: "Completed",
  cancelled: "Cancelled",
  on_hold: "On hold",
}

export const JOB_STATUS_BADGE: Record<
  string,
  "default" | "success" | "warning" | "danger" | "info" | "neutral"
> = {
  scheduled: "neutral",
  confirmed: "info",
  in_progress: "warning",
  completed: "success",
  cancelled: "danger",
  on_hold: "warning",
}

export const CONFLICT_LABELS: Record<string, string> = {
  employee_double_booked: "already on another job",
  employee_absent: "absent",
  employee_inactive: "not active",
  vehicle_double_booked: "already on another job",
  vehicle_unavailable: "in maintenance / not available",
  vehicle_inspection_due: "inspection (MFK) overdue",
}

export const EMPLOYEE_ROLE_LABELS: Record<string, string> = {
  foreman: "Foreman",
  mover: "Mover",
  driver: "Driver",
  specialist: "Specialist",
}

export const VEHICLE_TYPE_LABELS: Record<string, string> = {
  cargo_van: "Delivery van",
  pickup_truck: "Pickup",
  box_truck_16ft: "Truck 3.5 t",
  box_truck_24ft: "Truck 7.5 t",
  box_truck_26ft: "Truck 12 t",
  semi_truck: "Truck 18 t+",
}

/** Local calendar date as YYYY-MM-DD (no UTC shift). */
export function isoDate(date: Date): string {
  const y = date.getFullYear()
  const m = String(date.getMonth() + 1).padStart(2, "0")
  const d = String(date.getDate()).padStart(2, "0")
  return `${y}-${m}-${d}`
}

export function mondayOf(date: Date): Date {
  const d = new Date(date.getFullYear(), date.getMonth(), date.getDate())
  const offset = (d.getDay() + 6) % 7
  d.setDate(d.getDate() - offset)
  return d
}

export function addDays(date: Date, days: number): Date {
  const d = new Date(date)
  d.setDate(d.getDate() + days)
  return d
}

const WEEKDAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"]

export function dayHeading(date: Date): string {
  return `${WEEKDAYS[(date.getDay() + 6) % 7]} ${String(date.getDate()).padStart(2, "0")}.${String(date.getMonth() + 1).padStart(2, "0")}.`
}

export function formatDate(value: string | null | undefined): string {
  if (!value) return "—"
  const [y, m, d] = value.slice(0, 10).split("-")
  return `${d}.${m}.${y}`
}
