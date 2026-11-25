"use client"

import { formatPhone } from "@/lib/format/phone"
import { labelOf } from "@/app/(dashboard)/_lib/labels"
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

function formatDate(value: string | null): string {
  if (!value) return "—"
  const [y, m, d] = value.slice(0, 10).split("-")
  return `${d}.${m}.${y}`
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
  const sortBy = "created_at"
  const sortOrder = "desc"
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

  return (
    <div>
      <PageHeader
        title="Anfragen"
        description="Neue Anfragen erfassen und daraus Offerten machen."
        actions={
          <Button onClick={() => router.push("/leads/new")}>
            <Plus className="h-4 w-4" />
            Neue Anfrage
          </Button>
        }
      />

      {/* Filters */}
      <div className="mb-4 flex flex-wrap items-center gap-3">
        <div className="relative min-w-64 flex-1">
          <Search className="text-text-muted absolute top-1/2 left-3 h-4 w-4 -translate-y-1/2" />
          <Input
            placeholder="Name, E-Mail oder Telefon …"
            value={search}
            onChange={handleSearch}
            className="pl-9"
          />
        </div>
        <Select value={statusFilter} onChange={handleStatusChange} className="w-auto">
          <option value="">Alle Status</option>
          {leadStatusEnum.options.map((s) => (
            <option key={s} value={s}>
              {labelOf(s)}
            </option>
          ))}
        </Select>
        <Select value={sourceFilter} onChange={handleSourceChange} className="w-auto">
          <option value="">Alle Quellen</option>
          {acquisitionSourceEnum.options.map((s) => (
            <option key={s} value={s}>
              {labelOf(s)}
            </option>
          ))}
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
        <ErrorState title="Anfragen konnten nicht geladen werden" message="Versuche es nochmals." />
      ) : query.data && query.data.items.length > 0 ? (
        <>
          <Card className="overflow-hidden p-0">
            <div className="overflow-x-auto">
              <table className="w-full border-collapse">
                <thead>
                  <tr className="border-surface-divider border-b">
                    <th className="text-text-muted px-4 py-2.5 text-left text-xs font-medium">
                      Name
                    </th>
                    <th className="text-text-muted hidden px-4 py-2.5 text-left text-xs font-medium md:table-cell">
                      Kontakt
                    </th>
                    <th className="text-text-muted hidden px-4 py-2.5 text-left text-xs font-medium lg:table-cell">
                      Von
                    </th>
                    <th className="text-text-muted hidden px-4 py-2.5 text-left text-xs font-medium lg:table-cell">
                      Nach
                    </th>
                    <th className="text-text-muted hidden px-4 py-2.5 text-left text-xs font-medium sm:table-cell">
                      Umzug
                    </th>
                    <th className="text-text-muted hidden px-4 py-2.5 text-left text-xs font-medium xl:table-cell">
                      Quelle
                    </th>
                    <th className="text-text-muted px-4 py-2.5 text-left text-xs font-medium">
                      Status
                    </th>
                    <th className="text-text-muted px-4 py-2.5 text-left text-xs font-medium">
                      Erfasst
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
                        <div className="text-text-primary font-medium whitespace-nowrap">
                          {lead.firstName} {lead.lastName}
                        </div>
                        <div className="text-text-muted text-xs md:hidden">
                          {lead.email ?? (formatPhone(lead.phone) || "—")}
                        </div>
                      </td>
                      <td className="text-text-secondary hidden px-4 py-3 text-sm md:table-cell">
                        <div>{lead.email ?? "—"}</div>
                        <div className="text-text-muted text-xs">
                          {formatPhone(lead.phone) || "—"}
                        </div>
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
                      <td className="text-text-secondary hidden px-4 py-3 text-sm xl:table-cell">
                        {labelOf(lead.source)}
                      </td>
                      <td className="px-4 py-3">
                        <Badge variant={STATUS_BADGE[lead.status] ?? "neutral"}>
                          {labelOf(lead.status)}
                        </Badge>
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
                {query.data.total} Anfragen — Seite {query.data.page} von {query.data.totalPages}
              </p>
              <div className="flex gap-2">
                <Button
                  variant="secondary"
                  size="sm"
                  disabled={page === 1}
                  onClick={() => setPage((p) => Math.max(1, p - 1))}
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
          icon={Funnel}
          title="Noch keine Anfragen"
          description="Erfasse eine Anfrage, z. B. nach einem Anruf, und erstelle daraus eine Offerte."
          action={
            <Button onClick={() => router.push("/leads/new")}>
              <Plus className="h-4 w-4" />
              Anfrage erfassen
            </Button>
          }
        />
      )}
    </div>
  )
}
