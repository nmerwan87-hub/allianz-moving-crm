"use client"

import { useState } from "react"
import { useRouter } from "next/navigation"
import { FileText, Plus, Search } from "lucide-react"
import { trpc } from "@/lib/trpc/client"
import { formatChf } from "@/lib/format/money"
import { PageHeader } from "@/app/(dashboard)/_components/ui/page-header"
import { Button } from "@/app/(dashboard)/_components/ui/button"
import { Badge } from "@/app/(dashboard)/_components/ui/badge"
import { Card } from "@/app/(dashboard)/_components/ui/card"
import { Input, Select } from "@/app/(dashboard)/_components/ui/field"
import { Skeleton } from "@/app/(dashboard)/_components/ui/skeleton"
import { ErrorState } from "@/app/(dashboard)/_components/ui/error-state"
import { EmptyState } from "@/app/(dashboard)/_components/ui/empty-state"
import { DataTable, type Column } from "@/app/(dashboard)/_components/ui/data-table"
import { useHasPermission } from "@/app/(dashboard)/_lib/permissions"
import type { QuoteSummary } from "@/modules/quotes/interface"
import { NewQuoteDialog } from "./_components/new-quote-dialog"
import { QUOTE_STATUS_BADGE, QUOTE_STATUS_LABELS, formatDate } from "./_lib/labels"

const columns: Column<QuoteSummary>[] = [
  {
    key: "number",
    header: "Quote",
    render: (q) => (
      <div>
        <div className="text-text-primary font-medium">
          {q.quoteNumber}
          {q.version > 1 && <span className="text-text-muted font-normal"> · v{q.version}</span>}
        </div>
        <div className="text-text-muted text-xs">{q.title ?? "—"}</div>
      </div>
    ),
  },
  {
    key: "customer",
    header: "Customer",
    render: (q) => <span className="text-text-secondary">{q.customerName ?? "—"}</span>,
  },
  {
    key: "date",
    header: "Moving date",
    className: "hidden md:table-cell",
    render: (q) => <span className="text-text-secondary">{formatDate(q.scheduledDate)}</span>,
  },
  {
    key: "valid",
    header: "Valid until",
    className: "hidden lg:table-cell",
    render: (q) => <span className="text-text-secondary">{formatDate(q.expiresAt)}</span>,
  },
  {
    key: "total",
    header: "Total",
    className: "text-right",
    render: (q) => (
      <span className="text-text-primary block text-right tabular-nums">
        {formatChf(q.totalAmountCents)}
      </span>
    ),
  },
  {
    key: "status",
    header: "Status",
    render: (q) => (
      <Badge variant={QUOTE_STATUS_BADGE[q.status] ?? "neutral"}>
        {QUOTE_STATUS_LABELS[q.status] ?? q.status}
      </Badge>
    ),
  },
]

export default function QuotesPage() {
  const router = useRouter()
  const canCreate = useHasPermission("quotes.create")
  const [search, setSearch] = useState("")
  const [status, setStatus] = useState("")
  const [page, setPage] = useState(1)
  const [newOpen, setNewOpen] = useState(false)

  const query = trpc.quotes.list.useQuery({
    ...(search ? { search } : {}),
    ...(status ? { status: status as QuoteSummary["status"] } : {}),
    page,
  })

  return (
    <div>
      <PageHeader
        title="Quotes"
        description="Offers to your customers — prepared, sent, accepted."
        actions={
          canCreate ? (
            <Button onClick={() => setNewOpen(true)}>
              <Plus className="h-4 w-4" />
              New quote
            </Button>
          ) : undefined
        }
      />

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
          value={status}
          onChange={(e) => {
            setStatus(e.target.value)
            setPage(1)
          }}
        >
          <option value="">All statuses</option>
          {["draft", "sent", "viewed", "accepted", "declined", "expired", "cancelled"].map((s) => (
            <option key={s} value={s}>
              {QUOTE_STATUS_LABELS[s]}
            </option>
          ))}
        </Select>
      </div>

      {query.isLoading ? (
        <Skeleton className="h-96 w-full rounded-[var(--radius-lg)]" />
      ) : query.isError ? (
        <ErrorState title="Couldn't load quotes" message="Please try again." />
      ) : query.data && query.data.items.length > 0 ? (
        <>
          <Card className="overflow-hidden p-0">
            <DataTable
              columns={columns}
              data={query.data.items}
              onRowClick={(q) => router.push(`/quotes/${q.id}`)}
            />
          </Card>
          {query.data.totalPages > 1 && (
            <div className="mt-4 flex items-center justify-between">
              <p className="text-text-muted text-sm">
                {query.data.total} quotes — page {query.data.page} of {query.data.totalPages}
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
          icon={FileText}
          title={search || status ? "No matching quotes" : "No quotes yet"}
          description={
            search || status
              ? "Try a different search or filter."
              : "Create your first quote from a customer."
          }
          action={
            canCreate && !search && !status ? (
              <Button onClick={() => setNewOpen(true)}>
                <Plus className="h-4 w-4" />
                New quote
              </Button>
            ) : undefined
          }
        />
      )}

      <NewQuoteDialog open={newOpen} onOpenChange={setNewOpen} />
    </div>
  )
}
