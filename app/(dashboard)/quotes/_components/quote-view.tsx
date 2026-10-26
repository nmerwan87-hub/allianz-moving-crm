"use client"

import { useState } from "react"
import Link from "next/link"
import { useRouter } from "next/navigation"
import { CheckCircle2, Copy, Download, Mail, XCircle, Ban } from "lucide-react"
import { trpc } from "@/lib/trpc/client"
import { formatChf, formatCents } from "@/lib/format/money"
import { Button } from "@/app/(dashboard)/_components/ui/button"
import { Badge } from "@/app/(dashboard)/_components/ui/badge"
import { Card, CardContent, CardHeader } from "@/app/(dashboard)/_components/ui/card"
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
import type { inferRouterOutputs } from "@trpc/server"
import type { AppRouter } from "@/lib/trpc/router"
import { QUOTE_STATUS_BADGE, QUOTE_STATUS_LABELS, formatDate } from "../_lib/labels"
import { SendDialog } from "./send-dialog"

type QuoteDetail = inferRouterOutputs<AppRouter>["quotes"]["get"]

export function QuoteView({ data }: { data: QuoteDetail }) {
  const router = useRouter()
  const toast = useToast()
  const utils = trpc.useUtils()
  const { quote, lines, documents, emails, versions, permissions } = data
  const [resendOpen, setResendOpen] = useState(false)
  const [declineOpen, setDeclineOpen] = useState(false)
  const [declineReason, setDeclineReason] = useState("")
  const [confirm, setConfirm] = useState<null | "accept" | "cancel">(null)

  const accept = trpc.quotes.markAccepted.useMutation()
  const decline = trpc.quotes.markDeclined.useMutation()
  const cancel = trpc.quotes.cancel.useMutation()
  const revise = trpc.quotes.createRevision.useMutation()

  const open = quote.status === "sent" || quote.status === "viewed"
  const canRevise = ["sent", "viewed", "expired", "declined"].includes(quote.status)

  async function run(action: () => Promise<unknown>, success: string) {
    try {
      await action()
      await utils.quotes.invalidate()
      toast.success(success)
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Action failed")
    }
  }

  async function download(documentId: string) {
    try {
      const { url } = await utils.quotes.documentUrl.fetch({ id: quote.id, documentId })
      window.open(url, "_blank", "noopener")
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Download failed")
    }
  }

  return (
    <div className="grid gap-6 xl:grid-cols-[1fr_320px]">
      <div className="min-w-0 space-y-6">
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

        <div className="grid gap-6 md:grid-cols-2">
          <Card>
            <CardHeader>Documents</CardHeader>
            <CardContent className="space-y-2">
              {documents.length === 0 && <p className="text-text-muted text-sm">No documents.</p>}
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
            <CardContent className="space-y-2">
              {emails.length === 0 && (
                <p className="text-text-muted text-sm">Not sent by e-mail.</p>
              )}
              {emails.map((e) => (
                <div key={e.id} className="text-sm">
                  <div className="flex items-center gap-2">
                    <span className="text-text-primary">{e.to}</span>
                    <Badge variant={e.status === "failed" ? "danger" : "success"}>
                      {e.status === "failed" ? "Not delivered" : "Sent"}
                    </Badge>
                  </div>
                  <div className="text-text-muted text-xs">
                    {formatDate(e.createdAt)}
                    {e.error ? ` — ${e.error}` : ""}
                  </div>
                </div>
              ))}
            </CardContent>
          </Card>
        </div>

        {(quote.customerNotes || quote.internalNotes) && (
          <Card>
            <CardHeader>Notes</CardHeader>
            <CardContent className="grid gap-4 text-sm sm:grid-cols-2">
              <div>
                <p className="text-text-muted text-xs font-medium uppercase">On the quote</p>
                <p className="text-text-secondary mt-1 whitespace-pre-wrap">
                  {quote.customerNotes ?? "—"}
                </p>
              </div>
              <div>
                <p className="text-text-muted text-xs font-medium uppercase">Internal</p>
                <p className="text-text-secondary mt-1 whitespace-pre-wrap">
                  {quote.internalNotes ?? "—"}
                </p>
              </div>
            </CardContent>
          </Card>
        )}
      </div>

      <div className="space-y-4">
        <Card>
          <CardHeader>Total</CardHeader>
          <CardContent className="space-y-1.5 text-sm">
            <div className="text-text-secondary flex justify-between">
              <span>Subtotal</span>
              <span className="tabular-nums">
                {formatChf(quote.subtotalCents - quote.discountCents)}
              </span>
            </div>
            <div className="text-text-secondary flex justify-between">
              <span>VAT</span>
              <span className="tabular-nums">{formatChf(quote.taxCents)}</span>
            </div>
            <div className="text-text-primary border-text-primary flex justify-between border-t pt-2 text-base font-semibold">
              <span>Total</span>
              <span className="tabular-nums">{formatChf(quote.totalAmountCents)}</span>
            </div>
            {quote.depositAmountCents > 0 && (
              <div className="text-text-muted flex justify-between">
                <span>Deposit {quote.depositPercent}%</span>
                <span className="tabular-nums">{formatChf(quote.depositAmountCents)}</span>
              </div>
            )}
            {quote.costCapCents !== null && (
              <div className="text-text-muted flex justify-between">
                <span>Cost cap</span>
                <span className="tabular-nums">{formatChf(quote.costCapCents)}</span>
              </div>
            )}
            {quote.totalCostCents !== null && (
              <div className="text-text-muted flex justify-between">
                <span>Cost</span>
                <span className="tabular-nums">{formatChf(quote.totalCostCents)}</span>
              </div>
            )}
            <div className="text-text-muted border-surface-divider mt-2 space-y-1 border-t pt-2 text-xs">
              <div>Sent {formatDate(quote.sentAt)}</div>
              <div>Valid until {formatDate(quote.expiresAt)}</div>
              {quote.acceptedAt && <div>Accepted {formatDate(quote.acceptedAt)}</div>}
              {quote.declinedReason && <div>Declined: {quote.declinedReason}</div>}
            </div>
          </CardContent>
        </Card>

        {permissions.edit && (
          <div className="flex flex-col gap-2">
            {open && (
              <>
                <Button onClick={() => setConfirm("accept")}>
                  <CheckCircle2 className="h-4 w-4" />
                  Customer accepted
                </Button>
                <Button variant="secondary" onClick={() => setDeclineOpen(true)}>
                  <XCircle className="h-4 w-4" />
                  Customer declined
                </Button>
                {permissions.send && (
                  <Button variant="secondary" onClick={() => setResendOpen(true)}>
                    <Mail className="h-4 w-4" />
                    E-mail again
                  </Button>
                )}
              </>
            )}
            {canRevise && (
              <Button
                variant="secondary"
                disabled={revise.isPending}
                onClick={async () => {
                  try {
                    const { id } = await revise.mutateAsync({ id: quote.id })
                    await utils.quotes.invalidate()
                    router.push(`/quotes/${id}`)
                  } catch (err) {
                    toast.error(err instanceof Error ? err.message : "Failed to create version")
                  }
                }}
              >
                <Copy className="h-4 w-4" />
                New version
              </Button>
            )}
            {open && (
              <Button variant="dangerGhost" onClick={() => setConfirm("cancel")}>
                <Ban className="h-4 w-4" />
                Withdraw quote
              </Button>
            )}
          </div>
        )}

        {versions.length > 1 && (
          <Card>
            <CardHeader>Versions</CardHeader>
            <CardContent className="space-y-1.5">
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
            </CardContent>
          </Card>
        )}
      </div>

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
            <DialogTitle>Customer declined</DialogTitle>
          </DialogHeader>
          <div className="py-2">
            <FieldLabel htmlFor="decline-reason" required>
              Reason
            </FieldLabel>
            <Textarea
              id="decline-reason"
              rows={3}
              value={declineReason}
              placeholder="e.g. too expensive, chose another company"
              onChange={(e) => setDeclineReason(e.target.value)}
            />
          </div>
          <DialogFooter>
            <Button variant="secondary" onClick={() => setDeclineOpen(false)}>
              Cancel
            </Button>
            <Button
              disabled={!declineReason.trim() || decline.isPending}
              onClick={async () => {
                await run(
                  () => decline.mutateAsync({ id: quote.id, reason: declineReason }),
                  "Quote declined",
                )
                setDeclineOpen(false)
              }}
            >
              Save
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <ConfirmDialog
        open={confirm !== null}
        onOpenChange={(o) => !o && setConfirm(null)}
        title={confirm === "accept" ? "Mark as accepted?" : "Withdraw this quote?"}
        description={
          confirm === "accept"
            ? "The job is created automatically from this quote and the lead is marked as booked."
            : "The customer can no longer accept this quote."
        }
        confirmLabel={confirm === "accept" ? "Accepted" : "Withdraw"}
        variant={confirm === "accept" ? "primary" : "danger"}
        onConfirm={() =>
          confirm === "accept"
            ? run(
                () => accept.mutateAsync({ id: quote.id }),
                "Quote accepted — job will be created",
              )
            : run(() => cancel.mutateAsync({ id: quote.id }), "Quote withdrawn")
        }
      />
    </div>
  )
}
