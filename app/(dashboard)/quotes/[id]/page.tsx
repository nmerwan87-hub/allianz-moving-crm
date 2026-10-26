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
import { QuoteEditor } from "../_components/quote-editor"
import { QuoteView } from "../_components/quote-view"
import { QUOTE_STATUS_BADGE, QUOTE_STATUS_LABELS } from "../_lib/labels"

export default function QuotePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params)
  const router = useRouter()
  const query = trpc.quotes.get.useQuery({ id })

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
        <Button variant="ghost" size="sm" onClick={() => router.push("/quotes")}>
          <ArrowLeft className="h-4 w-4" />
          Back to quotes
        </Button>
        <div className="mt-8">
          <WrongCompanyNotice entity="quote" id={id}>
            <ErrorState
              title="Quote not found"
              message="It may have been removed or belong to another company."
            />
          </WrongCompanyNotice>
        </div>
      </div>
    )
  }

  const { quote } = query.data
  return (
    <div>
      <Button variant="ghost" size="sm" onClick={() => router.push("/quotes")}>
        <ArrowLeft className="h-4 w-4" />
        Back to quotes
      </Button>
      <div className="mt-2 mb-6 flex flex-wrap items-center gap-3">
        <h1 className="text-text-primary text-[length:var(--text-display-md)] font-semibold">
          {quote.quoteNumber}
          {quote.version > 1 && (
            <span className="text-text-muted font-normal"> · Version {quote.version}</span>
          )}
        </h1>
        <Badge variant={QUOTE_STATUS_BADGE[quote.status] ?? "neutral"}>
          {QUOTE_STATUS_LABELS[quote.status] ?? quote.status}
        </Badge>
        {quote.customerId && (
          <Link
            href={`/customers/${quote.customerId}`}
            className="text-signal-600 text-sm hover:underline"
          >
            {quote.customerName}
          </Link>
        )}
      </div>
      {quote.status === "draft" ? (
        // Remount after every save so the editor starts from the stored values
        <QuoteEditor
          key={`${quote.id}-${quote.totalAmountCents}-${query.dataUpdatedAt}`}
          quote={quote}
          lines={query.data.lines}
          permissions={query.data.permissions}
        />
      ) : (
        <QuoteView data={query.data} />
      )}
    </div>
  )
}
