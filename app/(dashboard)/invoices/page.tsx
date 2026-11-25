"use client"

import { useState } from "react"
import { useRouter } from "next/navigation"
import { Receipt, Search } from "lucide-react"
import { trpc } from "@/lib/trpc/client"
import { formatChf } from "@/lib/format/money"
import { PageHeader } from "@/app/(dashboard)/_components/ui/page-header"
import { Button } from "@/app/(dashboard)/_components/ui/button"
import { Badge } from "@/app/(dashboard)/_components/ui/badge"
import { Card } from "@/app/(dashboard)/_components/ui/card"
import { Input } from "@/app/(dashboard)/_components/ui/field"
import { Skeleton } from "@/app/(dashboard)/_components/ui/skeleton"
import { ErrorState } from "@/app/(dashboard)/_components/ui/error-state"
import { EmptyState } from "@/app/(dashboard)/_components/ui/empty-state"
import { DataTable, type Column } from "@/app/(dashboard)/_components/ui/data-table"
import { cn } from "@/app/(dashboard)/_lib/cn"
import type { InvoiceSummary } from "@/modules/invoices/interface"
import { formatDate } from "../quotes/_lib/labels"
import {
  INVOICE_STATUS_BADGE,
  INVOICE_STATUS_LABELS,
  REMINDER_LABELS,
  swissDay,
} from "./_lib/labels"

const columns: Column<InvoiceSummary>[] = [
  {
    key: "number",
    header: "Rechnung",
    render: (i) => (
      <div>
        <div className="text-text-primary font-medium whitespace-nowrap">
          {i.invoiceNumber ?? "Entwurf"}
        </div>
        <div className="text-text-muted text-xs">
          {i.jobNumber}
          {i.title ? ` · ${i.title}` : ""}
        </div>
      </div>
    ),
  },
  {
    key: "customer",
    header: "Kunde",
    render: (i) => <span className="text-text-secondary">{i.customerName}</span>,
  },
  {
    key: "issued",
    header: "Datum",
    className: "hidden md:table-cell",
    render: (i) => <span className="text-text-secondary">{formatDate(swissDay(i.issuedAt))}</span>,
  },
  {
    key: "due",
    header: "Fällig",
    className: "hidden lg:table-cell",
    render: (i) => (
      <div>
        <span className={i.status === "overdue" ? "text-danger-700" : "text-text-secondary"}>
          {formatDate(swissDay(i.dueAt))}
        </span>
        {i.reminderLevel > 0 && (
          <div className="text-text-muted text-xs">{REMINDER_LABELS[i.reminderLevel]}</div>
        )}
      </div>
    ),
  },
  {
    key: "total",
    header: "Total",
    className: "text-right",
    render: (i) => (
      <span className="text-text-primary block text-right whitespace-nowrap tabular-nums">
        {formatChf(i.totalAmountCents)}
      </span>
    ),
  },
  {
    key: "open",
    header: "Offen",
    className: "text-right hidden sm:table-cell",
    render: (i) => (
      <span className="text-text-secondary block text-right whitespace-nowrap tabular-nums">
        {["draft", "void", "write_off"].includes(i.status) ? "—" : formatChf(i.balanceDueCents)}
      </span>
    ),
  },
  {
    key: "status",
    header: "Status",
    render: (i) => (
      <Badge variant={INVOICE_STATUS_BADGE[i.status] ?? "neutral"}>
        {INVOICE_STATUS_LABELS[i.status] ?? i.status}
      </Badge>
    ),
  },
]

const FILTERS: Array<[string, string]> = [
  ["", "Alle"],
  ["open", "Offen"],
  ["overdue", "Überfällig"],
  ["draft", "Entwürfe"],
  ["paid", "Bezahlt"],
  ["void", "Storniert"],
  ["write_off", "Abgeschrieben"],
]

