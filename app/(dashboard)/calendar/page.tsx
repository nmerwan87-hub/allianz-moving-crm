"use client"

import { useMemo, useState } from "react"
import { useRouter } from "next/navigation"
import { CheckCircle2, ChevronLeft, ChevronRight, Home, Plus, Truck } from "lucide-react"
import { trpc } from "@/lib/trpc/client"
import { Button } from "@/app/(dashboard)/_components/ui/button"
import { Skeleton } from "@/app/(dashboard)/_components/ui/skeleton"
import { AppointmentDialog } from "@/app/(dashboard)/_components/appointment-dialog"
import { useHasPermission } from "@/app/(dashboard)/_lib/permissions"
import { cn } from "@/app/(dashboard)/_lib/cn"
import type { CalendarEvent } from "@/modules/calendar/interface"
import { addDays, isoDate, mondayOf } from "../jobs/_lib/labels"
import { eventClass } from "./_lib/event-style"

type View = "day" | "week" | "month"

const MONTHS = [
  "Januar",
  "Februar",
  "März",
  "April",
  "Mai",
  "Juni",
  "Juli",
  "August",
  "September",
  "Oktober",
  "November",
  "Dezember",
]
const WEEKDAYS = ["Montag", "Dienstag", "Mittwoch", "Donnerstag", "Freitag", "Samstag", "Sonntag"]

function weekdayName(d: Date) {
  return WEEKDAYS[(d.getDay() + 6) % 7]!
}

function EventIcon({ e }: { e: CalendarEvent }) {
  if (e.kind === "job") return <Truck className="h-3.5 w-3.5 shrink-0" />
  if (e.kind === "site_visit") return <Home className="h-3.5 w-3.5 shrink-0" />
  return null
}

/**
 * Calendar (Bixin: Kalender) — day, week and month view of home visits,
 * own appointments and planned jobs. New appointments from "+ Neu" or by
 * clicking a day in the month view.
 */
