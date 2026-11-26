import type { Metadata } from "next"
import { CheckCircle2, Download, Info, XCircle } from "lucide-react"
import { createServiceRoleClient } from "@/lib/supabase/service-role"
import { loadPortalQuote, recordQuoteView } from "@/lib/portal/service"
import { formatCents, formatChf } from "@/lib/format/money"
import {
  LinkInvalid,
  PortalCard,
  PortalShell,
  qty,
  swissDate,
} from "../../_components/portal-shell"
import { QuoteDecision } from "./decision"

export const dynamic = "force-dynamic"
export const metadata: Metadata = { title: "Ihre Offerte", robots: { index: false, follow: false } }

function floor(f: number | null, lift: boolean): string | null {
  if (f === null) return null
  if (f === 0) return "Erdgeschoss"
  return `${f < 0 ? "Untergeschoss" : `${f}. Stock`}, ${lift ? "mit Lift" : "ohne Lift"}`
}

/** The customer's view of a sent quote: details, PDF, accept or decline. */
export default async function PortalQuotePage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params
  const svc = createServiceRoleClient()
  const quote = await loadPortalQuote(svc, token)
  if (!quote || quote.status === "draft") return <LinkInvalid what="Diese Offerte" />
  await recordQuoteView(svc, quote)

  const accent = quote.company.accentColor
  const superseded = quote.status === "superseded" || quote.status === "cancelled"
  const expired = !quote.open && (quote.status === "sent" || quote.status === "viewed")

  return (
    <PortalShell company={quote.company}>
      <div className="space-y-4">
        <div>
          <p className="text-text-muted text-sm">Offerte {quote.quoteNumber}</p>
          <h1 className="text-text-primary text-2xl font-semibold">{quote.title ?? "Ihr Umzug"}</h1>
          <p className="text-text-secondary mt-1 text-sm">für {quote.customerName}</p>
        </div>

        {quote.status === "accepted" && (
          <Notice tone="success" title="Vielen Dank, die Offerte ist angenommen!">
            Angenommen am {swissDate(quote.acceptedAt)}
            {quote.acceptedByName ? ` von ${quote.acceptedByName}` : ""}. Wir melden uns mit allen
            Details zu Ihrem Umzug.
          </Notice>
        )}
        {quote.status === "declined" && (
          <Notice tone="neutral" title="Offerte abgelehnt">
            Sie haben diese Offerte abgelehnt. Falls Sie es sich anders überlegen, melden Sie sich
            gerne bei uns.
          </Notice>
        )}
        {superseded && (
          <Notice tone="neutral" title="Diese Offerte ist nicht mehr aktuell">
            Sie wurde durch eine neue Version ersetzt oder zurückgezogen. Bitte verwenden Sie den
            Link aus unserer neuesten E-Mail.
          </Notice>
        )}
        {expired && (
          <Notice tone="neutral" title="Diese Offerte ist abgelaufen">
            Sie war gültig bis {swissDate(quote.expiresAt)}. Gerne erstellen wir Ihnen eine neue
            Offerte.
          </Notice>
        )}

        <PortalCard title="Umzug">
          <dl className="grid gap-3 text-sm sm:grid-cols-2">
            <Item label="Umzugsdatum">{swissDate(quote.scheduledDate)}</Item>
            {quote.rooms !== null && <Item label="Zimmer">{qty(quote.rooms)}</Item>}
            <Item label="Von">
              {quote.origin.address || "—"}
              {floor(quote.origin.floor, quote.origin.lift) && (
                <span className="text-text-muted block text-xs">
                  {floor(quote.origin.floor, quote.origin.lift)}
                </span>
              )}
            </Item>
            <Item label="Nach">
              {quote.dest.address || "—"}
              {floor(quote.dest.floor, quote.dest.lift) && (
                <span className="text-text-muted block text-xs">
                  {floor(quote.dest.floor, quote.dest.lift)}
                </span>
              )}
            </Item>
          </dl>
        </PortalCard>

        <PortalCard
          title={quote.pricingKind === "flat" ? "Preis (Pauschal)" : "Preis (nach Aufwand)"}
        >
          <ul className="divide-surface-divider divide-y text-sm">
            {quote.lines.map((l, i) => (
              <li
                key={i}
                className="flex flex-col gap-0.5 py-2 sm:flex-row sm:items-start sm:justify-between sm:gap-4"
              >
                <div className="min-w-0">
                  <p className="text-text-primary">{l.name}</p>
                  {l.description && <p className="text-text-muted text-xs">{l.description}</p>}
                </div>
                <span className="text-text-secondary whitespace-nowrap tabular-nums sm:text-right">
                  {l.unitPriceCents === 0 ? (
                    <span className="text-text-muted">inklusive</span>
                  ) : l.pricingMode !== "manual" && l.quantity !== 1 ? (
                    <>
                      <span className="text-text-muted text-xs">
                        {formatCents(l.unitPriceCents)} × {qty(l.quantity)} {l.unit ?? ""} ={" "}
                      </span>
                      CHF {formatCents(l.netCents)}
                    </>
                  ) : (
                    `CHF ${formatCents(l.netCents)}`
                  )}
                </span>
              </li>
            ))}
          </ul>
          <dl className="border-text-primary mt-2 space-y-1 border-t pt-2 text-sm">
            <Row
              label="Zwischensumme"
              value={formatChf(quote.subtotalCents - quote.discountCents)}
            />
            <Row label="MWST" value={formatChf(quote.taxCents)} />
            <div className="text-text-primary flex justify-between text-lg font-semibold">
              <dt>Total</dt>
              <dd className="whitespace-nowrap tabular-nums">{formatChf(quote.totalCents)}</dd>
            </div>
            {quote.costCapCents !== null && (
              <Row label="Kostendach (Höchstbetrag)" value={formatChf(quote.costCapCents)} />
            )}
            {quote.depositCents > 0 && (
              <Row
                label={`Anzahlung ${qty(quote.depositPercent)} %`}
                value={formatChf(quote.depositCents)}
              />
            )}
          </dl>
          {quote.pricingKind !== "flat" && (
            <p className="text-text-muted mt-2 text-xs">
              Abgerechnet wird nach effektivem Aufwand
              {quote.costCapCents !== null ? ", höchstens bis zum Kostendach" : ""}.
            </p>
          )}
          {quote.customerNotes && (
            <p className="bg-surface-sunken text-text-secondary mt-3 rounded-[var(--radius-md)] px-3 py-2 text-sm whitespace-pre-line">
              {quote.customerNotes}
            </p>
          )}
        </PortalCard>

        <a
          href={`/p/o/${token}/pdf`}
          target="_blank"
          rel="noopener"
          className="text-signal-600 inline-flex items-center gap-2 text-sm hover:underline"
        >
          <Download className="h-4 w-4" />
          Offerte als PDF herunterladen
        </a>

        {quote.open && (
          <PortalCard title="Ihre Antwort">
            <p className="text-text-secondary mb-4 text-sm">
              Gültig bis {swissDate(quote.expiresAt)}.
            </p>
            <QuoteDecision
              token={token}
              totalLabel={formatChf(quote.totalCents)}
              accentColor={accent}
            />
          </PortalCard>
        )}
      </div>
    </PortalShell>
  )
}

function Item({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <dt className="text-text-muted text-xs">{label}</dt>
      <dd className="text-text-primary">{children}</dd>
    </div>
  )
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="text-text-secondary flex justify-between gap-4">
      <dt>{label}</dt>
      <dd className="whitespace-nowrap tabular-nums">{value}</dd>
    </div>
  )
}

function Notice({
  tone,
  title,
  children,
}: {
  tone: "success" | "neutral"
  title: string
  children: React.ReactNode
}) {
  const Icon = tone === "success" ? CheckCircle2 : tone === "neutral" ? Info : XCircle
  return (
    <div
      className={
        tone === "success"
          ? "flex gap-3 rounded-[var(--radius-lg)] border border-emerald-200 bg-emerald-50 px-5 py-4 text-emerald-900"
          : "border-surface-divider bg-surface-sunken text-text-primary flex gap-3 rounded-[var(--radius-lg)] border px-5 py-4"
      }
    >
      <Icon className="mt-0.5 h-5 w-5 shrink-0" />
      <div className="text-sm">
        <p className="font-semibold">{title}</p>
        <p className="mt-0.5">{children}</p>
      </div>
    </div>
  )
}
