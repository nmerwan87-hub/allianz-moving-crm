"use client"

import { useState } from "react"
import { useRouter } from "next/navigation"
import { Plus, Search, Users } from "lucide-react"
import { trpc } from "@/lib/trpc/client"
import { formatPhone } from "@/lib/format/phone"
import { PageHeader } from "@/app/(dashboard)/_components/ui/page-header"
import { Button } from "@/app/(dashboard)/_components/ui/button"
import { Badge } from "@/app/(dashboard)/_components/ui/badge"
import { Card } from "@/app/(dashboard)/_components/ui/card"
import { Input, Select } from "@/app/(dashboard)/_components/ui/field"
import { Skeleton } from "@/app/(dashboard)/_components/ui/skeleton"
import { ErrorState } from "@/app/(dashboard)/_components/ui/error-state"
import { EmptyState } from "@/app/(dashboard)/_components/ui/empty-state"
import { DataTable, type Column } from "@/app/(dashboard)/_components/ui/data-table"
import type { Customer } from "@/modules/customers/interface"
import { CUSTOMER_TYPE_LABELS, formatAddress } from "./_lib/labels"

function formatDate(value: string | null): string {
  if (!value) return "—"
  return new Date(value).toLocaleDateString("de-CH", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  })
}

const columns: Column<Customer>[] = [
  {
    key: "name",
    header: "Name",
    render: (c) => (
      <div>
        <div className="text-text-primary font-medium">{c.displayName}</div>
        <div className="text-text-muted text-xs md:hidden">
          {c.email ?? formatPhone(c.phone) ?? "—"}
        </div>
      </div>
    ),
  },
  {
    key: "contact",
    header: "Contact",
    className: "hidden md:table-cell",
    render: (c) => (
      <div className="text-text-secondary">
        <div>{c.email ?? "—"}</div>
        <div className="text-text-muted text-xs">{formatPhone(c.phone) || "—"}</div>
      </div>
    ),
  },
  {
    key: "address",
    header: "Address",
    className: "hidden lg:table-cell",
    render: (c) => <span className="text-text-secondary">{formatAddress(c) ?? "—"}</span>,
  },
  {
    key: "type",
    header: "Type",
    className: "hidden sm:table-cell",
    render: (c) => (
      <Badge variant={c.customerType === "business" ? "info" : "neutral"}>
        {CUSTOMER_TYPE_LABELS[c.customerType]}
      </Badge>
    ),
  },
  {
    key: "created",
    header: "Created",
    render: (c) => <span className="text-text-muted">{formatDate(c.createdAt)}</span>,
  },
]

export default function CustomersListPage() {
  const router = useRouter()
  const [search, setSearch] = useState("")
  const [customerType, setCustomerType] = useState<"" | "private" | "business">("")
  const [archived, setArchived] = useState(false)
  const [sortBy, setSortBy] = useState<"created_at" | "last_name">("created_at")
  const [page, setPage] = useState(1)

  const query = trpc.customers.list.useQuery({
    ...(search ? { search } : {}),
    ...(customerType ? { customerType } : {}),
    archived,
    sortBy,
    sortOrder: sortBy === "last_name" ? "asc" : "desc",
    page,
    pageSize: 25,
  })

  const resetPage = () => setPage(1)

  return (
    <div>
      <PageHeader
        title="Customers"
        description="Everyone you have moved or quoted for."
        actions={
          <Button onClick={() => router.push("/customers/new")}>
            <Plus className="h-4 w-4" />
            New customer
          </Button>
        }
      />

      <div className="mb-4 flex flex-wrap items-center gap-3">
        <div className="relative min-w-64 flex-1">
          <Search className="text-text-muted absolute top-1/2 left-3 h-4 w-4 -translate-y-1/2" />
          <Input
            placeholder="Search by name, company, e-mail or phone..."
            value={search}
            onChange={(e) => {
              setSearch(e.target.value)
              resetPage()
            }}
            className="pl-9"
          />
        </div>
        <Select
          value={customerType}
          onChange={(e) => {
            setCustomerType(e.target.value as typeof customerType)
            resetPage()
          }}
          className="w-auto"
        >
          <option value="">All types</option>
          <option value="private">Private</option>
          <option value="business">Business</option>
        </Select>
        <Select
          value={sortBy}
          onChange={(e) => {
            setSortBy(e.target.value as typeof sortBy)
            resetPage()
          }}
          className="w-auto"
        >
          <option value="created_at">Newest first</option>
          <option value="last_name">Name A–Z</option>
        </Select>
        <Select
          value={archived ? "archived" : "active"}
          onChange={(e) => {
            setArchived(e.target.value === "archived")
            resetPage()
          }}
          className="w-auto"
        >
          <option value="active">Active</option>
          <option value="archived">Archived</option>
        </Select>
      </div>

      {query.isLoading ? (
        <Card>
          <div className="space-y-3 p-4">
            {Array.from({ length: 8 }).map((_, i) => (
              <Skeleton key={i} className="h-12 w-full" />
            ))}
          </div>
        </Card>
      ) : query.isError ? (
        <ErrorState
          title="Couldn't load customers"
          message="There was a problem fetching your customers. Please try again."
        />
      ) : query.data && query.data.items.length > 0 ? (
        <>
          <Card className="overflow-hidden p-0">
            <DataTable
              columns={columns}
              data={query.data.items}
              onRowClick={(c) => router.push(`/customers/${c.id}`)}
            />
          </Card>
          {query.data.totalPages > 1 && (
            <div className="mt-4 flex items-center justify-between">
              <p className="text-text-muted text-sm">
                {query.data.total} customers — page {query.data.page} of {query.data.totalPages}
              </p>
              <div className="flex gap-2">
                <Button
                  variant="secondary"
                  size="sm"
                  disabled={page === 1}
                  onClick={() => setPage((p) => Math.max(1, p - 1))}
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
      ) : search || customerType || archived ? (
        <EmptyState
          icon={Users}
          title="No matching customers"
          description="Try a different search or filter."
        />
      ) : (
        <EmptyState
          icon={Users}
          title="No customers yet"
          description="Add your first customer to start quoting and planning moves."
          action={
            <Button onClick={() => router.push("/customers/new")}>
              <Plus className="h-4 w-4" />
              New customer
            </Button>
          }
        />
      )}
    </div>
  )
}
