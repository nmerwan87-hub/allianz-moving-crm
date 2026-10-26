"use client"

import { useState } from "react"
import { useRouter } from "next/navigation"
import { Receipt, Search } from "lucide-react"
import { trpc } from "@/lib/trpc/client"
import { formatChf } from "@/lib/format/money"
import { PageHeader } from "@/app/(dashboard)/_components/ui/page-header"
import { Button } from "@/app/(dashboard)/_components/ui/button"
import { Badge } from "@/app/(dashboard)/_components/ui/badge"
import { Card, CardContent } from "@/app/(dashboard)/_components/ui/card"
import { Input, Select } from "@/app/(dashboard)/_components/ui/field"
import { Skeleton } from "@/app/(dashboard)/_components/ui/skeleton"
import { ErrorState } from "@/app/(dashboard)/_components/ui/error-state"
import { EmptyState } from "@/app/(dashboard)/_components/ui/empty-state"
import { DataTable, type Column } from "@/app/(dashboard)/_components/ui/data-table"
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
    header: "Invoice",
    render: (i) => (
      <div>
        <div className="text-text-primary font-medium whitespace-nowrap">
          {i.invoiceNumber ?? "Draft"}
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
    header: "Customer",
    render: (i) => <span className="text-text-secondary">{i.customerName}</span>,
  },
  {
    key: "issued",
    header: "Issued",
    className: "hidden md:table-cell",
    render: (i) => <span className="text-text-secondary">{formatDate(swissDay(i.issuedAt))}</span>,
  },
  {
    key: "due",
    header: "Due",
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
    header: "Open",
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
  ["", "All"],
  ["open", "Open"],
  ["overdue", "Overdue"],
  ["draft", "Settlement drafts"],
  ["paid", "Paid"],
  ["void", "Void"],
  ["write_off", "Written off"],
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
        title="Invoices"
        description="Final settlements, invoices with QR-bill, payments and reminders. Settle a job from its page."
      />

      {query.data && (
        <div className="mb-4 grid gap-3 sm:grid-cols-2 lg:max-w-xl">
          <Card>
            <CardContent className="py-3">
              <p className="text-text-muted text-xs font-medium uppercase">Open</p>
              <p className="text-text-primary text-lg font-semibold tabular-nums">
                {formatChf(query.data.openBalanceCents)}
              </p>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="py-3">
              <p className="text-text-muted text-xs font-medium uppercase">Overdue</p>
              <p
                className={`text-lg font-semibold tabular-nums ${query.data.overdueBalanceCents > 0 ? "text-danger-700" : "text-text-primary"}`}
              >
                {formatChf(query.data.overdueBalanceCents)}
              </p>
            </CardContent>
          </Card>
        </div>
      )}

      <div className="mb-4 flex flex-wrap gap-3">
        <div className="relative min-w-64 flex-1">
          <Search className="text-text-muted absolute top-1/2 left-3 h-4 w-4 -translate-y-1/2" />
          <Input
            className="pl-9"
            placeholder="Search by number or title..."
            value={search}
            onChange={(e) => {
              setSearch(e.target.value)
              setPage(1)
            }}
          />
        </div>
        <Select
          className="w-auto"
          aria-label="Filter by status"
          value={status}
          onChange={(e) => {
            setStatus(e.target.value)
            setPage(1)
          }}
        >
          {FILTERS.map(([value, label]) => (
            <option key={value} value={value}>
              {label}
            </option>
          ))}
        </Select>
      </div>

      {query.isLoading ? (
        <Skeleton className="h-96 w-full rounded-[var(--radius-lg)]" />
      ) : query.isError ? (
        <ErrorState title="Couldn't load invoices" message="Please try again." />
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
                {query.data.total} invoices — page {query.data.page} of {query.data.totalPages}
              </p>
              <div className="flex gap-2">
                <Button
                  variant="secondary"
                  size="sm"
                  disabled={page === 1}
                  onClick={() => setPage((p) => p - 1)}
                >
                  Previous
                </Button>
                <Button
                  variant="secondary"
                  size="sm"
                  disabled={page >= query.data.totalPages}
                  onClick={() => setPage((p) => p + 1)}
                >
                  Next
                </Button>
              </div>
            </div>
          )}
        </>
      ) : (
        <EmptyState
          icon={Receipt}
          title={search || status ? "No matching invoices" : "No invoices yet"}
          description={
            search || status
              ? "Try a different search or filter."
              : "Open a started or completed job and create its final settlement."
          }
        />
      )}
    </div>
  )
}
