"use client"

import { use } from "react"
import Link from "next/link"
import { useRouter } from "next/navigation"
import { ArrowLeft } from "lucide-react"
import { trpc } from "@/lib/trpc/client"
import { Button } from "@/app/(dashboard)/_components/ui/button"
import { Badge } from "@/app/(dashboard)/_components/ui/badge"
import { Skeleton } from "@/app/(dashboard)/_components/ui/skeleton"
import { ErrorState } from "@/app/(dashboard)/_components/ui/error-state"
import { WrongCompanyNotice } from "@/app/(dashboard)/_components/wrong-company-notice"
import { InvoiceEditor } from "../_components/invoice-editor"
import { InvoiceView } from "../_components/invoice-view"
import { INVOICE_STATUS_BADGE, INVOICE_STATUS_LABELS } from "../_lib/labels"

export default function InvoicePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params)
  const router = useRouter()
  const query = trpc.invoices.get.useQuery({ id })

  if (query.isLoading) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-8 w-72" />
        <Skeleton className="h-[480px] w-full rounded-[var(--radius-lg)]" />
      </div>
    )
  }

  if (query.isError || !query.data) {
    return (
      <div>
        <Button variant="ghost" size="sm" onClick={() => router.push("/invoices")}>
          <ArrowLeft className="h-4 w-4" />
          Back to invoices
        </Button>
        <div className="mt-8">
          <WrongCompanyNotice entity="invoice" id={id}>
            <ErrorState
              title="Invoice not found"
              message="It may have been removed or belong to another company."
            />
          </WrongCompanyNotice>
        </div>
      </div>
    )
  }

  const { invoice } = query.data
  return (
    <div>
      <Button variant="ghost" size="sm" onClick={() => router.push("/invoices")}>
        <ArrowLeft className="h-4 w-4" />
        Back to invoices
      </Button>
      <div className="mt-2 mb-6 flex flex-wrap items-center gap-3">
        <h1 className="text-text-primary text-[length:var(--text-display-md)] font-semibold">
          {invoice.invoiceNumber ?? `Settlement ${invoice.jobNumber ?? ""}`}
        </h1>
        <Badge variant={INVOICE_STATUS_BADGE[invoice.status] ?? "neutral"}>
          {INVOICE_STATUS_LABELS[invoice.status] ?? invoice.status}
        </Badge>
        <Link
          href={`/customers/${invoice.customerId}`}
          className="text-signal-600 text-sm hover:underline"
        >
          {invoice.customerName}
        </Link>
        <Link href={`/jobs/${invoice.jobId}`} className="text-text-muted text-sm hover:underline">
          Job {invoice.jobNumber}
        </Link>
      </div>
      {invoice.status === "draft" ? (
        // Remount after every save so the editor starts from the stored values
        <InvoiceEditor
          key={`${invoice.id}-${invoice.totalAmountCents}-${query.dataUpdatedAt}`}
          invoice={invoice}
          lines={query.data.lines}
          missingPaymentData={query.data.missingPaymentData}
          permissions={query.data.permissions}
        />
      ) : (
        <InvoiceView data={query.data} />
      )}
    </div>
  )
}
