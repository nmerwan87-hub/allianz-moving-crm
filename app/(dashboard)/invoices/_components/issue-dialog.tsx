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
  const nextReminder = REMINDER_LABELS[reminderLevel + 1] ?? "Mahnung"

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
        if (result.documentError) toast.error("Rechnung ausgestellt", result.documentError)
        else toast.success(`Rechnung ${result.invoiceNumber} ausgestellt`)
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
        toast.success(`${REMINDER_LABELS[result.level]} erstellt`)
        delivered = result.emailDelivered
        emailError = result.emailError
      }

      await utils.invoices.invalidate()
      await utils.jobs.invalidate()
      if (delivered === false) {
        toast.error(
          "E-Mail nicht zugestellt",
          `${emailError ?? "Unbekannter Fehler"}. Lade das PDF herunter und sende es selbst.`,
        )
      } else if (delivered) {
        toast.success(`An ${email.trim()} gesendet`)
      }
      onClose()
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Aktion fehlgeschlagen")
    }
  }

  const title =
    mode === "issue"
      ? `Rechnung ausstellen (${formatChf(amountCents)})`
      : mode === "resend"
        ? "Rechnung erneut senden"
        : `${nextReminder} (${formatChf(amountCents)} offen)`

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          {mode === "issue" && (
            <DialogDescription>
              Die Rechnung erhält Nummer und QR-Zahlteil und ist danach fixiert. Korrekturen:
              stornieren und neu abrechnen.
            </DialogDescription>
          )}
          {mode === "reminder" && (
            <DialogDescription>
              Ein Mahnschreiben mit neuem QR-Zahlteil über den offenen Betrag und 10 Tagen Frist.
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
              Per E-Mail mit PDF im Anhang senden
            </label>
          )}
          {byEmail && (
            <>
              <div>
                <FieldLabel htmlFor="issue-email" required>
                  An
                </FieldLabel>
                <Input
                  id="issue-email"
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                />
              </div>
              <div>
                <FieldLabel htmlFor="issue-message">Persönliche Nachricht</FieldLabel>
                <Textarea
                  id="issue-message"
                  rows={3}
                  value={message}
                  onChange={(e) => setMessage(e.target.value)}
                />
                <FieldHint>Wird zum Standardtext in der Sprache des Kunden hinzugefügt.</FieldHint>
              </div>
            </>
          )}
        </div>
        <DialogFooter>
          <Button variant="secondary" onClick={onClose} disabled={pending}>
            Abbrechen
          </Button>
          <Button onClick={submit} disabled={pending || (byEmail && !email.includes("@"))}>
            {pending
              ? "Bitte warten …"
              : mode === "issue"
                ? byEmail
                  ? "Ausstellen und senden"
                  : "Rechnung ausstellen"
                : mode === "resend"
                  ? "E-Mail senden"
                  : byEmail
                    ? "Erstellen und senden"
                    : "Mahnung erstellen"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
