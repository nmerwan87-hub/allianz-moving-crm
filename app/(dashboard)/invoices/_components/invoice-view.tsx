"use client"

import { useState } from "react"
import Link from "next/link"
import {
  AlertTriangle,
  BellRing,
  Ban,
  Download,
  Mail,
  RefreshCw,
  Wallet,
  XCircle,
} from "lucide-react"
import { trpc } from "@/lib/trpc/client"
import { formatChf, formatCents } from "@/lib/format/money"
import { formatPaymentReference } from "@/lib/format/payment-reference"
import { Button } from "@/app/(dashboard)/_components/ui/button"
import { Badge } from "@/app/(dashboard)/_components/ui/badge"
import { Card, CardContent, CardHeader } from "@/app/(dashboard)/_components/ui/card"
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
import { Row } from "./invoice-editor"

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
      toast.error(err instanceof Error ? err.message : "Action failed")
    }
  }

  async function download(documentId: string) {
    try {
      const { url } = await utils.invoices.documentUrl.fetch({ id: invoice.id, documentId })
      window.open(url, "_blank", "noopener")
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Download failed")
    }
  }

  return (
    <div className="grid gap-6 xl:grid-cols-[1fr_320px]">
      <div className="min-w-0 space-y-6">
        {invoice.status === "void" && (
          <div className="border-surface-divider bg-surface-sunken rounded-[var(--radius-md)] border p-3 text-sm">
            <p className="text-text-primary font-medium">Voided {formatDate(invoice.voidedAt)}</p>
            <p className="text-text-secondary">{invoice.voidReason}</p>
          </div>
        )}
        {invoice.status === "write_off" && (
          <div className="border-surface-divider bg-surface-sunken rounded-[var(--radius-md)] border p-3 text-sm">
            <p className="text-text-primary font-medium">Written off</p>
            <p className="text-text-secondary">{invoice.writeOffReason}</p>
          </div>
        )}
        {invoice.status === "overdue" && (
          <div className="border-danger-600/30 bg-danger-100 text-danger-700 flex gap-2 rounded-[var(--radius-md)] border p-3 text-sm">
            <AlertTriangle className="h-4 w-4 shrink-0" />
            <span>
              Overdue since {formatDate(dueDay)}.{" "}
              {invoice.reminderLevel > 0
                ? `${REMINDER_LABELS[invoice.reminderLevel]} sent ${formatDate(swissDay(invoice.lastReminderAt))}.`
                : "No reminder sent yet."}
            </span>
          </div>
        )}

        <Card className="overflow-hidden p-0">
          <CardHeader>Services</CardHeader>
          <table className="w-full border-collapse text-sm">
            <thead>
              <tr className="border-surface-divider text-text-muted border-y text-left text-xs font-semibold tracking-wide uppercase">
                <th className="px-4 py-2">Service</th>
                <th className="px-4 py-2 text-right">Quantity</th>
                <th className="hidden px-4 py-2 text-right sm:table-cell">Price</th>
                <th className="px-4 py-2 text-right">Amount</th>
              </tr>
            </thead>
            <tbody>
              {lines.map((l) => (
                <tr key={l.id} className="border-surface-divider border-b last:border-0">
                  <td className="px-4 py-2.5">
                    <div className="text-text-primary">{l.name}</div>
                    {l.description && (
                      <div className="text-text-muted text-xs">{l.description}</div>
                    )}
                    {l.discountAmountCents > 0 && (
                      <div className="text-text-muted text-xs">
                        Discount −{formatCents(l.discountAmountCents)}
                      </div>
                    )}
                  </td>
                  <td className="text-text-secondary px-4 py-2.5 text-right whitespace-nowrap tabular-nums">
                    {l.pricingMode === "manual" ? "" : `${l.quantity} ${l.unit ?? ""}`}
                    {l.quotedQuantity !== null &&
                      l.pricingMode !== "manual" &&
                      l.quotedQuantity !== l.quantity && (
                        <div className="text-text-muted text-xs">quoted {l.quotedQuantity}</div>
                      )}
                  </td>
                  <td className="text-text-secondary hidden px-4 py-2.5 text-right tabular-nums sm:table-cell">
                    {l.pricingMode === "manual" ? "" : formatCents(l.unitPriceCents)}
                  </td>
                  <td className="text-text-primary px-4 py-2.5 text-right tabular-nums">
                    {formatCents(l.netTotalCents)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </Card>

        {permissions.viewPayments && (
          <Card className="overflow-hidden p-0">
            <div className="flex items-center justify-between pr-4">
              <CardHeader>Payments</CardHeader>
              {permissions.recordPayments && isOpen && (
                <Button size="sm" onClick={() => setDialog({ kind: "payment" })}>
                  <Wallet className="h-4 w-4" />
                  Record payment
                </Button>
              )}
            </div>
            {payments.length === 0 ? (
              <p className="text-text-muted border-surface-divider border-t px-4 py-4 text-sm">
                No payments yet.
              </p>
            ) : (
              <ul className="divide-surface-divider border-surface-divider divide-y border-t text-sm">
                {payments.map((p) => (
                  <li key={p.id} className="flex flex-wrap items-center gap-3 px-4 py-2.5">
                    <div className="min-w-0 flex-1">
                      <div
                        className={
                          p.status === "cancelled"
                            ? "text-text-muted line-through"
                            : "text-text-primary"
                        }
                      >
                        {PAYMENT_TYPE_LABELS[p.paymentType]} · {PAYMENT_METHOD_LABELS[p.method]}
                        {p.reference ? ` · ${p.reference}` : ""}
                      </div>
                      <div className="text-text-muted text-xs">
                        {formatDate(p.paidAt)}
                        {p.status === "cancelled" && ` · cancelled: ${p.cancellationReason}`}
                        {p.notes ? ` · ${p.notes}` : ""}
                      </div>
                    </div>
                    <span className="text-text-primary tabular-nums">
                      {formatChf(p.amountCents)}
                    </span>
                    {permissions.recordPayments &&
                      p.status === "completed" &&
                      p.invoiceId === invoice.id &&
                      invoice.status !== "write_off" && (
                        <Button
                          variant="ghost"
                          size="icon"
                          aria-label="Cancel payment"
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
          </Card>
        )}

        <div className="grid gap-6 md:grid-cols-2">
          <Card>
            <CardHeader>Documents</CardHeader>
            <CardContent className="space-y-2">
              {documents.length === 0 && (
                <div className="space-y-2">
                  <p className="text-text-muted text-sm">The invoice PDF is missing.</p>
                  {permissions.edit && (
                    <Button
                      size="sm"
                      variant="secondary"
                      disabled={regenerate.isPending}
                      onClick={() =>
                        run(() => regenerate.mutateAsync({ id: invoice.id }), "PDF created")
                      }
                    >
                      <RefreshCw className="h-4 w-4" />
                      Create PDF
                    </Button>
                  )}
                </div>
              )}
              {documents.map((d) => (
                <button
                  key={d.id}
                  type="button"
                  onClick={() => download(d.id)}
                  className="text-signal-600 flex items-center gap-2 text-sm hover:underline"
                >
                  <Download className="h-4 w-4" />
                  {d.name}
                </button>
              ))}
            </CardContent>
          </Card>
          <Card>
            <CardHeader>E-mails</CardHeader>
            <CardContent className="space-y-2 text-sm">
              {emails.length === 0 && <p className="text-text-muted">None sent.</p>}
              {emails.map((e) => (
                <div key={e.id} className="flex items-start justify-between gap-2">
                  <div>
                    <div className="text-text-primary">{e.to}</div>
                    <div className="text-text-muted text-xs">
                      {new Date(e.createdAt).toLocaleString("de-CH")}
                      {e.error ? ` · ${e.error}` : ""}
                    </div>
                  </div>
                  <Badge variant={e.status === "failed" ? "danger" : "success"}>{e.status}</Badge>
                </div>
              ))}
            </CardContent>
          </Card>
        </div>
      </div>

      <div className="space-y-4 xl:sticky xl:top-4 xl:self-start">
        <Card>
          <CardHeader>Amounts</CardHeader>
          <CardContent className="space-y-2 text-sm">
            <Row
              label="Subtotal"
              value={formatChf(invoice.subtotalCents - invoice.discountCents)}
            />
            <Row label="VAT" value={formatChf(invoice.taxCents)} />
            <div className="border-text-primary border-t pt-2">
              <Row label="Total" value={formatChf(invoice.totalAmountCents)} strong />
            </div>
            {invoice.depositAppliedCents > 0 && (
              <Row
                label="Deposit received"
                value={`−${formatChf(invoice.depositAppliedCents)}`}
                muted
              />
            )}
            {invoice.amountPaidCents > 0 && (
              <Row label="Paid" value={`−${formatChf(invoice.amountPaidCents)}`} muted />
            )}
            <div className="border-surface-divider border-t pt-2">
              <Row label="Open balance" value={formatChf(invoice.balanceDueCents)} strong />
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>Details</CardHeader>
          <CardContent className="space-y-1.5 text-sm">
            <Row label="Issued" value={formatDate(swissDay(invoice.issuedAt))} />
            <Row label="Due" value={formatDate(dueDay)} />
            <Row label="Service date" value={formatDate(invoice.serviceDate)} />
            {invoice.paidAt && <Row label="Paid on" value={formatDate(swissDay(invoice.paidAt))} />}
            <div className="text-text-secondary pt-1">
              <span className="text-text-muted text-xs">Payment reference</span>
              <div className="font-mono text-xs break-all">
                {formatPaymentReference(invoice.paymentReference) || "—"}
              </div>
            </div>
            {invoice.costCapCents !== null && (
              <Row label="Cost cap" value={formatChf(invoice.costCapCents)} muted />
            )}
            {invoice.costCapOverrideReason && (
              <p className="text-warning-700 text-xs">
                Cost cap exceeded: {invoice.costCapOverrideReason}
              </p>
            )}
            <div className="pt-1">
              <Link
                href={`/jobs/${invoice.jobId}`}
                className="text-signal-600 text-xs hover:underline"
              >
                Job {invoice.jobNumber}
              </Link>
            </div>
          </CardContent>
        </Card>

        <div className="flex flex-col gap-2">
          {permissions.edit && isOpen && pastDue && invoice.reminderLevel < 3 && (
            <Button onClick={() => setDialog({ kind: "reminder" })}>
              <BellRing className="h-4 w-4" />
              {REMINDER_LABELS[invoice.reminderLevel + 1]}
            </Button>
          )}
          {permissions.edit && invoicePdf && invoice.status !== "void" && (
            <Button variant="secondary" onClick={() => setDialog({ kind: "resend" })}>
              <Mail className="h-4 w-4" />
              E-mail invoice again
            </Button>
          )}
          {permissions.cancel && isOpen && invoice.amountPaidCents === 0 && (
            <Button variant="dangerGhost" onClick={() => setDialog({ kind: "void" })}>
              <Ban className="h-4 w-4" />
              Void invoice
            </Button>
          )}
          {permissions.cancel && isOpen && pastDue && (
            <Button variant="dangerGhost" onClick={() => setDialog({ kind: "writeOff" })}>
              <XCircle className="h-4 w-4" />
              Write off balance
            </Button>
          )}
        </div>
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
          title={`Void invoice ${invoice.invoiceNumber}?`}
          description="The invoice stays on record as void and its number is not reused. The job can then be settled again."
          confirmLabel="Void invoice"
          pending={voidMutation.isPending}
          onClose={() => setDialog(null)}
          onConfirm={(reason) =>
            run(() => voidMutation.mutateAsync({ id: invoice.id, reason }), "Invoice voided")
          }
        />
      )}
      {dialog?.kind === "writeOff" && (
        <ReasonDialog
          title={`Write off ${formatChf(invoice.balanceDueCents)}?`}
          description="Use this when the open balance will not be paid (e.g. after unsuccessful debt collection)."
          confirmLabel="Write off"
          pending={writeOff.isPending}
          onClose={() => setDialog(null)}
          onConfirm={(reason) =>
            run(() => writeOff.mutateAsync({ id: invoice.id, reason }), "Balance written off")
          }
        />
      )}
      {dialog?.kind === "cancelPayment" && (
        <ReasonDialog
          title={`Cancel payment of ${formatChf(dialog.amountCents)}?`}
          description="For payments recorded by mistake. The payment stays visible as cancelled and the open balance increases again."
          confirmLabel="Cancel payment"
          pending={cancelPayment.isPending}
          onClose={() => setDialog(null)}
          onConfirm={(reason) =>
            run(
              () => cancelPayment.mutateAsync({ id: dialog.paymentId, reason }),
              "Payment cancelled",
            )
          }
        />
      )}
    </div>
  )
}