export default function CalendarPage() {
  const router = useRouter()
  const canEdit = useHasPermission("leads.edit")
  const [view, setView] = useState<View>("month")
  const [anchor, setAnchor] = useState(() => new Date())
  const [dialog, setDialog] = useState<{ event?: CalendarEvent; date?: string } | null>(null)
  const today = isoDate(new Date())

  const range = useMemo(() => {
    if (view === "day") return { from: anchor, to: anchor }
    if (view === "week") {
      const from = mondayOf(anchor)
      return { from, to: addDays(from, 6) }
    }
    const first = new Date(anchor.getFullYear(), anchor.getMonth(), 1)
    const from = mondayOf(first)
    const last = new Date(anchor.getFullYear(), anchor.getMonth() + 1, 0)
    const to = addDays(mondayOf(last), 6)
    return { from, to }
  }, [view, anchor])

  const events = trpc.calendar.events.useQuery({ from: isoDate(range.from), to: isoDate(range.to) })
  const byDay = useMemo(() => {
    const map = new Map<string, CalendarEvent[]>()
    for (const e of events.data ?? []) {
      if (!map.has(e.date)) map.set(e.date, [])
      map.get(e.date)!.push(e)
    }
    return map
  }, [events.data])

  function move(step: -1 | 1) {
    const d = new Date(anchor)
    if (view === "day") d.setDate(d.getDate() + step)
    else if (view === "week") d.setDate(d.getDate() + step * 7)
    else d.setMonth(d.getMonth() + step, 1)
    setAnchor(d)
  }

  function openEvent(e: CalendarEvent) {
    if (e.source === "job") router.push(e.href!)
    else setDialog({ event: e })
  }

  const title =
    view === "month"
      ? `${MONTHS[anchor.getMonth()]} ${anchor.getFullYear()}`
      : view === "week"
        ? `${range.from.getDate()}. ${MONTHS[range.from.getMonth()]!.slice(0, 3)} – ${range.to.getDate()}. ${MONTHS[range.to.getMonth()]!.slice(0, 3)} ${range.to.getFullYear()}`
        : `${weekdayName(anchor)}, ${anchor.getDate()}. ${MONTHS[anchor.getMonth()]} ${anchor.getFullYear()}`

  const days: Date[] = []
  for (let d = new Date(range.from); d <= range.to; d = addDays(d, 1)) days.push(d)

  return (
    <div>
      <div className="mb-4 flex flex-wrap items-center gap-3">
        <h1 className="text-text-primary text-[length:var(--text-display-md)] font-semibold">
          Kalender
        </h1>
        {canEdit && (
          <Button className="ml-auto" onClick={() => setDialog({ date: isoDate(anchor) })}>
            <Plus className="h-4 w-4" />
            Neu
          </Button>
        )}
      </div>

      <div className="border-surface-divider bg-surface-raised rounded-[var(--radius-lg)] border">
        <div className="border-surface-divider flex flex-wrap items-center gap-3 border-b px-4 py-2.5">
          <div className="flex gap-1">
            {(
              [
                ["day", "Tag"],
                ["week", "Woche"],
                ["month", "Monat"],
              ] as const
            ).map(([v, label]) => (
              <button
                key={v}
                type="button"
                onClick={() => setView(v)}
                className={cn(
                  "rounded-[var(--radius-md)] px-3 py-1.5 text-sm",
                  view === v
                    ? "bg-signal-600 text-text-inverse font-medium"
                    : "text-text-secondary hover:bg-surface-sunken",
                )}
              >
                {label}
              </button>
            ))}
          </div>
          <span className="text-text-primary ml-auto text-sm font-semibold">{title}</span>
          <div className="flex gap-1">
            <Button variant="secondary" size="icon" aria-label="Zurück" onClick={() => move(-1)}>
              <ChevronLeft className="h-4 w-4" />
            </Button>
            <Button variant="secondary" size="sm" onClick={() => setAnchor(new Date())}>
              Heute
            </Button>
            <Button variant="secondary" size="icon" aria-label="Weiter" onClick={() => move(1)}>
              <ChevronRight className="h-4 w-4" />
            </Button>
          </div>
        </div>

        {events.isLoading ? (
          <Skeleton className="m-4 h-96" />
        ) : view === "month" ? (
          <div>
            <div className="border-surface-divider text-text-muted grid grid-cols-7 border-b text-center text-xs">
              {WEEKDAYS.map((w) => (
                <div key={w} className="py-2">
                  {w.slice(0, 2)}
                </div>
              ))}
            </div>
            <div className="grid grid-cols-7">
              {days.map((d) => {
                const key = isoDate(d)
                const list = byDay.get(key) ?? []
                const otherMonth = d.getMonth() !== anchor.getMonth()
                const weekend = d.getDay() === 0 || d.getDay() === 6
                return (
                  <div
                    key={key}
                    onClick={() => canEdit && setDialog({ date: key })}
                    className={cn(
                      "border-surface-divider min-h-24 cursor-pointer border-r border-b p-1.5 last:border-r-0 [&:nth-child(7n)]:border-r-0",
                      otherMonth && "bg-surface-sunken/60",
                      key === today && "bg-success-100/50",
                    )}
                  >
                    <div
                      className={cn(
                        "mb-1 text-xs",
                        otherMonth
                          ? "text-text-muted"
                          : weekend
                            ? "text-danger-700"
                            : "text-text-secondary",
                        key === today && "text-success-700 text-sm font-semibold",
                      )}
                    >
                      {d.getDate()}
                    </div>
                    <div className="space-y-1">
                      {list.slice(0, 3).map((e) => (
                        <button
                          key={`${e.source}-${e.id}`}
                          type="button"
                          onClick={(ev) => {
                            ev.stopPropagation()
                            openEvent(e)
                          }}
                          className={cn(
                            "flex w-full items-center gap-1 truncate rounded border px-1.5 py-0.5 text-left text-[11px]",
                            eventClass(e),
                          )}
                        >
                          <EventIcon e={e} />
                          <span className="truncate">
                            {e.startTime ? `${e.startTime} ` : ""}
                            {e.title}
                          </span>
                        </button>
                      ))}
                      {list.length > 3 && (
                        <button
                          type="button"
                          onClick={(ev) => {
                            ev.stopPropagation()
                            setAnchor(d)
                            setView("day")
                          }}
                          className="text-text-muted text-[11px] hover:underline"
                        >
                          +{list.length - 3} weitere
                        </button>
                      )}
                    </div>
                  </div>
                )
              })}
            </div>
          </div>
        ) : (
          <ul className="divide-surface-divider divide-y">
            {days.map((d) => {
              const key = isoDate(d)
              const list = byDay.get(key) ?? []
              return (
                <li key={key} className="flex gap-4 px-4 py-3">
                  <div className="w-32 shrink-0">
                    <p
                      className={cn(
                        "text-sm font-semibold",
                        key === today ? "text-success-700" : "text-text-primary",
                      )}
                    >
                      {weekdayName(d)}
                    </p>
                    <p className="text-text-muted text-xs">
                      {d.getDate()}. {MONTHS[d.getMonth()]}
                    </p>
                  </div>
                  <div className="min-w-0 flex-1 space-y-2">
                    {list.length === 0 && (
                      <p className="text-text-muted py-1 text-sm">Keine Termine</p>
                    )}
                    {list.map((e) => (
                      <button
                        key={`${e.source}-${e.id}`}
                        type="button"
                        onClick={() => openEvent(e)}
                        className={cn(
                          "flex w-full items-center gap-3 rounded-[var(--radius-md)] border px-3 py-2 text-left",
                          eventClass(e),
                        )}
                      >
                        <EventIcon e={e} />
                        <div className="min-w-0 flex-1">
                          <p className="truncate text-sm font-medium">{e.title}</p>
                          <p className="truncate text-xs opacity-80">
                            {e.startTime
                              ? `${e.startTime}${e.endTime ? `–${e.endTime}` : ""}`
                              : "ganztags"}
                            {e.subtitle ? ` · ${e.subtitle}` : ""}
                          </p>
                        </div>
                        {e.confirmed && <CheckCircle2 className="h-4 w-4 shrink-0" />}
                      </button>
                    ))}
                  </div>
                </li>
              )
            })}
          </ul>
        )}
      </div>

      <div className="text-text-muted mt-3 flex flex-wrap gap-4 text-xs">
        <span className="flex items-center gap-1.5">
          <span className="h-3 w-3 rounded border border-emerald-300 bg-emerald-100" /> Auftrag
          bestätigt
        </span>
        <span className="flex items-center gap-1.5">
          <span className="bg-surface-sunken border-surface-divider h-3 w-3 rounded border" />{" "}
          Auftrag geplant
        </span>
        <span className="flex items-center gap-1.5">
          <span className="h-3 w-3 rounded border border-violet-300 bg-violet-100" /> Hausbesuch
        </span>
        <span className="flex items-center gap-1.5">
          <span className="h-3 w-3 rounded border border-sky-300 bg-sky-100" /> Termin
        </span>
      </div>

      {dialog && (
        <AppointmentDialog
          event={dialog.event}
          defaults={dialog.date ? { date: dialog.date, kind: "other" } : undefined}
          onClose={() => setDialog(null)}
        />
      )}
    </div>
  )
}
