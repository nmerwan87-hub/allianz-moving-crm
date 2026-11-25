/**
 * Swiss local time ↔ UTC. Calendar entries are entered and shown in
 * Europe/Zurich; the database stores timestamptz.
 */

const TZ = "Europe/Zurich"

function offsetMinutes(utc: Date): number {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: TZ,
    hourCycle: "h23",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  }).formatToParts(utc)
  const get = (t: string) => Number(parts.find((p) => p.type === t)!.value)
  const asUtc = Date.UTC(get("year"), get("month") - 1, get("day"), get("hour"), get("minute"))
  return Math.round((asUtc - utc.getTime()) / 60_000)
}

/** "2026-10-29", "11:00" (Zurich) → ISO timestamp in UTC. */
export function zurichToIso(date: string, time: string): string {
  const naive = new Date(`${date}T${time}:00Z`)
  const first = new Date(naive.getTime() - offsetMinutes(naive) * 60_000)
  // Second pass settles the hour around a daylight-saving change
  const exact = new Date(naive.getTime() - offsetMinutes(first) * 60_000)
  return exact.toISOString()
}

/** ISO timestamp → { date: "2026-10-29", time: "11:00" } in Zurich. */
export function isoToZurich(iso: string): { date: string; time: string } {
  const d = new Date(iso)
  const date = new Intl.DateTimeFormat("en-CA", { timeZone: TZ }).format(d)
  const time = new Intl.DateTimeFormat("en-GB", {
    timeZone: TZ,
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).format(d)
  return { date, time }
}

export function addMinutesToTime(time: string, minutes: number): string {
  const [h, m] = time.split(":").map(Number)
  const total = Math.min(h! * 60 + m! + minutes, 23 * 60 + 59)
  return `${String(Math.floor(total / 60)).padStart(2, "0")}:${String(total % 60).padStart(2, "0")}`
}
