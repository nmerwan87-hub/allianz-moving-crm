"use client"

import { useState, useTransition } from "react"
import { useRouter } from "next/navigation"
import { CheckCircle2 } from "lucide-react"
import { acceptQuote, declineQuote } from "./actions"

/** Accept (typed name + confirmation) or decline (reason) — the customer's answer. */
export function QuoteDecision({
  token,
  totalLabel,
  accentColor,
}: {
  token: string
  totalLabel: string
  accentColor: string
}) {
  const router = useRouter()
  const [mode, setMode] = useState<"accept" | "decline">("accept")
  const [name, setName] = useState("")
  const [terms, setTerms] = useState(false)
  const [reason, setReason] = useState("")
  const [error, setError] = useState<string | null>(null)
  const [pending, start] = useTransition()

  function submit() {
    setError(null)
    start(async () => {
      const result =
        mode === "accept"
          ? await acceptQuote(token, name, terms)
          : await declineQuote(token, reason)
      if (!result.ok) setError(result.message)
      else router.refresh()
    })
  }

  const input =
    "border-surface-divider bg-surface-raised text-text-primary w-full rounded-[var(--radius-md)] border px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-signal-500/30"

  return (
    <div className="space-y-4">
      {mode === "accept" ? (
        <>
          <div>
            <label htmlFor="accept-name" className="text-text-secondary mb-1 block text-sm">
              Ihr Vor- und Nachname
            </label>
            <input
              id="accept-name"
              className={input}
              autoComplete="name"
              value={name}
              onChange={(e) => setName(e.target.value)}
            />
          </div>
          <label className="text-text-secondary flex items-start gap-2 text-sm">
            <input
              type="checkbox"
              className="mt-1"
              checked={terms}
              onChange={(e) => setTerms(e.target.checked)}
            />
            Ich nehme die Offerte über {totalLabel} an und akzeptiere die Allgemeinen
            Geschäftsbedingungen.
          </label>
          <button
            type="button"
            disabled={pending}
            onClick={submit}
            style={{ backgroundColor: accentColor }}
            className="inline-flex w-full items-center justify-center gap-2 rounded-[var(--radius-md)] px-4 py-3 text-sm font-semibold text-white disabled:opacity-60 sm:w-auto"
          >
            <CheckCircle2 className="h-4 w-4" />
            {pending ? "Wird gesendet …" : "Offerte verbindlich annehmen"}
          </button>
          <p className="text-text-muted text-xs">
            Nicht einverstanden?{" "}
            <button
              type="button"
              className="underline"
              onClick={() => {
                setMode("decline")
                setError(null)
              }}
            >
              Offerte ablehnen
            </button>
          </p>
        </>
      ) : (
        <>
          <div>
            <label htmlFor="decline-reason" className="text-text-secondary mb-1 block text-sm">
              Schade! Was passt nicht? (z. B. Preis, Datum, andere Firma)
            </label>
            <textarea
              id="decline-reason"
              rows={3}
              className={input}
              value={reason}
              onChange={(e) => setReason(e.target.value)}
            />
          </div>
          <div className="flex flex-wrap gap-3">
            <button
              type="button"
              disabled={pending}
              onClick={submit}
              className="border-surface-divider text-text-primary rounded-[var(--radius-md)] border px-4 py-2.5 text-sm font-medium disabled:opacity-60"
            >
              {pending ? "Wird gesendet …" : "Offerte ablehnen"}
            </button>
            <button
              type="button"
              className="text-text-secondary text-sm underline"
              onClick={() => {
                setMode("accept")
                setError(null)
              }}
            >
              Zurück
            </button>
          </div>
        </>
      )}
      {error && (
        <p role="alert" className="text-danger-700 text-sm">
          {error}
        </p>
      )}
    </div>
  )
}