export default function InvoicesPage() {
  const router = useRouter()
  const [search, setSearch] = useState("")
  const [status, setStatus] = useState("")
  const [page, setPage] = useState(1)

  const query = trpc.invoices.list.useQuery({
    ...(search ? { search } : {}),
    ...(status ? { status: status as InvoiceSummary["status"] | "open" } : {}),
    page,
  })

  return (
    <div>
      <PageHeader
        title="Zahlungsübersicht"
        description="Abgerechnet wird im Auftrag oder in der angenommenen Offerte."
      />

      <div className="mb-4 grid gap-3 sm:grid-cols-2 lg:max-w-xl">
        {(
          [
            ["Offen", query.data?.openBalanceCents, "open", false],
            ["Überfällig", query.data?.overdueBalanceCents, "overdue", true],
          ] as const
        ).map(([label, cents, filter, danger]) => (
          <button
            key={label}
            type="button"
            onClick={() => {
              setStatus(status === filter ? "" : filter)
              setPage(1)
            }}
            className={cn(
              "border-surface-divider bg-surface-raised rounded-[var(--radius-lg)] border px-4 py-3 text-left",
              status === filter && "border-text-primary",
            )}
          >
            <p className="text-text-muted text-xs">{label}</p>
            <p
              className={cn(
                "text-lg font-semibold tabular-nums",
                danger && (cents ?? 0) > 0 ? "text-danger-700" : "text-text-primary",
              )}
            >
              {cents === undefined ? "…" : formatChf(cents)}
            </p>
          </button>
        ))}
      </div>

      <div className="mb-4 flex flex-wrap items-center gap-3">
        <div className="flex flex-wrap gap-1">
          {FILTERS.map(([value, label]) => (
            <button
              key={value}
              type="button"
              onClick={() => {
                setStatus(value)
                setPage(1)
              }}
              className={cn(
                "rounded-full px-3 py-1 text-sm",
                status === value
                  ? "bg-signal-600 text-text-inverse font-medium"
                  : "text-text-secondary hover:bg-surface-sunken",
              )}
            >
              {label}
            </button>
          ))}
        </div>
        <div className="relative ml-auto w-full sm:w-64">
          <Search className="text-text-muted absolute top-1/2 left-3 h-4 w-4 -translate-y-1/2" />
          <Input
            className="pl-9"
            placeholder="Nummer, Titel …"
            value={search}
            onChange={(e) => {
              setSearch(e.target.value)
              setPage(1)
            }}
          />
        </div>
      </div>

      {query.isLoading ? (
        <Skeleton className="h-96 w-full rounded-[var(--radius-lg)]" />
      ) : query.isError ? (
        <ErrorState
          title="Rechnungen konnten nicht geladen werden"
          message="Versuche es nochmals."
        />
      ) : query.data && query.data.items.length > 0 ? (
        <>
          <Card className="overflow-hidden p-0">
            <DataTable
              columns={columns}
              data={query.data.items}
              onRowClick={(i) => router.push(`/invoices/${i.id}`)}
            />
          </Card>
          {query.data.totalPages > 1 && (
            <div className="mt-4 flex items-center justify-between">
              <p className="text-text-muted text-sm">
                {query.data.total} Rechnungen — Seite {query.data.page} von {query.data.totalPages}
              </p>
              <div className="flex gap-2">
                <Button
                  variant="secondary"
                  size="sm"
                  disabled={page === 1}
                  onClick={() => setPage((p) => p - 1)}
                >
                  Zurück
                </Button>
                <Button
                  variant="secondary"
                  size="sm"
                  disabled={page >= query.data.totalPages}
                  onClick={() => setPage((p) => p + 1)}
                >
                  Weiter
                </Button>
              </div>
            </div>
          )}
        </>
      ) : (
        <EmptyState
          icon={Receipt}
          title={search || status ? "Keine passenden Rechnungen" : "Noch keine Rechnungen"}
          description={
            search || status
              ? "Andere Suche oder anderen Filter versuchen."
              : "Öffne einen erledigten Auftrag und erstelle dort die Schlussabrechnung."
          }
        />
      )}
    </div>
  )
}
