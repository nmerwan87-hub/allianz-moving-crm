"use client"

import { useState } from "react"
import Link from "next/link"
import { useRouter } from "next/navigation"
import {
  Ban,
  CheckCircle2,
  Copy,
  Download,
  Link2,
  Mail,
  Receipt,
  Truck,
  XCircle,
} from "lucide-react"
import { trpc } from "@/lib/trpc/client"
import { formatChf, formatCents } from "@/lib/format/money"
import { Button } from "@/app/(dashboard)/_components/ui/button"
import { Badge } from "@/app/(dashboard)/_components/ui/badge"
import { Textarea, FieldLabel } from "@/app/(dashboard)/_components/ui/field"
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/app/(dashboard)/_components/ui/dialog"
import { ConfirmDialog } from "@/app/(dashboard)/_components/ui/confirm-dialog"
import { useToast } from "@/app/(dashboard)/_components/ui/toast"
import { AttachmentsBlock } from "@/app/(dashboard)/_components/attachments-block"
import {
  DetailCard as Card,
  DetailField as Field,
  StatusBanner as Banner,
  formatQuantity as qty,
} from "@/app/(dashboard)/_components/ui/detail"
import { useHasPermission } from "@/app/(dashboard)/_lib/permissions"
import type { inferRouterOutputs } from "@trpc/server"
import type { AppRouter } from "@/lib/trpc/router"
import { JOB_STATUS_LABELS } from "../../jobs/_lib/labels"
import { INVOICE_STATUS_LABELS } from "../../invoices/_lib/labels"
import {
  MOVE_TYPE_LABELS,
  QUOTE_STATUS_BADGE,
  QUOTE_STATUS_LABELS,
  formatDate,
} from "../_lib/labels"
import { SendDialog } from "./send-dialog"

type QuoteDetail = inferRouterOutputs<AppRouter>["quotes"]["get"]

function address(street: string | null, postal: string | null, city: string | null): string {
  return [street, [postal, city].filter(Boolean).join(" ")].filter(Boolean).join(", ")
}

function floor(f: number | null, lift: boolean): string | null {
  if (f === null) return null
  return `${f === 0 ? "Erdgeschoss" : `${f}. Stock`}${f !== 0 ? (lift ? ", Lift" : ", kein Lift") : ""}`
}

/**
 * A quote after sending (Bixin structure): status banner with the next step,
 * customer, move, the priced lines with their calculation, terms, documents
 * and — once accepted — the job and its final settlement.
 */
