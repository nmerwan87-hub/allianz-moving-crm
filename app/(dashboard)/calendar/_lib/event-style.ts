import type { CalendarEvent } from "@/modules/calendar/interface"

/** Colour by meaning: jobs green (confirmed) or grey, home visits violet, own events blue. */
export function eventClass(e: CalendarEvent): string {
  if (e.kind === "job")
    return e.confirmed
      ? "bg-emerald-100 text-emerald-800 border-emerald-300"
      : "bg-surface-sunken text-text-secondary border-surface-divider"
  if (e.kind === "site_visit") return "bg-violet-100 text-violet-800 border-violet-300"
  return "bg-sky-100 text-sky-800 border-sky-300"
}
