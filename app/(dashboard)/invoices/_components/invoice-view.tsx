"use client"

import { useState } from "react"
import Link from "next/link"
import { BellRing, Ban, Download, Link2, Mail, RefreshCw, Wallet, XCircle } from "lucide-react"
import { trpc } from "@/lib/trpc/client"
import { formatChf, formatCents } from "@/lib/format/money"
import { formatPaymentReference } from "@/lib/format/payment-reference"
import { Button } from "@/app/(dashboard)/_components/ui/button"
import {
  AmountRow,
  DetailCard,
  DetailField,
  StatusBanner,
  formatQuantity,
} from "@/app/(dashboard)/_components/ui/detail"
import { useToast } from "@/app/(dashboard)/_components/ui/toast"
import type { inferRouterOutputs } from "@trpc/server"
import type { AppRouter } from "@/lib/trpc/router"
import { formatDate } from "../../quotes/_lib/labels"
import {
  PAYMENT_METHOD_LABELS,
  PAYMENT_TYPE_LABELS,
  REMINDER_LABELS,
  swissDay,
  todaySwiss,
} from "../_lib/labels"
import { IssueDialog } from "./issue-dialog"
import { PaymentDialog } from "./payment-dialog"
import { ReasonDialog } from "./reason-dialog"

type InvoiceDetail = inferRouterOutputs<AppRouter>["invoices"]["get"]

const OPEN = ["sent", "viewed", "partially_paid", "overdue"]

