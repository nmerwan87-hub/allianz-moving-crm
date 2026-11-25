"use client"

import { useState } from "react"
import Link from "next/link"
import { CalendarDays, ExternalLink, Home, Plus, Truck } from "lucide-react"
import { trpc } from "@/lib/trpc/client"
import { formatChf } from "@/lib/format/money"
import { Button } from "@/app/(dashboard)/_components/ui/button"
import { Badge } from "@/app/(dashboard)/_components/ui/badge"
import { Input } from "@/app/(dashboard)/_components/ui/field"
import { Skeleton } from "@/app/(dashboard)/_components/ui/skeleton"
import { ErrorState } from "@/app/(dashboard)/_components/ui/error-state"
import { useHasPermission } from "@/app/(dashboard)/_lib/permissions"
import { cn } from "@/app/(dashboard)/_lib/cn"
import type { CalendarEvent } from "@/modules/calendar/interface"
import { addDays, isoDate } from "../jobs/_lib/labels"
import { eventClass } from "../calendar/_lib/event-style"
import { QUOTE_STATUS_BADGE, QUOTE_STATUS_LABELS } from "../quotes/_lib/labels"
import { NewQuoteDialog } from "../quotes/_components/new-quote-dialog"

const WEEKDAYS = ["Sonntag", "Montag", "Dienstag", "Mittwoch", "Donnerstag", "Freitag", "Samstag"]
const MONTHS = ["Jan", "Feb", "Mär", "Apr", "Mai", "Jun", "Jul", "Aug", "Sep", "Okt", "Nov", "Dez"]

function dayHeading(date: string, today: string): string {
  const d = new Date(`${date}T12:00:00Z`)
  const label = `${WEEKDAYS[d.getUTCDay()]}, ${d.getUTCDate()}. ${MONTHS[d.getUTCMonth()]}`
  if (date === today) return `Heute · ${label}`
  if (date === isoDate(addDays(new Date(`${today}T12:00:00`), 1))) return `Morgen · ${label}`
  return label
}

const ENTITY_ROUTES: Record<string, { base: string; label: string }> = {
  lead: { base: "/leads", label: "Anfrage öffnen" },
  customer: { base: "/customers", label: "Kunde öffnen" },
  quote: { base: "/quotes", label: "Offerte öffnen" },
  job: { base: "/jobs", label: "Auftrag öffnen" },
  invoice: { base: "/invoices", label: "Rechnung öffnen" },
  vehicle: { base: "/vehicles", label: "Fahrzeuge öffnen" },
  employee: { base: "/employees", label: "Mitarbeitende öffnen" },
}

function taskLink(entityType: string | null, entityId: string | null) {
  if (!entityType || !entityId) return null
  const route = ENTITY_ROUTES[entityType]
  if (!route) return null
  const href =
    entityType === "vehicle" || entityType === "employee" ? route.base : `${route.base}/${entityId}`
  return { href, label: route.label }
}

const PERIODS: Array<[string, number | "year"]> = [
  ["7 Tage", 7],
  ["30 Tage", 30],
  ["Dieses Jahr", "year"],
]

/**
 * Start page (Bixin: Übersicht): statistics for a period and open tasks on
 * the left, the next appointments and open quotes on the right.
 */
