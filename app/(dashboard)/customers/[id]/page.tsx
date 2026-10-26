"use client"

import { use, useState } from "react"
import Link from "next/link"
import { useRouter } from "next/navigation"
import { ArchiveRestore, ArrowLeft, Archive, Edit, Mail, Phone } from "lucide-react"
import { trpc } from "@/lib/trpc/client"
import { formatPhone } from "@/lib/format/phone"
import { formatChf } from "@/lib/format/money"
import { Button } from "@/app/(dashboard)/_components/ui/button"
import { Badge } from "@/app/(dashboard)/_components/ui/badge"
import { Card, CardContent, CardHeader } from "@/app/(dashboard)/_components/ui/card"
import { Skeleton } from "@/app/(dashboard)/_components/ui/skeleton"
import { ErrorState } from "@/app/(dashboard)/_components/ui/error-state"
import { ConfirmDialog } from "@/app/(dashboard)/_components/ui/confirm-dialog"
import { useToast } from "@/app/(dashboard)/_components/ui/toast"
import { WrongCompanyNotice } from "@/app/(dashboard)/_components/wrong-company-notice"
import {
  CUSTOMER_TYPE_LABELS,
  LANGUAGE_LABELS,
  SALUTATION_LABELS,
  formatAddress,
} from "../_lib/labels"

function formatDate(value: string | null): string {
  if (!value) return "—"
  return new Date(value).toLocaleDateString("de-CH", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  })
}

function formatLabel(value: string): string {
  return value.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase())
}

function Detail({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <dt className="text-text-muted text-xs font-medium tracking-wide uppercase">{label}</dt>
      <dd className="text-text-primary mt-1 text-sm">{children}</dd>
    </div>
  )
}

