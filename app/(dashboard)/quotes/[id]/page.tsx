"use client"

import { use, useState } from "react"
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
import { QuoteForm } from "../_components/quote-form"
import { QuoteView } from "../_components/quote-view"
import { QUOTE_STATUS_BADGE, QUOTE_STATUS_LABELS } from "../_lib/labels"

export default function QuotePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params)
  const router = useRouter()
  const query = trpc.quotes.get.useQuery({ id })
  const [detailMode, setDetailMode] = useState(false)

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
          Zurück zu den Offerten
        </Button>
        <div className="mt-8">
          <WrongCompanyNotice entity="quote" id={id}>
            <ErrorState
              title="Offerte nicht gefunden"
              message="Sie wurde entfernt oder gehört zu einer anderen Firma."
            />
          </WrongCompanyNotice>
        </div>
      </div>
    )
  }

  const { quote } = query.data
  if (quote.status === "draft" && !detailMode) {
    // Remount after every save so the form starts from the stored values
    return (
      <QuoteForm
        key={`${quote.id}-${query.dataUpdatedAt}`}
        quote={quote}
        lines={query.data.lines}
        permissions={query.data.permissions}
        onDetailMode={() => setDetailMode(true)}
      />
    )
  }
  return (
    <div>
      <Button variant="ghost" size="sm" onClick={() => router.push("/quotes")}>
        <ArrowLeft className="h-4 w-4" />
        Zurück zu den Offerten
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
        <div className="space-y-4">
          <button
            type="button"
            onClick={() => setDetailMode(false)}
            className="text-signal-600 text-sm hover:underline"
          >
            ← Zurück zur einfachen Ansicht
          </button>
          <QuoteEditor
            key={`${quote.id}-${quote.totalAmountCents}-${query.dataUpdatedAt}`}
            quote={quote}
            lines={query.data.lines}
            permissions={query.data.permissions}
          />
        </div>
      ) : (
        <QuoteView data={query.data} />
      )}
    </div>
  )
}
