"use client"

import { use, useState } from "react"
import Link from "next/link"
import { useRouter } from "next/navigation"
import { ArrowLeft, CalendarPlus, CheckCircle2, FileText, Home, Truck } from "lucide-react"
import { trpc } from "@/lib/trpc/client"
import { formatPhone } from "@/lib/format/phone"
import { formatChf } from "@/lib/format/money"
import { labelOf } from "@/app/(dashboard)/_lib/labels"
import { Button } from "@/app/(dashboard)/_components/ui/button"
import { Badge } from "@/app/(dashboard)/_components/ui/badge"
import { Skeleton } from "@/app/(dashboard)/_components/ui/skeleton"
import { ErrorState } from "@/app/(dashboard)/_components/ui/error-state"
import { ConfirmDialog } from "@/app/(dashboard)/_components/ui/confirm-dialog"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/app/(dashboard)/_components/ui/dropdown-menu"
import { useToast } from "@/app/(dashboard)/_components/ui/toast"
import { WrongCompanyNotice } from "@/app/(dashboard)/_components/wrong-company-notice"
import { AttachmentsBlock } from "@/app/(dashboard)/_components/attachments-block"
import { AppointmentDialog } from "@/app/(dashboard)/_components/appointment-dialog"
import { useHasPermission } from "@/app/(dashboard)/_lib/permissions"
import { cn } from "@/app/(dashboard)/_lib/cn"
import type { CalendarEvent } from "@/modules/calendar/interface"
import { QUOTE_STATUS_BADGE, QUOTE_STATUS_LABELS } from "@/app/(dashboard)/quotes/_lib/labels"
import { JOB_STATUS_BADGE, JOB_STATUS_LABELS } from "@/app/(dashboard)/jobs/_lib/labels"
import {
  INVOICE_STATUS_BADGE,
  INVOICE_STATUS_LABELS,
  swissDay,
} from "@/app/(dashboard)/invoices/_lib/labels"
import {
  CUSTOMER_TYPE_LABELS,
  LANGUAGE_LABELS,
  SALUTATION_LABELS,
  formatAddress,
} from "../_lib/labels"

type Tab = "quotes" | "leads" | "appointments" | "jobs" | "invoices" | "media"

function formatDate(value: string | null | undefined): string {
  if (!value) return "—"
  const [y, m, d] = value.slice(0, 10).split("-")
  return `${d}.${m}.${y}`
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <dt className="text-text-muted text-xs">{label}</dt>
      <dd className="text-text-primary text-sm">{children || "—"}</dd>
    </div>
  )
}

function Row({ href, children }: { href: string; children: React.ReactNode }) {
  return (
    <li>
      <Link
        href={href}
        className="hover:bg-surface-sunken flex items-center gap-3 px-5 py-3 transition-colors"
      >
        {children}
      </Link>
    </li>
  )
}

function Empty({ text }: { text: string }) {
  return <p className="text-text-muted px-5 py-6 text-sm">{text}</p>
}

/**
 * Customer (Bixin structure): contact card on top, then everything that
 * belongs to the customer in tabs — quotes, inquiries, appointments, jobs,
 * invoices and files.
 */
