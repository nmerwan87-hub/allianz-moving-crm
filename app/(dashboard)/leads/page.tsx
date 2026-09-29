"use client"

import { useRouter } from "next/navigation"
import { useState, useCallback } from "react"
import { Plus, Search, Funnel } from "lucide-react"
import { trpc } from "@/lib/trpc/client"
import { PageHeader } from "@/app/(dashboard)/_components/ui/page-header"
import { Button } from "@/app/(dashboard)/_components/ui/button"
import { Badge } from "@/app/(dashboard)/_components/ui/badge"
import { Card } from "@/app/(dashboard)/_components/ui/card"
import { Input, Select } from "@/app/(dashboard)/_components/ui/field"
import { Skeleton } from "@/app/(dashboard)/_components/ui/skeleton"
import { ErrorState } from "@/app/(dashboard)/_components/ui/error-state"
import { EmptyState } from "@/app/(dashboard)/_components/ui/empty-state"
import { leadStatusEnum, acquisitionSourceEnum } from "@/modules/leads/interface"

const STATUS_BADGE: Record<
  string,
  "default" | "success" | "warning" | "danger" | "info" | "neutral"
> = {
  new: "info",
  contacted: "default",
  surveyed: "default",
  quoted: "warning",
  booked: "success",
  lost: "danger",
  duplicate: "neutral",
}

function formatStatusLabel(status: string): string {
  return status.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase())
}

function formatSourceLabel(source: string | null): string {
  if (!source) return "—"
  return source.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase())
}

function formatDate(dateStr: string | null): string {
  if (!dateStr) return "—"
  const d = new Date(dateStr)
  return d.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })
}

function formatLocation(city: string | null, state: string | null): string {
  if (city && state) return `${city}, ${state}`
  if (city) return city
  if (state) return state
  return "—"
}

