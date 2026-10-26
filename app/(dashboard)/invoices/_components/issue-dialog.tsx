"use client"

import { useState } from "react"
import { trpc } from "@/lib/trpc/client"
import { formatChf } from "@/lib/format/money"
import { Button } from "@/app/(dashboard)/_components/ui/button"
import { Input, Textarea, FieldLabel, FieldHint } from "@/app/(dashboard)/_components/ui/field"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/app/(dashboard)/_components/ui/dialog"
import { useToast } from "@/app/(dashboard)/_components/ui/toast"
import { REMINDER_LABELS } from "../_lib/labels"

/**
 * issue    → number, dates and QR reference are assigned, PDF stored, optional e-mail
 * resend   → the stored invoice PDF by e-mail again
 * reminder → next payment reminder with a new QR-bill for the open balance
 */
export function IssueDialog({
  invoiceId,
  customerEmail,
  amountCents,
  mode,
  reminderLevel = 0,
  onClose,
}: {
  invoiceId: string
  customerEmail: string | null
  amountCents: number
  mode: "issue" | "resend" | "reminder"
  reminderLevel?: number
  onClose: () => void
}) {
  const toast = useToast()
  const utils = trpc.useUtils()
  const issue = trpc.invoices.issue.useMutation()
  const resend = trpc.invoices.resendEmail.useMutation()
  const remind = trpc.invoices.sendReminder.useMutation()
  const [email, setEmail] = useState(customerEmail ?? "")
  const [message, setMessage] = useState("")
  const [byEmail, setByEmail] = useState(Boolean(customerEmail) || mode === "resend")
  const pending = issue.isPending || resend.isPending || remind.isPending
  const nextReminder = REMINDER_LABELS[reminderLevel + 1] ?? "Reminder"

  async function submit() {
    const recipient = byEmail && email.trim() ? { recipientEmail: email.trim() } : {}
    try {
      let delivered: boolean | null = null
      let emailError: string | null = null
      if (mode === "issue") {
        const result = await issue.mutateAsync({
          id: invoiceId,
          sendEmail: byEmail,
          ...recipient,
          message,
        })
        if (result.documentError) toast.error("Invoice issued", result.documentError)
        else toast.success(`Invoice ${result.invoiceNumber} issued`)
        delivered = result.emailDelivered
        emailError = result.emailError
      } else if (mode === "resend") {
        const result = await resend.mutateAsync({
          id: invoiceId,
          recipientEmail: email.trim(),
          message,
        })
        delivered = result.emailDelivered
        emailError = result.emailError
      } else {
        const result = await remind.mutateAsync({
          id: invoiceId,
          sendEmail: byEmail,
          ...recipient,
          message,
        })
        toast.success(`${REMINDER_LABELS[result.level]} created`)
        delivered = result.emailDelivered
        emailError = result.emailError
      }

      await utils.invoices.invalidate()
      await utils.jobs.invalidate()
      if (delivered === false) {
        toast.error(
          "E-mail not delivered",
          `${emailError ?? "Unknown error"}. Download the PDF and send it yourself.`,
        )
      } else if (delivered) {
        toast.success(`E-mailed to ${email.trim()}`)
      }
      onClose()
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Action failed")
    }
  }

  const title =
    mode === "issue"
      ? `Issue invoice (${formatChf(amountCents)})`
      : mode === "resend"
        ? "E-mail invoice again"
        : `${nextReminder} (${formatChf(amountCents)} open)`

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          {mode === "issue" && (
            <DialogDescription>
              The invoice gets its number and QR-bill and is frozen. Corrections afterwards: void it
              and settle again.
            </DialogDescription>
          )}
          {mode === "reminder" && (
            <DialogDescription>
              A reminder letter with a new QR-bill for the open balance and 10 days to pay.
            </DialogDescription>
          )}
        </DialogHeader>
        <div className="space-y-4 py-2">
          {mode !== "resend" && (
            <label className="text-text-primary flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                checked={byEmail}
                onChange={(e) => setByEmail(e.target.checked)}
              />
              Send by e-mail with the PDF attached
            </label>
          )}
          {byEmail && (
            <>
              <div>
                <FieldLabel htmlFor="issue-email" required>
                  To
                </FieldLabel>
                <Input
                  id="issue-email"
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                />
              </div>
              <div>
                <FieldLabel htmlFor="issue-message">Personal message</FieldLabel>
                <Textarea
                  id="issue-message"
                  rows={3}
                  value={message}
                  onChange={(e) => setMessage(e.target.value)}
                />
                <FieldHint>Added to the standard text in the customer&apos;s language.</FieldHint>
              </div>
            </>
          )}
        </div>
        <DialogFooter>
          <Button variant="secondary" onClick={onClose} disabled={pending}>
            Cancel
          </Button>
          <Button onClick={submit} disabled={pending || (byEmail && !email.includes("@"))}>
            {pending
              ? "Working..."
              : mode === "issue"
                ? byEmail
                  ? "Issue and send"
                  : "Issue invoice"
                : mode === "resend"
                  ? "Send e-mail"
                  : byEmail
                    ? "Create and send"
                    : "Create reminder"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
