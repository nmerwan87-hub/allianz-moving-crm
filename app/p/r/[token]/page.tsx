import type { Metadata } from "next"
import { CheckCircle2, Download, Info } from "lucide-react"
import { createServiceRoleClient } from "@/lib/supabase/service-role"
import { loadPortalInvoice, recordInvoiceView } from "@/lib/portal/service"
import { formatCents, formatChf } from "@/lib/format/money"
import { formatIban } from "@/lib/format/iban"
import { formatPaymentReference } from "@/lib/format/payment-reference"
import {
  LinkInvalid,
  PortalCard,
  PortalShell,
  qty,
  swissDate,
} from "../../_components/portal-shell"

export const dynamic = "force-dynamic"
export const metadata: Metadata = {
  title: "Ihre Rechnung",
  robots: { index: false, follow: false },
}

/** The customer's view of an issued invoice: amount open, payment details, PDF with QR-bill. */
export default async function PortalInvoicePage({
  params,
}: {
  params: Promise<{ token: string }>
}) {
  const { token } = await params
  const svc = createServiceRoleClient()
  const invoice = await loadPortalInvoice(svc, token)
  if (!invoice) return <LinkInvalid what="Diese Rechnung" />
  await recordInvoiceView(svc, invoice)

  const paid = invoice.status === "paid"
  const closed = invoice.status === "void" || invoice.status === "write_off"
  const overdue = invoice.overdue

  return (
    <PortalShell company={invoice.company}>
      <div className="space-y-4">
        <div>
          <p className="text-text-muted text-sm">Rechnung {invoice.invoiceNumber}</p>
          <h1 className="text-text-primary text-2xl font-semibold">
            {invoice.title ?? "Ihr Umzug"}
          </h1>
          <p className="text-text-secondary mt-1 text-sm">für {invoice.customerName}</p>
        </div>

        {paid ? (
          <div className="flex gap-3 rounded-[var(--radius-lg)] border border-emerald-200 bg-emerald-50 px-5 py-4 text-emerald-900">
            <CheckCircle2 className="mt-0.5 h-5 w-5 shrink-0" />
            <p className="text-sm">
              <span className="font-semibold">Bezahlt — vielen Dank!</span>
              {invoice.paidAt ? ` Zahlung erhalten am ${swissDate(invoice.paidAt)}.` : ""}
            </p>
          </div>
        ) : closed ? (
          <div className="border-surface-divider bg-surface-sunken text-text-primary flex gap-3 rounded-[var(--radius-lg)] border px-5 py-4">
            <Info className="mt-0.5 h-5 w-5 shrink-0" />
            <p className="text-sm">
              Diese Rechnung ist nicht mehr gültig. Bitte nichts bezahlen und bei Fragen die
              Umzugsfirma kontaktieren.
            </p>
          </div>
        ) : (
          <PortalCard>
            <p className="text-text-muted text-sm">Offener Betrag</p>
            <p className="text-text-primary text-3xl font-semibold tabular-nums">
              {formatChf(invoice.balanceCents)}
            </p>
            <p
              className={
                overdue ? "text-danger-700 mt-1 text-sm" : "text-text-secondary mt-1 text-sm"
              }
            >
              {overdue ? "Fällig seit " : "Zahlbar bis "}
              {swissDate(invoice.dueAt)}
            </p>
            <dl className="border-surface-divider mt-4 grid gap-3 border-t pt-4 text-sm sm:grid-cols-2">
              <Item label="Zahlbar an">{invoice.company.payee ?? invoice.company.name}</Item>
              <Item label="IBAN">
                <span className="font-mono">{formatIban(invoice.company.iban) || "—"}</span>
              </Item>
              <div className="sm:col-span-2">
                <Item label="Referenz">
                  <span className="font-mono break-all">
                    {formatPaymentReference(invoice.paymentReference) || "—"}
                  </span>
                </Item>
              </div>
            </dl>
            <p className="text-text-muted mt-3 text-xs">
              Am einfachsten bezahlen Sie mit dem QR-Zahlteil im PDF: in der Banking-App scannen,
              fertig.
            </p>
          </PortalCard>
        )}

        <a
          href={`/p/r/${token}/pdf`}
          target="_blank"
          rel="noopener"
          className="text-signal-600 inline-flex items-center gap-2 text-sm hover:underline"
        >
          <Download className="h-4 w-4" />
          Rechnung mit QR-Zahlteil als PDF herunterladen
        </a>

        <PortalCard title="Leistungen">
          <ul className="divide-surface-divider divide-y text-sm">
            {invoice.lines.map((l, i) => (
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
              value={formatChf(invoice.subtotalCents - invoice.discountCents)}
            />
            <Row label="MWST" value={formatChf(invoice.taxCents)} />
            <div className="text-text-primary flex justify-between font-semibold">
              <dt>Total</dt>
              <dd className="whitespace-nowrap tabular-nums">{formatChf(invoice.totalCents)}</dd>
            </div>
            {invoice.depositAppliedCents > 0 && (
              <Row
                label="Erhaltene Anzahlung"
                value={`−${formatChf(invoice.depositAppliedCents)}`}
              />
            )}
            {invoice.amountPaidCents > 0 && (
              <Row label="Bereits bezahlt" value={`−${formatChf(invoice.amountPaidCents)}`} />
            )}
          </dl>
          {invoice.notes && (
            <p className="bg-surface-sunken text-text-secondary mt-3 rounded-[var(--radius-md)] px-3 py-2 text-sm whitespace-pre-line">
              {invoice.notes}
            </p>
          )}
        </PortalCard>
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
