"use client"

import { useState } from "react"
import { trpc } from "@/lib/trpc/client"
import { formatChf, formatCents, parseToCents } from "@/lib/format/money"
import { Button } from "@/app/(dashboard)/_components/ui/button"
import {
  Input,
  Select,
  FieldLabel,
  FieldError,
  FieldHint,
} from "@/app/(dashboard)/_components/ui/field"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/app/(dashboard)/_components/ui/dialog"
import { useToast } from "@/app/(dashboard)/_components/ui/toast"
import { paymentMethodEnum } from "@/modules/invoices/interface"
import { PAYMENT_METHOD_LABELS, todaySwiss } from "../_lib/labels"

/**
 * Records a received payment: on an issued invoice (partial or full), or as a
 * deposit on a job before it is invoiced. The database checks the amount
 * against the open balance and updates the invoice status.
 */
export function PaymentDialog({
  target,
  onClose,
}: {
  target:
    | { kind: "invoice"; invoiceId: string; balanceCents: number; label: string }
    | { kind: "deposit"; jobId: string; suggestedCents: number }
  onClose: () => void
}) {
  const toast = useToast()
  const utils = trpc.useUtils()
  const recordPayment = trpc.invoices.recordPayment.useMutation()
  const recordDeposit = trpc.invoices.recordDeposit.useMutation()
  const initial = target.kind === "invoice" ? target.balanceCents : target.suggestedCents
  const [amount, setAmount] = useState(initial > 0 ? formatCents(initial) : "")
  const [method, setMethod] = useState<(typeof paymentMethodEnum.options)[number]>("bank_transfer")
  const [paidOn, setPaidOn] = useState(todaySwiss())
  const [reference, setReference] = useState("")
  const [notes, setNotes] = useState("")
  const [error, setError] = useState<string | null>(null)
  const pending = recordPayment.isPending || recordDeposit.isPending

  async function submit() {
    const cents = parseToCents(amount)
    if (!cents || cents <= 0) return setError("Enter an amount like 450 or 1'250.50.")
    if (target.kind === "invoice" && cents > target.balanceCents)
      return setError(`The open balance is ${formatChf(target.balanceCents)}.`)
    if (!paidOn) return setError("Enter the payment date.")
    const fields = { amountCents: cents, method, paidOn, reference, notes }
    try {
      if (target.kind === "invoice") {
        const result = await recordPayment.mutateAsync({ invoiceId: target.invoiceId, ...fields })
        toast.success(
          result.balanceDueCents === 0
            ? "Payment recorded — invoice fully paid"
            : `Payment recorded — ${formatChf(result.balanceDueCents)} still open`,
        )
      } else {
        await recordDeposit.mutateAsync({ jobId: target.jobId, ...fields })
        toast.success("Deposit recorded")
      }
      await Promise.all([utils.invoices.invalidate(), utils.jobs.invalidate()])
      onClose()
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to record the payment")
    }
  }

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>
            {target.kind === "invoice" ? `Record payment — ${target.label}` : "Record deposit"}
          </DialogTitle>
          <DialogDescription>
            {target.kind === "invoice"
              ? `Open balance ${formatChf(target.balanceCents)}. Partial payments are fine.`
              : "Deposits are deducted on the final invoice."}
          </DialogDescription>
        </DialogHeader>
        <div className="grid gap-3 py-2 sm:grid-cols-2">
          <div>
            <FieldLabel htmlFor="pay-amount" required>
              Amount (CHF)
            </FieldLabel>
            <Input
              id="pay-amount"
              inputMode="decimal"
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
            />
          </div>
          <div>
            <FieldLabel htmlFor="pay-date" required>
              Received on
            </FieldLabel>
            <Input
              id="pay-date"
              type="date"
              value={paidOn}
              onChange={(e) => setPaidOn(e.target.value)}
            />
          </div>
          <div>
            <FieldLabel htmlFor="pay-method">Method</FieldLabel>
            <Select
              id="pay-method"
              value={method}
              onChange={(e) => setMethod(e.target.value as typeof method)}
            >
              {paymentMethodEnum.options.map((m) => (
                <option key={m} value={m}>
                  {PAYMENT_METHOD_LABELS[m]}
                </option>
              ))}
            </Select>
          </div>
          <div>
            <FieldLabel htmlFor="pay-ref">Reference</FieldLabel>
            <Input
              id="pay-ref"
              placeholder="e.g. bank booking text"
              value={reference}
              onChange={(e) => setReference(e.target.value)}
            />
          </div>
          <div className="sm:col-span-2">
            <FieldLabel htmlFor="pay-notes">Notes</FieldLabel>
            <Input id="pay-notes" value={notes} onChange={(e) => setNotes(e.target.value)} />
            <FieldHint>Internal only.</FieldHint>
          </div>
          {error && (
            <div className="sm:col-span-2">
              <FieldError message={error} />
            </div>
          )}
        </div>
        <DialogFooter>
          <Button variant="secondary" onClick={onClose} disabled={pending}>
            Cancel
          </Button>
          <Button onClick={submit} disabled={pending}>
            {pending ? "Saving..." : "Record payment"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
