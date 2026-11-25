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

/**
 * Sending freezes the quote and stores its PDF. E-mail is optional (quotes
 * handed over in person or by post are "sent" too). "resend" mails the stored
 * PDF of an already sent quote again.
 */
export function SendDialog({
  quoteId,
  customerEmail,
  totalCents,
  mode = "send",
  onClose,
}: {
  quoteId: string
  customerEmail: string | null
  totalCents: number
  mode?: "send" | "resend"
  onClose: () => void
}) {
  const toast = useToast()
  const utils = trpc.useUtils()
  const send = trpc.quotes.send.useMutation()
  const resend = trpc.quotes.resendEmail.useMutation()
  const [email, setEmail] = useState(customerEmail ?? "")
  const [message, setMessage] = useState("")
  const [byEmail, setByEmail] = useState(Boolean(customerEmail) || mode === "resend")
  const pending = send.isPending || resend.isPending

  async function submit() {
    try {
      const result =
        mode === "resend"
          ? await resend.mutateAsync({ id: quoteId, recipientEmail: email.trim(), message })
          : await send.mutateAsync({
              id: quoteId,
              sendEmail: byEmail,
              ...(byEmail && email.trim() ? { recipientEmail: email.trim() } : {}),
              message,
            })

      await utils.quotes.invalidate()
      if (result.emailDelivered === false) {
        toast.error(
          "Offerte als gesendet gespeichert — E-Mail nicht zugestellt",
          `${("emailError" in result && result.emailError) || "Unbekannter Fehler"}. Lade das PDF herunter und sende es selbst.`,
        )
      } else if (result.emailDelivered) {
        toast.success(`Offerte an ${email.trim()} gesendet`)
      } else {
        toast.success("Offerte als gesendet markiert")
      }
      onClose()
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Senden fehlgeschlagen")
    }
  }

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>
            {mode === "resend"
              ? "Offerte erneut senden"
              : `Offerte senden (${formatChf(totalCents)})`}
          </DialogTitle>
          {mode === "send" && (
            <DialogDescription>
              Die Offerte wird fixiert und als PDF gespeichert. Spätere Änderungen gibt es als neue
              Version.
            </DialogDescription>
          )}
        </DialogHeader>
        <div className="space-y-4 py-2">
          {mode === "send" && (
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
                <FieldLabel htmlFor="send-email" required>
                  An
                </FieldLabel>
                <Input
                  id="send-email"
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                />
              </div>
              <div>
                <FieldLabel htmlFor="send-message">Persönliche Nachricht</FieldLabel>
                <Textarea
                  id="send-message"
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
            {pending ? "Wird gesendet …" : byEmail ? "E-Mail senden" : "Als gesendet markieren"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
