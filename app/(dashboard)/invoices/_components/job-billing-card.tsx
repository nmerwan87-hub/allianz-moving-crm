"use client"

import { useState } from "react"
import Link from "next/link"
import { useRouter } from "next/navigation"
import { Calculator, Wallet, XCircle } from "lucide-react"
import { trpc } from "@/lib/trpc/client"
import { formatChf } from "@/lib/format/money"
import { Button } from "@/app/(dashboard)/_components/ui/button"
import { Badge } from "@/app/(dashboard)/_components/ui/badge"
import { Card, CardContent, CardHeader } from "@/app/(dashboard)/_components/ui/card"
import { useToast } from "@/app/(dashboard)/_components/ui/toast"
import { formatDate } from "../../quotes/_lib/labels"
import {
  INVOICE_STATUS_BADGE,
  INVOICE_STATUS_LABELS,
  PAYMENT_METHOD_LABELS,
  swissDay,
} from "../_lib/labels"
import { PaymentDialog } from "./payment-dialog"
import { ReasonDialog } from "./reason-dialog"

/** Billing on the job page: deposits, final settlement, link to the invoice. */
export function JobBillingCard({ jobId }: { jobId: string }) {
  const router = useRouter()
  const toast = useToast()
  const utils = trpc.useUtils()
  const query = trpc.invoices.forJob.useQuery({ jobId })
  const settle = trpc.invoices.createFromJob.useMutation()
  const cancelPayment = trpc.invoices.cancelPayment.useMutation()
  const [depositOpen, setDepositOpen] = useState(false)
  const [cancelId, setCancelId] = useState<string | null>(null)

  if (!query.data) return null
  const billing = query.data
  const received = billing.deposits
    .filter((d) => d.status === "completed")
    .reduce((sum, d) => sum + d.amountCents, 0)

  async function createSettlement() {
    try {
      const { id } = await settle.mutateAsync({ jobId })
      await Promise.all([utils.invoices.invalidate(), utils.jobs.invalidate()])
      router.push(`/invoices/${id}`)
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not create the settlement")
    }
  }

  return (
    <Card>
      <CardHeader>Billing</CardHeader>
      <CardContent className="space-y-3 text-sm">
        {billing.invoice ? (
          <Link
            href={`/invoices/${billing.invoice.id}`}
            className="border-surface-divider hover:bg-surface-sunken block rounded-[var(--radius-md)] border p-3"
          >
            <div className="flex items-center justify-between gap-2">
              <span className="text-text-primary font-medium">
                {billing.invoice.invoiceNumber ?? "Settlement draft"}
              </span>
              <Badge variant={INVOICE_STATUS_BADGE[billing.invoice.status] ?? "neutral"}>
                {INVOICE_STATUS_LABELS[billing.invoice.status]}
              </Badge>
            </div>
            <div className="text-text-muted mt-1 flex justify-between text-xs">
              <span>Total {formatChf(billing.invoice.totalAmountCents)}</span>
              {billing.invoice.status !== "draft" && (
                <span>Open {formatChf(billing.invoice.balanceDueCents)}</span>
              )}
            </div>
            {billing.invoice.dueAt && (
              <div className="text-text-muted text-xs">
                Due {formatDate(swissDay(billing.invoice.dueAt))}
              </div>
            )}
          </Link>
        ) : billing.canSettle ? (
          billing.permissions.create && (
            <Button className="w-full" onClick={createSettlement} disabled={settle.isPending}>
              <Calculator className="h-4 w-4" />
              {settle.isPending ? "Creating..." : "Create final settlement"}
            </Button>
          )
        ) : (
          <p className="text-text-muted">The final settlement is made once the move has started.</p>
        )}

        {billing.voidedInvoices.length > 0 && (
          <p className="text-text-muted text-xs">
            Voided:{" "}
            {billing.voidedInvoices.map((v, i) => (
              <span key={v.id}>
                {i > 0 && ", "}
                <Link href={`/invoices/${v.id}`} className="hover:underline">
                  {v.invoiceNumber ?? "draft"}
                </Link>
              </span>
            ))}
          </p>
        )}

        {billing.permissions.viewPayments && (
          <div className="border-surface-divider space-y-2 border-t pt-3">
            <div className="flex justify-between">
              <span className="text-text-muted">Deposit</span>
              <span className="tabular-nums">
                {formatChf(received)}
                {billing.depositExpectedCents > 0 && (
                  <span className="text-text-muted">
                    {" "}
                    / {formatChf(billing.depositExpectedCents)}
                  </span>
                )}
              </span>
            </div>
            {billing.deposits.map((d) => (
              <div key={d.id} className="flex items-center justify-between gap-2 text-xs">
                <span
                  className={
                    d.status === "cancelled"
                      ? "text-text-muted line-through"
                      : "text-text-secondary"
                  }
                >
                  {formatDate(d.paidAt)} · {PAYMENT_METHOD_LABELS[d.method]}
                </span>
                <span className="flex items-center gap-1 tabular-nums">
                  {formatChf(d.amountCents)}
                  {billing.permissions.recordPayments &&
                    billing.canRecordDeposit &&
                    d.status === "completed" && (
                      <button
                        type="button"
                        aria-label="Cancel deposit"
                        className="text-text-muted hover:text-danger-700"
                        onClick={() => setCancelId(d.id)}
                      >
                        <XCircle className="h-3.5 w-3.5" />
                      </button>
                    )}
                </span>
              </div>
            ))}
            {billing.permissions.recordPayments && billing.canRecordDeposit && (
              <Button
                size="sm"
                variant="secondary"
                className="w-full"
                onClick={() => setDepositOpen(true)}
              >
                <Wallet className="h-4 w-4" />
                Record deposit
              </Button>
            )}
          </div>
        )}
      </CardContent>

      {depositOpen && (
        <PaymentDialog
          target={{
            kind: "deposit",
            jobId,
            suggestedCents: Math.max(billing.depositExpectedCents - received, 0),
          }}
          onClose={() => setDepositOpen(false)}
        />
      )}
      {cancelId && (
        <ReasonDialog
          title="Cancel this deposit?"
          description="For deposits recorded by mistake. It stays visible as cancelled."
          confirmLabel="Cancel deposit"
          pending={cancelPayment.isPending}
          onClose={() => setCancelId(null)}
          onConfirm={async (reason) => {
            try {
              await cancelPayment.mutateAsync({ id: cancelId, reason })
              await Promise.all([utils.invoices.invalidate(), utils.jobs.invalidate()])
              toast.success("Deposit cancelled")
              setCancelId(null)
            } catch (err) {
              toast.error(err instanceof Error ? err.message : "Failed to cancel")
            }
          }}
        />
      )}
    </Card>
  )
}