export default function DashboardPage() {
  const session = trpc.iam.session.me.useQuery()
  const overview = trpc.dashboard.overview.useQuery()
  const canCreateQuote = useHasPermission("quotes.create")
  const canSeeCalendar = useHasPermission("leads.view")
  const canSeeJobs = useHasPermission("jobs.view")
  const canSeeInvoices = useHasPermission("invoices.view")
  const firstName = session.data?.profile.firstName
  const [newQuoteOpen, setNewQuoteOpen] = useState(false)

  const [range, setRange] = useState(() => {
    const now = new Date()
    return { from: isoDate(addDays(now, -6)), to: isoDate(now) }
  })
  const stats = trpc.dashboard.stats.useQuery(range, { enabled: range.from <= range.to })

  const [upcoming] = useState(() => {
    const now = new Date()
    return { from: isoDate(now), to: isoDate(addDays(now, 14)) }
  })
  const events = trpc.calendar.events.useQuery(upcoming, {
    enabled: canSeeCalendar || canSeeJobs,
  })

  if (overview.isError) {
    return (
      <ErrorState
        title="Übersicht konnte nicht geladen werden"
        message="Lade die Seite bitte neu."
      />
    )
  }

  const data = overview.data
  const today = data?.today ?? upcoming.from
  const nextEvents = (events.data ?? []).slice(0, 8)
  const byDay = new Map<string, CalendarEvent[]>()
  for (const e of nextEvents) byDay.set(e.date, [...(byDay.get(e.date) ?? []), e])

  function choosePeriod(p: number | "year") {
    const now = new Date()
    setRange({
      from: p === "year" ? `${now.getFullYear()}-01-01` : isoDate(addDays(now, -(p - 1))),
      to: isoDate(now),
    })
  }

  return (
    <div>
      <div className="mb-6 flex flex-wrap items-center gap-3">
        <h1 className="text-text-primary text-[length:var(--text-display-lg)] font-semibold">
          {firstName ? `Willkommen, ${firstName}` : "Willkommen"}
        </h1>
        {canCreateQuote && (
          <Button className="ml-auto" onClick={() => setNewQuoteOpen(true)}>
            <Plus className="h-4 w-4" />
            Neue Offerte
          </Button>
        )}
      </div>

      <div className="grid gap-5 lg:grid-cols-2">
        <div className="space-y-5">
          {/* Statistiken */}
          <Panel title="Statistiken">
            <div className="mb-4 flex flex-wrap items-center gap-2">
              <Input
                type="date"
                aria-label="Von"
                className="h-8 w-36 text-xs"
                value={range.from}
                onChange={(e) =>
                  e.target.value && setRange((r) => ({ ...r, from: e.target.value }))
                }
              />
              <span className="text-text-muted text-xs">bis</span>
              <Input
                type="date"
                aria-label="Bis"
                className="h-8 w-36 text-xs"
                value={range.to}
                onChange={(e) => e.target.value && setRange((r) => ({ ...r, to: e.target.value }))}
              />
              <div className="flex gap-1">
                {PERIODS.map(([label, p]) => (
                  <button
                    key={label}
                    type="button"
                    onClick={() => choosePeriod(p)}
                    className="text-text-secondary hover:bg-surface-sunken rounded-full px-2.5 py-1 text-xs"
                  >
                    {label}
                  </button>
                ))}
              </div>
            </div>
            <dl className="grid grid-cols-2 gap-x-6 gap-y-4">
              <Stat label="Anfragen" value={stats.data?.inquiries} href="/leads" />
              <Stat label="Gesendete Offerten" value={stats.data?.quotesSent} href="/quotes" />
              <Stat label="Gebuchte Offerten" value={stats.data?.quotesBooked} href="/quotes" />
              <Stat label="Ausstehende Offerten" value={stats.data?.quotesOpen} href="/quotes" />
              <Stat
                label="Buchungsvolumen"
                value={stats.data ? formatChf(stats.data.bookingVolumeCents) : undefined}
              />
              {canSeeInvoices && (
                <Stat
                  label="Zahlungseingang"
                  value={stats.data ? formatChf(stats.data.paymentsCents) : undefined}
                  href="/invoices"
                />
              )}
            </dl>
            {canSeeInvoices && data && (
              <div className="border-surface-divider mt-4 flex flex-wrap gap-x-6 gap-y-1 border-t pt-3 text-sm">
                <Link href="/invoices" className="text-text-secondary hover:underline">
                  Offene Rechnungen{" "}
                  <span className="text-text-primary font-semibold tabular-nums">
                    {formatChf(data.money.openCents)}
                  </span>
                </Link>
                <Link
                  href="/invoices"
                  className={cn(
                    "hover:underline",
                    data.money.overdueCents > 0 ? "text-danger-700" : "text-text-secondary",
                  )}
                >
                  Überfällig{" "}
                  <span className="font-semibold tabular-nums">
                    {formatChf(data.money.overdueCents)}
                  </span>
                </Link>
              </div>
            )}
          </Panel>

          {/* Offene Aufgaben */}
          <Panel title="Offene Aufgaben">
            {!data ? (
              <Loading />
            ) : data.tasks.length === 0 ? (
              <Empty text="Alles erledigt. Neue Aufgaben entstehen automatisch." />
            ) : (
              <ul className="divide-surface-divider divide-y">
                {data.tasks.map((t) => {
                  const link = taskLink(t.entityType, t.entityId)
                  return (
                    <li key={t.id} className="flex items-start gap-3 py-2.5">
                      <span
                        className={cn(
                          "mt-1.5 h-2 w-2 shrink-0 rounded-full",
                          t.priority === "urgent"
                            ? "bg-danger-600"
                            : t.priority === "high"
                              ? "bg-warning-600"
                              : "bg-text-muted",
                        )}
                      />
                      <div className="min-w-0 flex-1">
                        <p className="text-text-primary text-sm font-medium">{t.title}</p>
                        {link && (
                          <Link
                            href={link.href}
                            className="text-signal-600 text-xs hover:underline"
                          >
                            {link.label}
                          </Link>
                        )}
                      </div>
                      {link && (
                        <Link
                          href={link.href}
                          aria-label={link.label}
                          className="text-text-muted hover:text-text-primary"
                        >
                          <ExternalLink className="h-4 w-4" />
                        </Link>
                      )}
                    </li>
                  )
                })}
              </ul>
            )}
          </Panel>
        </div>

        <div className="space-y-5">
          {/* Nächste Termine */}
          {(canSeeCalendar || canSeeJobs) && (
            <Panel
              title="Nächste Termine"
              action={
                <Link href="/calendar" className="text-signal-600 text-sm hover:underline">
                  Kalender öffnen
                </Link>
              }
            >
              {events.isLoading ? (
                <Loading />
              ) : nextEvents.length === 0 ? (
                <Empty text="Keine Termine in den nächsten 14 Tagen." />
              ) : (
                <div className="space-y-4">
                  {[...byDay.entries()].map(([date, list]) => (
                    <div key={date}>
                      <p className="text-text-primary mb-1.5 text-xs font-semibold">
                        {dayHeading(date, today)}
                      </p>
                      <div className="space-y-1.5">
                        {list.map((e) => (
                          <Link
                            key={`${e.source}-${e.id}`}
                            href={e.href ?? "/calendar"}
                            className={cn(
                              "flex items-center gap-3 rounded-[var(--radius-md)] border px-3 py-2 transition-opacity hover:opacity-80",
                              eventClass(e),
                            )}
                          >
                            {e.kind === "job" ? (
                              <Truck className="h-4 w-4 shrink-0" />
                            ) : e.kind === "site_visit" ? (
                              <Home className="h-4 w-4 shrink-0" />
                            ) : (
                              <CalendarDays className="h-4 w-4 shrink-0" />
                            )}
                            <div className="min-w-0 flex-1">
                              <p className="truncate text-sm font-medium">{e.title}</p>
                              <p className="truncate text-xs opacity-80">
                                {e.startTime
                                  ? `${e.startTime}${e.endTime ? ` – ${e.endTime}` : ""}`
                                  : "ganztags"}
                                {e.subtitle ? ` · ${e.subtitle}` : ""}
                              </p>
                            </div>
                          </Link>
                        ))}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </Panel>
          )}

          {/* Offene Offerten */}
          <Panel
            title="Offene Offerten"
            action={
              <Link href="/quotes" className="text-signal-600 text-sm hover:underline">
                Alle
              </Link>
            }
          >
            {!data ? (
              <Loading />
            ) : data.quotes.length === 0 ? (
              <Empty text="Keine offenen Offerten." />
            ) : (
              <ul className="divide-surface-divider divide-y">
                {data.quotes.map((q) => (
                  <li key={q.id}>
                    <Link
                      href={`/quotes/${q.id}`}
                      className="hover:bg-surface-sunken -mx-2 flex items-center gap-3 rounded-[var(--radius-md)] px-2 py-2.5"
                    >
                      <div className="min-w-0 flex-1">
                        <p className="text-text-primary truncate text-sm">{q.customer || "—"}</p>
                        <p className="text-text-muted truncate text-xs">
                          {q.quoteNumber}
                          {q.title ? ` · ${q.title}` : ""}
                        </p>
                      </div>
                      <span className="text-text-primary text-sm whitespace-nowrap tabular-nums">
                        {formatChf(q.totalCents)}
                      </span>
                      <Badge
                        variant={QUOTE_STATUS_BADGE[q.status] ?? "neutral"}
                        className="w-24 shrink-0 justify-center"
                      >
                        {QUOTE_STATUS_LABELS[q.status] ?? q.status}
                      </Badge>
                    </Link>
                  </li>
                ))}
              </ul>
            )}
          </Panel>
        </div>
      </div>
      <NewQuoteDialog open={newQuoteOpen} onOpenChange={setNewQuoteOpen} />
    </div>
  )
}

function Panel({
  title,
  action,
  children,
}: {
  title: string
  action?: React.ReactNode
  children: React.ReactNode
}) {
  return (
    <section className="border-surface-divider bg-surface-raised rounded-[var(--radius-lg)] border px-5 py-4">
      <div className="mb-3 flex items-center justify-between gap-3">
        <h2 className="text-text-primary text-base font-semibold">{title}</h2>
        {action}
      </div>
      {children}
    </section>
  )
}

function Stat({
  label,
  value,
  href,
}: {
  label: string
  value: number | string | undefined
  href?: string
}) {
  const content = (
    <>
      <dt className="text-text-muted text-xs">{label}</dt>
      <dd className="text-text-primary mt-0.5 text-lg font-semibold whitespace-nowrap tabular-nums">
        {value === undefined ? <Skeleton className="h-6 w-14" /> : value}
      </dd>
    </>
  )
  return href ? (
    <Link href={href} className="hover:opacity-80">
      {content}
    </Link>
  ) : (
    <div>{content}</div>
  )
}

function Loading() {
  return (
    <div className="space-y-2">
      <Skeleton className="h-10 w-full" />
      <Skeleton className="h-10 w-full" />
    </div>
  )
}

function Empty({ text }: { text: string }) {
  return (
    <p className="text-text-muted flex items-center gap-2 py-3 text-sm">
      <CalendarDays className="h-4 w-4" />
      {text}
    </p>
  )
}