export default function CustomerDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params)
  const router = useRouter()
  const toast = useToast()
  const utils = trpc.useUtils()
  const [tab, setTab] = useState<Tab>("quotes")
  const [archiveOpen, setArchiveOpen] = useState(false)
  const [appointment, setAppointment] = useState<CalendarEvent | "new" | null>(null)

  const canQuote = useHasPermission("quotes.create")
  const canSeeQuotes = useHasPermission("quotes.view")
  const canSeeJobs = useHasPermission("jobs.view")
  const canSeeInvoices = useHasPermission("invoices.view")
  const canSeeLeads = useHasPermission("leads.view")
  const canEditLeads = useHasPermission("leads.edit")
  const canEdit = useHasPermission("customers.edit")

  const query = trpc.customers.getById.useQuery({ id })
  const quotes = trpc.quotes.list.useQuery(
    { customerId: id, pageSize: 50 },
    { enabled: canSeeQuotes },
  )
  const jobs = trpc.jobs.forCustomer.useQuery({ customerId: id }, { enabled: canSeeJobs })
  const invoices = trpc.invoices.list.useQuery(
    { customerId: id, pageSize: 50 },
    { enabled: canSeeInvoices },
  )
  const appointments = trpc.calendar.forCustomer.useQuery(
    { customerId: id },
    { enabled: canSeeLeads },
  )
  const archiveMutation = trpc.customers.archive.useMutation()
  const restoreMutation = trpc.customers.restore.useMutation()
  const createQuote = trpc.quotes.create.useMutation()

  if (query.isLoading) {
    return (
      <div className="mx-auto max-w-4xl space-y-3">
        <Skeleton className="h-8 w-64" />
        <Skeleton className="h-40 w-full" />
      </div>
    )
  }

  if (query.isError || !query.data) {
    return (
      <div>
        <Button variant="ghost" size="sm" onClick={() => router.push("/customers")}>
          <ArrowLeft className="h-4 w-4" />
          Zurück zu den Kunden
        </Button>
        <div className="mt-8">
          <WrongCompanyNotice entity="customer" id={id}>
            <ErrorState
              title="Kunde nicht gefunden"
              message="Er wurde entfernt oder du hast keinen Zugriff."
            />
          </WrongCompanyNotice>
        </div>
      </div>
    )
  }

  const { customer, leads } = query.data
  const archived = customer.archivedAt !== null
  const quoteItems = (quotes.data?.items ?? []).filter((q) => q.status !== "superseded")

  const tabs: Array<[Tab, string, number | null]> = [
    ...(canSeeQuotes ? [["quotes", "Offerten", quoteItems.length] as [Tab, string, number]] : []),
    ...(canSeeLeads ? [["leads", "Anfragen", leads.length] as [Tab, string, number]] : []),
    ...(canSeeLeads
      ? [
          ["appointments", "Termine", appointments.data?.length ?? null] as [
            Tab,
            string,
            number | null,
          ],
        ]
      : []),
    ...(canSeeJobs
      ? [["jobs", "Aufträge", jobs.data?.length ?? null] as [Tab, string, number | null]]
      : []),
    ...(canSeeInvoices
      ? [
          ["invoices", "Rechnungen", invoices.data?.items.length ?? null] as [
            Tab,
            string,
            number | null,
          ],
        ]
      : []),
    ["media", "Medien", null],
  ]

  async function newQuote() {
    try {
      const { id: quoteId } = await createQuote.mutateAsync({ customerId: id })
      router.push(`/quotes/${quoteId}`)
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Offerte konnte nicht erstellt werden")
    }
  }

  return (
    <div className="mx-auto max-w-4xl space-y-4">
      <div className="flex flex-wrap items-center gap-3">
        <Button
          variant="ghost"
          size="icon"
          aria-label="Zurück"
          onClick={() => router.push("/customers")}
        >
          <ArrowLeft className="h-4 w-4" />
        </Button>
        <h1 className="text-text-primary text-[length:var(--text-display-md)] font-semibold">
          {customer.displayName}
        </h1>
        <Badge variant={customer.customerType === "business" ? "info" : "neutral"}>
          {CUSTOMER_TYPE_LABELS[customer.customerType]}
        </Badge>
        {archived && <Badge variant="warning">Archiviert</Badge>}
        <div className="ml-auto flex gap-2">
          {!archived && canQuote && (
            <Button size="sm" disabled={createQuote.isPending} onClick={newQuote}>
              <FileText className="h-4 w-4" />
              Neue Offerte erstellen
            </Button>
          )}
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="secondary" size="sm">
                ···
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              {canEdit && (
                <DropdownMenuItem onSelect={() => router.push(`/customers/${id}/edit`)}>
                  Bearbeiten
                </DropdownMenuItem>
              )}
              {canEditLeads && (
                <DropdownMenuItem onSelect={() => setAppointment("new")}>
                  Termin erfassen
                </DropdownMenuItem>
              )}
              <DropdownMenuSeparator />
              {archived ? (
                <DropdownMenuItem
                  onSelect={async () => {
                    await restoreMutation.mutateAsync({ id })
                    await utils.customers.invalidate()
                    toast.success("Kunde wiederhergestellt")
                  }}
                >
                  Wiederherstellen
                </DropdownMenuItem>
              ) : (
                <DropdownMenuItem className="text-danger-700" onSelect={() => setArchiveOpen(true)}>
                  Archivieren
                </DropdownMenuItem>
              )}
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </div>

      {/* Kontakt */}
      <section className="border-surface-divider bg-surface-raised rounded-[var(--radius-lg)] border px-5 py-4">
        <div className="mb-3 flex items-center justify-between">
          <h2 className="text-text-primary text-sm font-semibold">
            {customer.salutation ? `${SALUTATION_LABELS[customer.salutation]} ` : ""}
            {customer.firstName} {customer.lastName}
            {customer.customerType === "business" && customer.companyName
              ? ` · ${customer.companyName}`
              : ""}
          </h2>
          {canEdit && (
            <Link
              href={`/customers/${id}/edit`}
              className="text-signal-600 text-sm hover:underline"
            >
              Bearbeiten
            </Link>
          )}
        </div>
        <dl className="grid gap-3 sm:grid-cols-3">
          <Field label="E-Mail">
            {customer.email && (
              <a href={`mailto:${customer.email}`} className="hover:underline">
                {customer.email}
              </a>
            )}
          </Field>
          <Field label="Mobile">
            {customer.phone && (
              <a href={`tel:${customer.phone}`} className="text-signal-600 hover:underline">
                {formatPhone(customer.phone)}
              </a>
            )}
          </Field>
          <Field label="Sprache">{LANGUAGE_LABELS[customer.preferredLanguage]}</Field>
          {customer.secondaryPhone && (
            <Field label="Festnetz">{formatPhone(customer.secondaryPhone)}</Field>
          )}
          <Field label="Rechnungsadresse">{formatAddress(customer)}</Field>
          <Field label="Quelle">{customer.source ? labelOf(customer.source) : null}</Field>
          <Field label="Umsatz">{formatChf(customer.totalRevenueCents)}</Field>
        </dl>
        {customer.internalNotes && (
          <p className="bg-surface-sunken text-text-secondary mt-3 rounded-[var(--radius-md)] px-3 py-2 text-sm whitespace-pre-line">
            {customer.internalNotes}
          </p>
        )}
      </section>

      {/* Tabs */}
      <div className="border-surface-divider flex gap-1 overflow-x-auto border-b">
        {tabs.map(([key, label, count]) => (
          <button
            key={key}
            type="button"
            onClick={() => setTab(key)}
            className={cn(
              "-mb-px border-b-2 px-3 py-2 text-sm whitespace-nowrap",
              tab === key
                ? "border-text-primary text-text-primary font-medium"
                : "text-text-secondary hover:text-text-primary border-transparent",
            )}
          >
            {label}
            {count ? <span className="text-text-muted ml-1.5 text-xs">{count}</span> : null}
          </button>
        ))}
      </div>

      <section className="border-surface-divider bg-surface-raised overflow-hidden rounded-[var(--radius-lg)] border">
        {tab === "quotes" &&
          (quoteItems.length === 0 ? (
            <Empty text="Noch keine Offerten." />
          ) : (
            <ul className="divide-surface-divider divide-y">
              {quoteItems.map((q) => (
                <Row key={q.id} href={`/quotes/${q.id}`}>
                  <div className="min-w-0 flex-1">
                    <p className="text-text-primary text-sm font-medium">
                      Umzug {q.quoteNumber}
                      {q.title ? (
                        <span className="text-text-muted font-normal"> · {q.title}</span>
                      ) : null}
                    </p>
                    <p className="text-text-muted text-xs">
                      Umzugsdatum {formatDate(q.scheduledDate)}
                    </p>
                  </div>
                  <span className="text-sm whitespace-nowrap tabular-nums">
                    {formatChf(q.totalAmountCents)}
                  </span>
                  <Badge variant={QUOTE_STATUS_BADGE[q.status] ?? "neutral"}>
                    {QUOTE_STATUS_LABELS[q.status] ?? q.status}
                  </Badge>
                </Row>
              ))}
            </ul>
          ))}

        {tab === "leads" &&
          (leads.length === 0 ? (
            <Empty text="Keine Anfragen." />
          ) : (
            <ul className="divide-surface-divider divide-y">
              {leads.map((l) => (
                <Row key={l.id} href={`/leads/${l.id}`}>
                  <p className="text-text-primary min-w-0 flex-1 text-sm">
                    {l.name}
                    {l.requestedDate ? (
                      <span className="text-text-muted">
                        {" "}
                        · Umzug {formatDate(l.requestedDate)}
                      </span>
                    ) : null}
                  </p>
                  <Badge variant="neutral">{labelOf(l.status)}</Badge>
                </Row>
              ))}
            </ul>
          ))}

        {tab === "appointments" && (
          <>
            {canEditLeads && (
              <div className="border-surface-divider flex justify-end border-b px-5 py-2">
                <Button size="sm" variant="secondary" onClick={() => setAppointment("new")}>
                  <CalendarPlus className="h-4 w-4" />
                  Termin
                </Button>
              </div>
            )}
            {(appointments.data ?? []).length === 0 ? (
              <Empty text="Keine Termine." />
            ) : (
              <ul className="divide-surface-divider divide-y">
                {(appointments.data ?? []).map((a) => (
                  <li key={a.id}>
                    <button
                      type="button"
                      onClick={() => setAppointment(a)}
                      className="hover:bg-surface-sunken flex w-full items-center gap-3 px-5 py-3 text-left"
                    >
                      <Home className="text-text-muted h-4 w-4" />
                      <span className="text-text-primary min-w-0 flex-1 text-sm">
                        {a.title}
                        <span className="text-text-muted">
                          {" "}
                          · {formatDate(a.date)} {a.startTime}–{a.endTime}
                        </span>
                      </span>
                      {a.confirmed && <CheckCircle2 className="text-success-700 h-4 w-4" />}
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </>
        )}

        {tab === "jobs" &&
          ((jobs.data ?? []).length === 0 ? (
            <Empty text="Keine Aufträge." />
          ) : (
            <ul className="divide-surface-divider divide-y">
              {(jobs.data ?? []).map((j) => (
                <Row key={j.id} href={`/jobs/${j.id}`}>
                  <Truck className="text-text-muted h-4 w-4" />
                  <div className="min-w-0 flex-1">
                    <p className="text-text-primary text-sm font-medium">
                      {j.jobNumber}{" "}
                      <span className="text-text-muted font-normal">· {formatDate(j.date)}</span>
                    </p>
                    <p className="text-text-muted text-xs">{j.route}</p>
                  </div>
                  <span className="text-sm whitespace-nowrap tabular-nums">
                    {formatChf(j.totalAmountCents)}
                  </span>
                  <Badge variant={JOB_STATUS_BADGE[j.status] ?? "neutral"}>
                    {JOB_STATUS_LABELS[j.status]}
                  </Badge>
                </Row>
              ))}
            </ul>
          ))}

        {tab === "invoices" &&
          ((invoices.data?.items ?? []).length === 0 ? (
            <Empty text="Keine Rechnungen." />
          ) : (
            <ul className="divide-surface-divider divide-y">
              {(invoices.data?.items ?? []).map((i) => (
                <Row key={i.id} href={`/invoices/${i.id}`}>
                  <div className="min-w-0 flex-1">
                    <p className="text-text-primary text-sm font-medium">
                      {i.invoiceNumber ?? "Entwurf"}
                    </p>
                    <p className="text-text-muted text-xs">
                      {i.dueAt
                        ? `fällig ${formatDate(swissDay(i.dueAt))}`
                        : "noch nicht ausgestellt"}
                    </p>
                  </div>
                  <span className="text-sm whitespace-nowrap tabular-nums">
                    {formatChf(i.totalAmountCents)}
                  </span>
                  <Badge variant={INVOICE_STATUS_BADGE[i.status] ?? "neutral"}>
                    {INVOICE_STATUS_LABELS[i.status]}
                  </Badge>
                </Row>
              ))}
            </ul>
          ))}

        {tab === "media" && (
          <div className="p-5">
            <AttachmentsBlock entityType="customer" entityId={id} canEdit={canEdit && !archived} />
          </div>
        )}
      </section>

      {appointment && (
        <AppointmentDialog
          event={appointment === "new" ? undefined : appointment}
          defaults={{ title: `Termin ${customer.lastName}`, kind: "site_visit", customerId: id }}
          onClose={() => setAppointment(null)}
        />
      )}

      <ConfirmDialog
        open={archiveOpen}
        onOpenChange={setArchiveOpen}
        title="Kunde archivieren?"
        description="Der Kunde verschwindet aus Listen und Suche. Anfragen, Offerten und Aufträge bleiben verknüpft; du kannst ihn jederzeit wiederherstellen."
        confirmLabel="Archivieren"
        onConfirm={async () => {
          try {
            await archiveMutation.mutateAsync({ id })
            toast.success("Kunde archiviert")
            await utils.customers.invalidate()
            router.push("/customers")
          } catch (err) {
            toast.error(err instanceof Error ? err.message : "Archivieren fehlgeschlagen")
          }
        }}
      />
    </div>
  )
}