export default function LeadsListPage() {
  const router = useRouter()
  const [search, setSearch] = useState("")
  const [statusFilter, setStatusFilter] = useState<string>("")
  const [sourceFilter, setSourceFilter] = useState<string>("")
  const [sortBy, setSortBy] = useState<string>("created_at")
  const [sortOrder, setSortOrder] = useState<string>("desc")
  const [page, setPage] = useState(1)
  const pageSize = 25

  const queryParams = {
    search: search || undefined,
    status: (statusFilter || undefined) as (typeof leadStatusEnum)["options"][number] | undefined,
    source: (sourceFilter || undefined) as
      (typeof acquisitionSourceEnum)["options"][number] | undefined,
    sortBy: sortBy as "created_at" | "requested_date" | "first_name" | "status",
    sortOrder: sortOrder as "asc" | "desc",
    page,
    pageSize,
  }

  const query = trpc.leads.list.useQuery(queryParams)

  const handleSearch = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    setSearch(e.target.value)
    setPage(1)
  }, [])

  const handleStatusChange = useCallback((e: React.ChangeEvent<HTMLSelectElement>) => {
    setStatusFilter(e.target.value)
    setPage(1)
  }, [])

  const handleSourceChange = useCallback((e: React.ChangeEvent<HTMLSelectElement>) => {
    setSourceFilter(e.target.value)
    setPage(1)
  }, [])

  const handleSortByChange = useCallback((e: React.ChangeEvent<HTMLSelectElement>) => {
    setSortBy(e.target.value)
    setPage(1)
  }, [])

  const handleSortOrderChange = useCallback((e: React.ChangeEvent<HTMLSelectElement>) => {
    setSortOrder(e.target.value)
    setPage(1)
  }, [])

  return (
    <div>
      <PageHeader
        title="Leads"
        description="Track incoming potential customers and manage your sales pipeline."
        actions={
          <Button onClick={() => router.push("/leads/new")}>
            <Plus className="h-4 w-4" />
            New Lead
          </Button>
        }
      />

      {/* Filters */}
      <div className="mb-4 flex flex-wrap items-center gap-3">
        <div className="relative min-w-64 flex-1">
          <Search className="text-text-muted absolute top-1/2 left-3 h-4 w-4 -translate-y-1/2" />
          <Input
            placeholder="Search by name, email, or phone..."
            value={search}
            onChange={handleSearch}
            className="pl-9"
          />
        </div>
        <Select value={statusFilter} onChange={handleStatusChange} className="w-auto">
          <option value="">All statuses</option>
          {leadStatusEnum.options.map((s) => (
            <option key={s} value={s}>
              {formatStatusLabel(s)}
            </option>
          ))}
        </Select>
        <Select value={sourceFilter} onChange={handleSourceChange} className="w-auto">
          <option value="">All sources</option>
          {acquisitionSourceEnum.options.map((s) => (
            <option key={s} value={s}>
              {formatSourceLabel(s)}
            </option>
          ))}
        </Select>
        <Select value={sortBy} onChange={handleSortByChange} className="w-auto">
          <option value="created_at">Sort: Created</option>
          <option value="requested_date">Sort: Move date</option>
          <option value="first_name">Sort: Name</option>
          <option value="status">Sort: Status</option>
        </Select>
        <Select value={sortOrder} onChange={handleSortOrderChange} className="w-auto">
          <option value="desc">Descending</option>
          <option value="asc">Ascending</option>
        </Select>
      </div>

      {/* Content */}
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
          title="Couldn't load leads"
          message="There was a problem fetching your leads. Please try again."
        />
      ) : query.data && query.data.items.length > 0 ? (
        <>
          <Card className="overflow-hidden p-0">
            <div className="overflow-x-auto">
              <table className="w-full border-collapse">
                <thead>
                  <tr className="border-surface-divider border-b">
                    <th className="text-text-muted px-4 py-2.5 text-left text-xs font-semibold tracking-wide uppercase">
                      Name
                    </th>
                    <th className="text-text-muted hidden px-4 py-2.5 text-left text-xs font-semibold tracking-wide uppercase md:table-cell">
                      Contact
                    </th>
                    <th className="text-text-muted hidden px-4 py-2.5 text-left text-xs font-semibold tracking-wide uppercase lg:table-cell">
                      From
                    </th>
                    <th className="text-text-muted hidden px-4 py-2.5 text-left text-xs font-semibold tracking-wide uppercase lg:table-cell">
                      To
                    </th>
                    <th className="text-text-muted hidden px-4 py-2.5 text-left text-xs font-semibold tracking-wide uppercase sm:table-cell">
                      Move Date
                    </th>
                    <th className="text-text-muted hidden px-4 py-2.5 text-left text-xs font-semibold tracking-wide uppercase md:table-cell">
                      Source
                    </th>
                    <th className="text-text-muted px-4 py-2.5 text-left text-xs font-semibold tracking-wide uppercase">
                      Status
                    </th>
                    <th className="text-text-muted hidden px-4 py-2.5 text-left text-xs font-semibold tracking-wide uppercase lg:table-cell">
                      Assigned
                    </th>
                    <th className="text-text-muted px-4 py-2.5 text-left text-xs font-semibold tracking-wide uppercase">
                      Created
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {query.data.items.map((lead) => (
                    <tr
                      key={lead.id}
                      onClick={() => router.push(`/leads/${lead.id}`)}
                      className="border-surface-divider hover:bg-surface-sunken cursor-pointer border-b transition-colors duration-[var(--duration-quick)] last:border-0"
                    >
                      <td className="px-4 py-3 text-sm">
                        <div className="text-text-primary font-medium">
                          {lead.firstName} {lead.lastName}
                        </div>
                        <div className="text-text-muted text-xs md:hidden">
                          {lead.email ?? lead.phone ?? "—"}
                        </div>
                      </td>
                      <td className="text-text-secondary hidden px-4 py-3 text-sm md:table-cell">
                        <div>{lead.email ?? "—"}</div>
                        <div className="text-text-muted text-xs">{lead.phone ?? "—"}</div>
                      </td>
                      <td className="text-text-secondary hidden px-4 py-3 text-sm lg:table-cell">
                        {formatLocation(lead.originCity, lead.originState)}
                      </td>
                      <td className="text-text-secondary hidden px-4 py-3 text-sm lg:table-cell">
                        {formatLocation(lead.destCity, lead.destState)}
                      </td>
                      <td className="text-text-secondary hidden px-4 py-3 text-sm sm:table-cell">
                        {formatDate(lead.requestedDate)}
                      </td>
                      <td className="text-text-secondary hidden px-4 py-3 text-sm md:table-cell">
                        {formatSourceLabel(lead.source)}
                      </td>
                      <td className="px-4 py-3">
                        <Badge variant={STATUS_BADGE[lead.status] ?? "neutral"}>
                          {formatStatusLabel(lead.status)}
                        </Badge>
                      </td>
                      <td className="text-text-secondary hidden px-4 py-3 text-sm lg:table-cell">
                        {lead.assignedToName ?? "—"}
                      </td>
                      <td className="text-text-muted px-4 py-3 text-sm">
                        {formatDate(lead.createdAt)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </Card>

          {/* Pagination */}
          {query.data.totalPages > 1 && (
            <div className="mt-4 flex items-center justify-between">
              <p className="text-text-muted text-sm">
                {query.data.total} leads — page {query.data.page} of {query.data.totalPages}
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
      ) : (
        <EmptyState
          icon={Funnel}
          title="No leads yet"
          description="Create your first lead to start tracking potential customers through your sales pipeline."
          action={
            <Button onClick={() => router.push("/leads/new")}>
              <Plus className="h-4 w-4" />
              Create Lead
            </Button>
          }
        />
      )}
    </div>
  )
}