export function QuoteView({ data }: { data: QuoteDetail }) {
  const router = useRouter()
  const toast = useToast()
  const utils = trpc.useUtils()
  const { quote, lines, documents, emails, versions, permissions, job } = data
  const [resendOpen, setResendOpen] = useState(false)
  const [declineOpen, setDeclineOpen] = useState(false)
  const [declineReason, setDeclineReason] = useState("")
  const [confirm, setConfirm] = useState<null | "accept" | "cancel">(null)
  const canCreateInvoice = useHasPermission("invoices.create")

  const accept = trpc.quotes.markAccepted.useMutation()
  const decline = trpc.quotes.markDeclined.useMutation()
  const cancel = trpc.quotes.cancel.useMutation()
  const revise = trpc.quotes.createRevision.useMutation()
  const settle = trpc.invoices.createFromJob.useMutation()
  const portalLink = trpc.quotes.portalLink.useMutation()

  async function copyPortalLink() {
    try {
      const { url } = await portalLink.mutateAsync({ id: quote.id })
      await navigator.clipboard.writeText(url)
      toast.success("Link kopiert — z. B. per WhatsApp an den Kunden senden")
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Link konnte nicht erstellt werden")
    }
  }

  const open = quote.status === "sent" || quote.status === "viewed"
  const canRevise = ["sent", "viewed", "expired", "declined"].includes(quote.status)

  async function run(action: () => Promise<unknown>, success: string) {
    try {
      await action()
      await utils.quotes.invalidate()
      toast.success(success)
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Aktion fehlgeschlagen")
    }
  }

  async function download(documentId: string) {
    try {
      const { url } = await utils.quotes.documentUrl.fetch({ id: quote.id, documentId })
      window.open(url, "_blank", "noopener")
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Download fehlgeschlagen")
    }
  }

  async function newVersion() {
    try {
      const { id } = await revise.mutateAsync({ id: quote.id })
      await utils.quotes.invalidate()
      router.push(`/quotes/${id}`)
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Neue Version konnte nicht erstellt werden")
    }
  }

  // ── Banner: what to do next ──
  let banner: React.ReactNode = null
  if (open) {
    banner = (
      <Banner tone="info" title="Offerte ist beim Kunden">
        Gesendet am {formatDate(quote.sentAt)}, gültig bis {formatDate(quote.expiresAt)}. Hat der
        Kunde zugesagt oder abgelehnt?
        {permissions.edit && (
          <div className="mt-3 flex flex-wrap gap-2">
            <Button size="sm" onClick={() => setConfirm("accept")}>
              <CheckCircle2 className="h-4 w-4" />
              Kunde hat angenommen
            </Button>
            <Button size="sm" variant="secondary" onClick={() => setDeclineOpen(true)}>
              <XCircle className="h-4 w-4" />
              Kunde hat abgelehnt
            </Button>
          </div>
        )}
      </Banner>
    )
  } else if (quote.status === "accepted") {
    banner = (
      <Banner tone="success" title="Angenommen">
        Angenommen am {formatDate(quote.acceptedAt)}
        {quote.acceptedByName ? ` online von ${quote.acceptedByName}` : ""}.
        {job ? (
          <div className="mt-3 flex flex-wrap items-center gap-2">
            <Link href={`/jobs/${job.id}`}>
              <Button size="sm" variant="secondary">
                <Truck className="h-4 w-4" />
                Auftrag {job.jobNumber} · {JOB_STATUS_LABELS[job.status]}
              </Button>
            </Link>
            {job.invoice ? (
              <Link href={`/invoices/${job.invoice.id}`}>
                <Button size="sm">
                  <Receipt className="h-4 w-4" />
                  {job.invoice.invoiceNumber
                    ? `Rechnung ${job.invoice.invoiceNumber} · ${INVOICE_STATUS_LABELS[job.invoice.status]}`
                    : "Abrechnung anpassen"}
                </Button>
              </Link>
            ) : (
              canCreateInvoice &&
              ["in_progress", "completed"].includes(job.status) && (
                <Button
                  size="sm"
                  disabled={settle.isPending}
                  onClick={async () => {
                    try {
                      const { id } = await settle.mutateAsync({ jobId: job.id })
                      router.push(`/invoices/${id}`)
                    } catch (err) {
                      toast.error(err instanceof Error ? err.message : "Abrechnung fehlgeschlagen")
                    }
                  }}
                >
                  <Receipt className="h-4 w-4" />
                  Finale Abrechnung erstellen
                </Button>
              )
            )}
          </div>
        ) : (
          " Der Auftrag wird gerade erstellt."
        )}
      </Banner>
    )
  } else if (quote.status === "declined") {
    banner = (
      <Banner tone="danger" title="Abgelehnt">
        {quote.declinedReason ?? "Ohne Grund."}
      </Banner>
    )
  } else if (quote.status === "expired") {
    banner = (
      <Banner tone="warning" title="Abgelaufen">
        Die Gültigkeit endete am {formatDate(quote.expiresAt)}. Erstelle eine neue Version, um sie
        erneut zu senden.
      </Banner>
    )
  }

  return (
    <div className="mx-auto max-w-4xl space-y-4">
      {banner}

      <div className="grid gap-4 md:grid-cols-2">
        <Card
          title="Kunde"
          action={
            quote.customerId ? (
              <Link
                href={`/customers/${quote.customerId}`}
                className="text-signal-600 text-sm hover:underline"
              >
                Öffnen
              </Link>
            ) : undefined
          }
        >
          <dl className="grid gap-2">
            <Field label="Name">{quote.customerName}</Field>
            <Field label="E-Mail">{quote.customerEmail}</Field>
          </dl>
        </Card>
        <Card title="Umzug">
          <dl className="grid grid-cols-2 gap-2">
            <Field label="Umzugsdatum">{formatDate(quote.scheduledDate)}</Field>
            <Field label="Zimmer">{quote.rooms}</Field>
            <Field label="Von">
              {address(quote.originAddress, quote.originPostalCode, quote.originCity)}
              <span className="text-text-muted block text-xs">
                {floor(quote.originFloor, quote.originHasElevator)}
              </span>
            </Field>
            <Field label="Nach">
              {address(quote.destAddress, quote.destPostalCode, quote.destCity)}
              <span className="text-text-muted block text-xs">
                {floor(quote.destFloor, quote.destHasElevator)}
              </span>
            </Field>
            <Field label="Art">{MOVE_TYPE_LABELS[quote.moveType]}</Field>
            {quote.distanceKm ? <Field label="Distanz">{qty(quote.distanceKm)} km</Field> : null}
          </dl>
        </Card>
      </div>

      <Card title={`Offerte${quote.pricingKind === "flat" ? " · Pauschal" : " · Nach Aufwand"}`}>
        <ul className="divide-surface-divider divide-y text-sm">
          {lines.map((l) => (
            <li key={l.id} className="flex items-start justify-between gap-4 py-2">
              <div className="min-w-0">
                <p className="text-text-primary">{l.name}</p>
                {l.description && <p className="text-text-muted text-xs">{l.description}</p>}
              </div>
              <span className="text-text-secondary text-right whitespace-nowrap tabular-nums">
                {l.unitPriceCents === 0 ? (
                  <span className="text-text-muted">inklusive</span>
                ) : l.pricingMode === "manual" || l.quantity === 1 ? (
                  `CHF ${formatCents(l.netTotalCents)}`
                ) : (
                  <>
                    <span className="text-text-muted text-xs">
                      CHF {formatCents(l.unitPriceCents)} × {qty(l.quantity)} {l.unit ?? ""} ={" "}
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
          <div className="text-text-secondary flex justify-between">
            <dt>Zwischensumme</dt>
            <dd className="tabular-nums">{formatChf(quote.subtotalCents - quote.discountCents)}</dd>
          </div>
          <div className="text-text-secondary flex justify-between">
            <dt>MWST</dt>
            <dd className="tabular-nums">{formatChf(quote.taxCents)}</dd>
          </div>
          <div className="text-text-primary flex justify-between text-base font-semibold">
            <dt>Total</dt>
            <dd className="tabular-nums">{formatChf(quote.totalAmountCents)}</dd>
          </div>
          {quote.costCapCents !== null && (
            <div className="text-text-muted flex justify-between">
              <dt>Kostendach</dt>
              <dd className="tabular-nums">{formatChf(quote.costCapCents)}</dd>
            </div>
          )}
          {quote.depositAmountCents > 0 && (
            <div className="text-text-muted flex justify-between">
              <dt>Anzahlung {quote.depositPercent} %</dt>
              <dd className="tabular-nums">{formatChf(quote.depositAmountCents)}</dd>
            </div>
          )}
          {quote.totalCostCents !== null && (
            <div className="text-text-muted flex justify-between">
              <dt>Einstandskosten (intern)</dt>
              <dd className="tabular-nums">{formatChf(quote.totalCostCents)}</dd>
            </div>
          )}
        </dl>
        {quote.customerNotes && (
          <p className="bg-surface-sunken text-text-secondary mt-3 rounded-[var(--radius-md)] px-3 py-2 text-sm whitespace-pre-line">
            {quote.customerNotes}
          </p>
        )}
      </Card>

      <div className="grid gap-4 md:grid-cols-2">
        <Card title="Dokumente und E-Mails">
          <div className="space-y-2 text-sm">
            {documents.length === 0 && <p className="text-text-muted">Keine Dokumente.</p>}
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
                {e.to} · {formatDate(e.createdAt)} ·{" "}
                <span className={e.status === "failed" ? "text-danger-700" : "text-success-700"}>
                  {e.status === "failed" ? "nicht zugestellt" : "gesendet"}
                </span>
              </div>
            ))}
          </div>
        </Card>
        <Card title="Angaben">
          <dl className="grid grid-cols-2 gap-2">
            <Field label="Gesendet">{formatDate(quote.sentAt)}</Field>
            <Field label="Gültig bis">{formatDate(quote.expiresAt)}</Field>
            {quote.internalNotes && (
              <div className="col-span-2">
                <Field label="Interne Notiz">
                  <span className="whitespace-pre-line">{quote.internalNotes}</span>
                </Field>
              </div>
            )}
          </dl>
          {versions.length > 1 && (
            <div className="border-surface-divider mt-3 space-y-1 border-t pt-2">
              {versions.map((v) => (
                <Link
                  key={v.id}
                  href={`/quotes/${v.id}`}
                  className={`flex items-center justify-between text-sm ${v.id === quote.id ? "font-semibold" : "text-signal-600 hover:underline"}`}
                >
                  <span>Version {v.version}</span>
                  <Badge variant={QUOTE_STATUS_BADGE[v.status] ?? "neutral"}>
                    {QUOTE_STATUS_LABELS[v.status] ?? v.status}
                  </Badge>
                </Link>
              ))}
            </div>
          )}
        </Card>
      </div>

      <Card title="Anhänge">
        <AttachmentsBlock entityType="quote" entityId={quote.id} canEdit={permissions.edit} />
      </Card>

      {permissions.edit && (open || canRevise || quote.status === "accepted") && (
        <div className="flex flex-wrap gap-2">
          {(open || quote.status === "accepted") && permissions.send && (
            <Button variant="secondary" disabled={portalLink.isPending} onClick={copyPortalLink}>
              <Link2 className="h-4 w-4" />
              Kundenlink kopieren
            </Button>
          )}
          {open && permissions.send && (
            <Button variant="secondary" onClick={() => setResendOpen(true)}>
              <Mail className="h-4 w-4" />
              Erneut senden
            </Button>
          )}
          {canRevise && (
            <Button variant="secondary" disabled={revise.isPending} onClick={newVersion}>
              <Copy className="h-4 w-4" />
              Neue Version
            </Button>
          )}
          {open && (
            <Button variant="dangerGhost" onClick={() => setConfirm("cancel")}>
              <Ban className="h-4 w-4" />
              Offerte zurückziehen
            </Button>
          )}
        </div>
      )}

      {resendOpen && (
        <SendDialog
          mode="resend"
          quoteId={quote.id}
          customerEmail={quote.customerEmail}
          totalCents={quote.totalAmountCents}
          onClose={() => setResendOpen(false)}
        />
      )}

      <Dialog open={declineOpen} onOpenChange={setDeclineOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Kunde hat abgelehnt</DialogTitle>
          </DialogHeader>
          <div className="py-2">
            <FieldLabel htmlFor="decline-reason" required>
              Grund
            </FieldLabel>
            <Textarea
              id="decline-reason"
              rows={3}
              value={declineReason}
              placeholder="z. B. zu teuer, andere Firma gewählt"
              onChange={(e) => setDeclineReason(e.target.value)}
            />
          </div>
          <DialogFooter>
            <Button variant="secondary" onClick={() => setDeclineOpen(false)}>
              Abbrechen
            </Button>
            <Button
              disabled={!declineReason.trim() || decline.isPending}
              onClick={async () => {
                await run(
                  () => decline.mutateAsync({ id: quote.id, reason: declineReason }),
                  "Offerte als abgelehnt markiert",
                )
                setDeclineOpen(false)
              }}
            >
              Speichern
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <ConfirmDialog
        open={confirm !== null}
        onOpenChange={(o) => !o && setConfirm(null)}
        title={confirm === "accept" ? "Als angenommen markieren?" : "Offerte zurückziehen?"}
        description={
          confirm === "accept"
            ? "Der Auftrag wird automatisch aus dieser Offerte erstellt und die Anfrage als gebucht markiert."
            : "Der Kunde kann diese Offerte danach nicht mehr annehmen."
        }
        confirmLabel={confirm === "accept" ? "Angenommen" : "Zurückziehen"}
        onConfirm={() =>
          confirm === "accept"
            ? run(
                () => accept.mutateAsync({ id: quote.id }),
                "Offerte angenommen — Auftrag wird erstellt",
              )
            : run(() => cancel.mutateAsync({ id: quote.id }), "Offerte zurückgezogen")
        }
      />
    </div>
  )
}