export function InvoiceView({ data }: { data: InvoiceDetail }) {
  const toast = useToast()
  const utils = trpc.useUtils()
  const { invoice, lines, payments, documents, emails, permissions } = data
  const [dialog, setDialog] = useState<
    | null
    | { kind: "payment" }
    | { kind: "resend" }
    | { kind: "reminder" }
    | { kind: "void" }
    | { kind: "writeOff" }
    | { kind: "cancelPayment"; paymentId: string; amountCents: number }
  >(null)

  const voidMutation = trpc.invoices.void.useMutation()
  const writeOff = trpc.invoices.writeOff.useMutation()
  const cancelPayment = trpc.invoices.cancelPayment.useMutation()
  const regenerate = trpc.invoices.regenerateDocument.useMutation()
  const portalLink = trpc.invoices.portalLink.useMutation()

  async function copyPortalLink() {
    try {
      const { url } = await portalLink.mutateAsync({ id: invoice.id })
      await navigator.clipboard.writeText(url)
      toast.success("Link kopiert — der Kunde sieht Rechnung, Betrag und QR-Zahlteil")
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Link konnte nicht erstellt werden")
    }
  }

  const isOpen = OPEN.includes(invoice.status)
  const dueDay = swissDay(invoice.dueAt)
  const pastDue = Boolean(dueDay && dueDay < todaySwiss())
  const invoicePdf = documents.find((d) => d.kind === "invoice")

  async function run(action: () => Promise<unknown>, success: string) {
    try {
      await action()
      await Promise.all([utils.invoices.invalidate(), utils.jobs.invalidate()])
      toast.success(success)
      setDialog(null)
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Aktion fehlgeschlagen")
    }
  }

  async function download(documentId: string) {
    try {
      const { url } = await utils.invoices.documentUrl.fetch({ id: invoice.id, documentId })
      window.open(url, "_blank", "noopener")
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Download fehlgeschlagen")
    }
  }

  const remaining = invoice.balanceDueCents
  const canPay = permissions.recordPayments && isOpen
  const canRemind = permissions.edit && isOpen && pastDue && invoice.reminderLevel < 3

  const actions = (canPay || canRemind) && (
    <div className="mt-3 flex flex-wrap gap-2">
      {canPay && (
        <Button size="sm" onClick={() => setDialog({ kind: "payment" })}>
          <Wallet className="h-4 w-4" />
          Zahlung erfassen
        </Button>
      )}
      {canRemind && (
        <Button size="sm" variant="secondary" onClick={() => setDialog({ kind: "reminder" })}>
          <BellRing className="h-4 w-4" />
          {REMINDER_LABELS[invoice.reminderLevel + 1]} senden
        </Button>
      )}
    </div>
  )

  let banner: React.ReactNode
  if (invoice.status === "void") {
    banner = (
      <StatusBanner tone="neutral" title={`Storniert am ${formatDate(invoice.voidedAt)}`}>
        {invoice.voidReason}
      </StatusBanner>
    )
  } else if (invoice.status === "write_off") {
    banner = (
      <StatusBanner tone="neutral" title="Restbetrag abgeschrieben">
        {invoice.writeOffReason}
      </StatusBanner>
    )
  } else if (invoice.status === "paid") {
    banner = (
      <StatusBanner tone="success" title="Bezahlt">
        Vollständig bezahlt am {formatDate(swissDay(invoice.paidAt))}.
      </StatusBanner>
    )
  } else if (invoice.status === "overdue" || pastDue) {
    banner = (
      <StatusBanner tone="danger" title={`Überfällig · ${formatChf(remaining)} offen`}>
        Fällig war der {formatDate(dueDay)}.{" "}
        {invoice.reminderLevel > 0
          ? `${REMINDER_LABELS[invoice.reminderLevel]} gesendet am ${formatDate(swissDay(invoice.lastReminderAt))}.`
          : "Noch keine Mahnung gesendet."}
        {actions}
      </StatusBanner>
    )
  } else {
    banner = (
      <StatusBanner tone="info" title={`${formatChf(remaining)} offen`}>
        Gesendet am {formatDate(swissDay(invoice.issuedAt))}, zahlbar bis {formatDate(dueDay)}.
        {invoice.status === "partially_paid" && " Teilweise bezahlt."}
        {actions}
      </StatusBanner>
    )
  }

  return (
    <div className="mx-auto max-w-4xl space-y-4">
      {banner}

      <div className="grid gap-4 md:grid-cols-2">
        <DetailCard
          title="Kunde"
          action={
            <Link
              href={`/customers/${invoice.customerId}`}
              className="text-signal-600 text-sm hover:underline"
            >
              Öffnen
            </Link>
          }
        >
          <dl className="grid gap-2">
            <DetailField label="Name">{invoice.customerName}</DetailField>
            <DetailField label="E-Mail">{invoice.customerEmail}</DetailField>
          </dl>
        </DetailCard>
        <DetailCard
          title="Angaben"
          action={
            <Link
              href={`/jobs/${invoice.jobId}`}
              className="text-signal-600 text-sm hover:underline"
            >
              Auftrag {invoice.jobNumber}
            </Link>
          }
        >
          <dl className="grid grid-cols-2 gap-2">
            <DetailField label="Rechnungsdatum">
              {formatDate(swissDay(invoice.issuedAt))}
            </DetailField>
            <DetailField label="Zahlbar bis">{formatDate(dueDay)}</DetailField>
            <DetailField label="Umzugsdatum">{formatDate(invoice.serviceDate)}</DetailField>
            <DetailField label="Zahlungsfrist">{invoice.paymentTermsDays} Tage</DetailField>
            <div className="col-span-2">
              <DetailField label="QR-Referenz">
                <span className="font-mono text-xs break-all">
                  {formatPaymentReference(invoice.paymentReference)}
                </span>
              </DetailField>
            </div>
          </dl>
        </DetailCard>
      </div>

      <DetailCard title={invoice.title ?? "Rechnung"}>
        <ul className="divide-surface-divider divide-y text-sm">
          {lines.map((l) => (
            <li key={l.id} className="flex items-start justify-between gap-4 py-2">
              <div className="min-w-0">
                <p className="text-text-primary">{l.name}</p>
                {l.description && <p className="text-text-muted text-xs">{l.description}</p>}
                {l.quotedQuantity !== null &&
                  l.pricingMode !== "manual" &&
                  l.quotedQuantity !== l.quantity && (
                    <p className="text-text-muted text-xs">
                      Offeriert {formatQuantity(l.quotedQuantity)} {l.unit ?? ""}
                    </p>
                  )}
              </div>
              <span className="text-text-secondary text-right whitespace-nowrap tabular-nums">
                {l.unitPriceCents === 0 ? (
                  <span className="text-text-muted">inklusive</span>
                ) : l.pricingMode === "manual" || l.quantity === 1 ? (
                  `CHF ${formatCents(l.netTotalCents)}`
                ) : (
                  <>
                    <span className="text-text-muted text-xs">
                      CHF {formatCents(l.unitPriceCents)} × {formatQuantity(l.quantity)}{" "}
                      {l.unit ?? ""} ={" "}
                    </span>
                    CHF {formatCents(l.netTotalCents)}
                  </>
                )}
                {l.discountAmountCents > 0 && (
                  <span className="text-text-muted block text-xs">
                    Rabatt −{formatCents(l.discountAmountCents)}
                  </span>
                )}
              </span>
            </li>
          ))}
        </ul>
        <dl className="border-text-primary mt-2 space-y-1 border-t pt-2 text-sm">
          <AmountRow
            label="Zwischensumme"
            value={formatChf(invoice.subtotalCents - invoice.discountCents)}
          />
          <AmountRow label="MWST" value={formatChf(invoice.taxCents)} />
          <AmountRow label="Total" value={formatChf(invoice.totalAmountCents)} strong />
          {invoice.depositAppliedCents > 0 && (
            <AmountRow
              label="Erhaltene Anzahlung"
              value={`−${formatChf(invoice.depositAppliedCents)}`}
              muted
            />
          )}
          {invoice.amountPaidCents > 0 && (
            <AmountRow label="Bezahlt" value={`−${formatChf(invoice.amountPaidCents)}`} muted />
          )}
          {(invoice.depositAppliedCents > 0 || invoice.amountPaidCents > 0) && (
            <div className="border-surface-divider border-t pt-1">
              <AmountRow label="Offen" value={formatChf(remaining)} strong />
            </div>
          )}
          {invoice.costCapCents !== null && (
            <AmountRow label="Kostendach" value={formatChf(invoice.costCapCents)} muted />
          )}
        </dl>
        {invoice.costCapOverrideReason && (
          <p className="text-warning-700 mt-2 text-xs">
            Kostendach überschritten: {invoice.costCapOverrideReason}
          </p>
        )}
        {invoice.notes && (
          <p className="bg-surface-sunken text-text-secondary mt-3 rounded-[var(--radius-md)] px-3 py-2 text-sm whitespace-pre-line">
            {invoice.notes}
          </p>
        )}
      </DetailCard>

      {permissions.viewPayments && (
        <DetailCard
          title="Zahlungen"
          action={
            canPay ? (
              <Button size="sm" variant="secondary" onClick={() => setDialog({ kind: "payment" })}>
                <Wallet className="h-4 w-4" />
                Zahlung erfassen
              </Button>
            ) : undefined
          }
        >
          {payments.length === 0 ? (
            <p className="text-text-muted text-sm">Noch keine Zahlungen.</p>
          ) : (
            <ul className="divide-surface-divider divide-y text-sm">
              {payments.map((p) => (
                <li key={p.id} className="flex items-center gap-3 py-2">
                  <div className="min-w-0 flex-1">
                    <p
                      className={
                        p.status === "cancelled"
                          ? "text-text-muted line-through"
                          : "text-text-primary"
                      }
                    >
                      {PAYMENT_TYPE_LABELS[p.paymentType]} · {PAYMENT_METHOD_LABELS[p.method]}
                      {p.reference ? ` · ${p.reference}` : ""}
                    </p>
                    <p className="text-text-muted text-xs">
                      {formatDate(p.paidAt)}
                      {p.status === "cancelled" && ` · storniert: ${p.cancellationReason}`}
                      {p.notes ? ` · ${p.notes}` : ""}
                    </p>
                  </div>
                  <span className="text-text-primary tabular-nums">{formatChf(p.amountCents)}</span>
                  {permissions.recordPayments &&
                    p.status === "completed" &&
                    p.invoiceId === invoice.id &&
                    invoice.status !== "write_off" && (
                      <Button
                        variant="ghost"
                        size="icon"
                        aria-label="Zahlung stornieren"
                        onClick={() =>
                          setDialog({
                            kind: "cancelPayment",
                            paymentId: p.id,
                            amountCents: p.amountCents,
                          })
                        }
                      >
                        <XCircle className="h-4 w-4" />
                      </Button>
                    )}
                </li>
              ))}
            </ul>
          )}
        </DetailCard>
      )}

      <DetailCard title="Dokumente und E-Mails">
        <div className="space-y-2 text-sm">
          {documents.length === 0 && (
            <div className="flex items-center gap-3">
              <p className="text-text-muted">Das Rechnungs-PDF fehlt.</p>
              {permissions.edit && (
                <Button
                  size="sm"
                  variant="secondary"
                  disabled={regenerate.isPending}
                  onClick={() =>
                    run(() => regenerate.mutateAsync({ id: invoice.id }), "PDF erstellt")
                  }
                >
                  <RefreshCw className="h-4 w-4" />
                  PDF erstellen
                </Button>
              )}
            </div>
          )}
          {documents.map((d) => (
            <button
              key={d.id}
              type="button"
              onClick={() => download(d.id)}
              className="text-signal-600 flex items-center gap-2 hover:underline"
            >
              <Download className="h-4 w-4" />
              {d.name}
            </button>
          ))}
          {emails.map((e) => (
            <div key={e.id} className="text-text-muted flex items-center gap-2 text-xs">
              <Mail className="h-3.5 w-3.5" />
              {e.to} · {new Date(e.createdAt).toLocaleString("de-CH")} ·{" "}
              <span className={e.status === "failed" ? "text-danger-700" : "text-success-700"}>
                {e.status === "failed"
                  ? `nicht zugestellt${e.error ? ` (${e.error})` : ""}`
                  : "gesendet"}
              </span>
            </div>
          ))}
        </div>
      </DetailCard>

      <div className="flex flex-wrap gap-2">
        {permissions.edit && !["void", "write_off"].includes(invoice.status) && (
          <Button variant="secondary" disabled={portalLink.isPending} onClick={copyPortalLink}>
            <Link2 className="h-4 w-4" />
            Kundenlink kopieren
          </Button>
        )}
        {permissions.edit && invoicePdf && invoice.status !== "void" && (
          <Button variant="secondary" onClick={() => setDialog({ kind: "resend" })}>
            <Mail className="h-4 w-4" />
            Rechnung erneut senden
          </Button>
        )}
        {permissions.cancel && isOpen && invoice.amountPaidCents === 0 && (
          <Button variant="dangerGhost" onClick={() => setDialog({ kind: "void" })}>
            <Ban className="h-4 w-4" />
            Rechnung stornieren
          </Button>
        )}
        {permissions.cancel && isOpen && pastDue && (
          <Button variant="dangerGhost" onClick={() => setDialog({ kind: "writeOff" })}>
            <XCircle className="h-4 w-4" />
            Restbetrag abschreiben
          </Button>
        )}
      </div>

      {dialog?.kind === "payment" && (
        <PaymentDialog
          target={{
            kind: "invoice",
            invoiceId: invoice.id,
            balanceCents: invoice.balanceDueCents,
            label: invoice.invoiceNumber ?? "",
          }}
          onClose={() => setDialog(null)}
        />
      )}
      {(dialog?.kind === "resend" || dialog?.kind === "reminder") && (
        <IssueDialog
          invoiceId={invoice.id}
          customerEmail={invoice.customerEmail}
          amountCents={invoice.balanceDueCents}
          mode={dialog.kind}
          reminderLevel={invoice.reminderLevel}
          onClose={() => setDialog(null)}
        />
      )}
      {dialog?.kind === "void" && (
        <ReasonDialog
          title={`Rechnung ${invoice.invoiceNumber} stornieren?`}
          description="Die Rechnung bleibt als storniert erhalten, die Nummer wird nicht wieder vergeben. Danach kann der Auftrag neu abgerechnet werden."
          confirmLabel="Stornieren"
          pending={voidMutation.isPending}
          onClose={() => setDialog(null)}
          onConfirm={(reason) =>
            run(() => voidMutation.mutateAsync({ id: invoice.id, reason }), "Rechnung storniert")
          }
        />
      )}
      {dialog?.kind === "writeOff" && (
        <ReasonDialog
          title={`${formatChf(invoice.balanceDueCents)} abschreiben?`}
          description="Wenn der offene Betrag nicht mehr bezahlt wird (z. B. nach erfolgloser Betreibung)."
          confirmLabel="Abschreiben"
          pending={writeOff.isPending}
          onClose={() => setDialog(null)}
          onConfirm={(reason) =>
            run(() => writeOff.mutateAsync({ id: invoice.id, reason }), "Restbetrag abgeschrieben")
          }
        />
      )}
      {dialog?.kind === "cancelPayment" && (
        <ReasonDialog
          title={`Zahlung über ${formatChf(dialog.amountCents)} stornieren?`}
          description="Für irrtümlich erfasste Zahlungen. Die Zahlung bleibt als storniert sichtbar, der offene Betrag steigt wieder."
          confirmLabel="Stornieren"
          pending={cancelPayment.isPending}
          onClose={() => setDialog(null)}
          onConfirm={(reason) =>
            run(
              () => cancelPayment.mutateAsync({ id: dialog.paymentId, reason }),
              "Zahlung storniert",
            )
          }
        />
      )}
    </div>
  )
}