export default function CustomerDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params)
  const router = useRouter()
  const toast = useToast()
  const utils = trpc.useUtils()
  const query = trpc.customers.getById.useQuery({ id })
  const archiveMutation = trpc.customers.archive.useMutation()
  const restoreMutation = trpc.customers.restore.useMutation()
  const [archiveOpen, setArchiveOpen] = useState(false)

  if (query.isLoading) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-8 w-64" />
        <Skeleton className="h-48 w-full rounded-[var(--radius-lg)]" />
      </div>
    )
  }

  if (query.isError || !query.data) {
    return (
      <div>
        <Button variant="ghost" size="sm" onClick={() => router.push("/customers")}>
          <ArrowLeft className="h-4 w-4" />
          Back to customers
        </Button>
        <div className="mt-8">
          <WrongCompanyNotice entity="customer" id={id}>
            <ErrorState
              title="Customer not found"
              message="This customer may have been removed or you may not have access to it."
            />
          </WrongCompanyNotice>
        </div>
      </div>
    )
  }

  const { customer, leads } = query.data
  const archived = customer.archivedAt !== null
  const address = formatAddress(customer)

  async function archive() {
    try {
      await archiveMutation.mutateAsync({ id })
      toast.success("Customer archived")
      await utils.customers.invalidate()
      router.push("/customers")
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to archive customer")
    }
  }

  async function restore() {
    try {
      await restoreMutation.mutateAsync({ id })
      toast.success("Customer restored")
      await utils.customers.invalidate()
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to restore customer")
    }
  }

  return (
    <div>
      <div className="mb-4 flex items-center justify-between">
        <Button variant="ghost" size="sm" onClick={() => router.push("/customers")}>
          <ArrowLeft className="h-4 w-4" />
          Back to customers
        </Button>
        <div className="flex gap-2">
          {archived ? (
            <Button
              variant="secondary"
              size="sm"
              onClick={restore}
              disabled={restoreMutation.isPending}
            >
              <ArchiveRestore className="h-4 w-4" />
              Restore
            </Button>
          ) : (
            <>
              <Button
                variant="secondary"
                size="sm"
                onClick={() => router.push(`/customers/${id}/edit`)}
              >
                <Edit className="h-4 w-4" />
                Edit
              </Button>
              <Button variant="dangerGhost" size="sm" onClick={() => setArchiveOpen(true)}>
                <Archive className="h-4 w-4" />
                Archive
              </Button>
            </>
          )}
        </div>
      </div>

      <div className="mb-6 flex flex-wrap items-center gap-3">
        <h1 className="text-text-primary text-[length:var(--text-display-md)] font-semibold">
          {customer.displayName}
        </h1>
        <Badge variant={customer.customerType === "business" ? "info" : "neutral"}>
          {CUSTOMER_TYPE_LABELS[customer.customerType]}
        </Badge>
        {archived && <Badge variant="warning">Archived {formatDate(customer.archivedAt)}</Badge>}
      </div>

      <div className="grid gap-6 lg:grid-cols-3">
        <div className="space-y-6 lg:col-span-2">
          <Card>
            <CardHeader>Contact</CardHeader>
            <CardContent>
              <dl className="grid gap-4 sm:grid-cols-2">
                <Detail label="Name">
                  {customer.salutation ? `${SALUTATION_LABELS[customer.salutation]} ` : ""}
                  {customer.firstName} {customer.lastName}
                </Detail>
                <Detail label="Language">{LANGUAGE_LABELS[customer.preferredLanguage]}</Detail>
                <Detail label="E-mail">
                  {customer.email ? (
                    <a
                      href={`mailto:${customer.email}`}
                      className="text-signal-600 inline-flex items-center gap-1 hover:underline"
                    >
                      <Mail className="h-3.5 w-3.5" />
                      {customer.email}
                    </a>
                  ) : (
                    "—"
                  )}
                </Detail>
                <Detail label="Mobile">
                  {customer.phone ? (
                    <a
                      href={`tel:${customer.phone}`}
                      className="text-signal-600 inline-flex items-center gap-1 hover:underline"
                    >
                      <Phone className="h-3.5 w-3.5" />
                      {formatPhone(customer.phone)}
                    </a>
                  ) : (
                    "—"
                  )}
                </Detail>
                <Detail label="Landline">{formatPhone(customer.secondaryPhone) || "—"}</Detail>
                <Detail label="Billing address">{address ?? "—"}</Detail>
              </dl>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>Leads</CardHeader>
            <CardContent>
              {leads.length === 0 ? (
                <p className="text-text-muted text-sm">No leads for this customer yet.</p>
              ) : (
                <ul className="divide-surface-divider divide-y">
                  {leads.map((lead) => (
                    <li key={lead.id} className="flex items-center justify-between py-2.5">
                      <Link
                        href={`/leads/${lead.id}`}
                        className="text-text-primary text-sm font-medium hover:underline"
                      >
                        {lead.name}
                        {lead.requestedDate ? ` — ${formatDate(lead.requestedDate)}` : ""}
                      </Link>
                      <Badge variant="neutral">{formatLabel(lead.status)}</Badge>
                    </li>
                  ))}
                </ul>
              )}
            </CardContent>
          </Card>
        </div>

        <div className="space-y-6">
          <Card>
            <CardHeader>Overview</CardHeader>
            <CardContent>
              <dl className="space-y-4">
                <Detail label="Jobs">{customer.totalJobsCount}</Detail>
                <Detail label="Revenue">{formatChf(customer.totalRevenueCents)}</Detail>
                <Detail label="Last job">{formatDate(customer.lastJobAt)}</Detail>
                <Detail label="Source">
                  {customer.source ? formatLabel(customer.source) : "—"}
                  {customer.referralSource ? ` (${customer.referralSource})` : ""}
                </Detail>
                <Detail label="Customer since">{formatDate(customer.createdAt)}</Detail>
              </dl>
            </CardContent>
          </Card>

          {customer.internalNotes && (
            <Card>
              <CardHeader>Internal notes</CardHeader>
              <CardContent>
                <p className="text-text-secondary text-sm whitespace-pre-wrap">
                  {customer.internalNotes}
                </p>
              </CardContent>
            </Card>
          )}
        </div>
      </div>

      <ConfirmDialog
        open={archiveOpen}
        onOpenChange={setArchiveOpen}
        title="Archive this customer?"
        description="The customer disappears from lists and search. Leads, offers and jobs keep their link, and you can restore the customer at any time."
        confirmLabel="Archive customer"
        onConfirm={archive}
      />
    </div>
  )
}
