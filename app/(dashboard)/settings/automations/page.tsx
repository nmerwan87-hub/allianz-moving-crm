"use client"

import { useState } from "react"
import Link from "next/link"
import { ArrowLeft, Check, Eye, Mail, RefreshCw, Send, X } from "lucide-react"
import { trpc } from "@/lib/trpc/client"
import { PageHeader } from "@/app/(dashboard)/_components/ui/page-header"
import { Button } from "@/app/(dashboard)/_components/ui/button"
import { Badge } from "@/app/(dashboard)/_components/ui/badge"
import {
  Input,
  Select,
  Textarea,
  FieldLabel,
  FieldError,
} from "@/app/(dashboard)/_components/ui/field"
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/app/(dashboard)/_components/ui/dialog"
import { Skeleton } from "@/app/(dashboard)/_components/ui/skeleton"
import { useToast } from "@/app/(dashboard)/_components/ui/toast"
import { useHasPermission } from "@/app/(dashboard)/_lib/permissions"
import { cn } from "@/app/(dashboard)/_lib/cn"
import type { AutomationItem, AutomationRun } from "@/modules/automations/interface"
import { formatDate } from "../../quotes/_lib/labels"

const RUN_STATUS: Record<
  string,
  { label: string; variant: "success" | "warning" | "danger" | "neutral" }
> = {
  sent: { label: "Gesendet", variant: "success" },
  approved: { label: "Wird gesendet", variant: "neutral" },
  approval_pending: { label: "Zu bestätigen", variant: "warning" },
  failed: { label: "Nicht zugestellt", variant: "danger" },
  skipped: { label: "Übersprungen", variant: "neutral" },
  cancelled: { label: "Verworfen", variant: "neutral" },
  pending: { label: "Wird gesendet", variant: "neutral" },
}

const ENTITY_ROUTES: Record<string, string> = {
  quote: "/quotes",
  job: "/jobs",
  invoice: "/invoices",
}

function timingLabel(a: Pick<AutomationItem, "timing" | "delayDays">): string {
  if (a.timing === "now") return "sofort"
  const days = a.delayDays === 1 ? "1 Tag" : `${a.delayDays} Tage`
  return a.timing === "before" ? `${days} vorher` : `${days} danach`
}

/**
 * Automatic customer e-mails (Einstellungen → E-Mail-Automatik): six fixed
 * e-mails, each switched on/off, timed and worded by the company.
 */
export default function AutomationsPage() {
  const toast = useToast()
  const utils = trpc.useUtils()
  const canManage = useHasPermission("communications.manage_automations")
  const canSend = useHasPermission("communications.send")
  const list = trpc.automations.list.useQuery()
  const runs = trpc.automations.runs.useQuery({})
  const runNow = trpc.automations.runNow.useMutation()
  const [editing, setEditing] = useState<AutomationItem | null>(null)

  const pending = (runs.data ?? []).filter((r) => r.status === "approval_pending")

  return (
    <div className="mx-auto max-w-4xl">
      <Link
        href="/settings"
        className="text-text-secondary hover:text-text-primary mb-2 inline-flex items-center gap-1 text-sm"
      >
        <ArrowLeft className="h-4 w-4" />
        Einstellungen
      </Link>
      <PageHeader
        title="E-Mail-Automatik"
        description="Diese E-Mails gehen in eurem Namen an die Kunden – nur wenn eingeschaltet, nie doppelt und nicht an Kunden, die keine automatischen E-Mails möchten."
        actions={
          canManage ? (
            <Button
              variant="secondary"
              disabled={runNow.isPending}
              onClick={async () => {
                try {
                  const r = await runNow.mutateAsync()
                  await utils.automations.runs.invalidate()
                  toast.success(
                    r.sent + r.awaitingApproval + r.failed + r.skipped === 0
                      ? "Nichts fällig"
                      : `${r.sent} gesendet, ${r.awaitingApproval} zu bestätigen${r.failed ? `, ${r.failed} nicht zugestellt` : ""}`,
                  )
                } catch (err) {
                  toast.error(err instanceof Error ? err.message : "Prüfen fehlgeschlagen")
                }
              }}
            >
              <RefreshCw className="h-4 w-4" />
              Jetzt prüfen
            </Button>
          ) : undefined
        }
      />

      {pending.length > 0 && (
        <section className="border-warning-600/30 bg-warning-100/50 mb-5 rounded-[var(--radius-lg)] border px-5 py-4">
          <h2 className="text-text-primary mb-2 text-sm font-semibold">
            Zu bestätigen ({pending.length})
          </h2>
          <ul className="divide-surface-divider divide-y">
            {pending.map((r) => (
              <PendingRow key={r.id} run={r} canSend={canSend} />
            ))}
          </ul>
        </section>
      )}

      {list.isLoading ? (
        <div className="space-y-3">
          {Array.from({ length: 6 }).map((_, i) => (
            <Skeleton key={i} className="h-20 w-full rounded-[var(--radius-lg)]" />
          ))}
        </div>
      ) : (
        <div className="space-y-3">
          {(list.data ?? []).map((a) => (
            <AutomationCard
              key={a.id}
              automation={a}
              canManage={canManage}
              onEdit={() => setEditing(a)}
            />
          ))}
        </div>
      )}

      <section className="border-surface-divider bg-surface-raised mt-6 rounded-[var(--radius-lg)] border px-5 py-4">
        <h2 className="text-text-primary mb-3 text-base font-semibold">Zuletzt</h2>
        {runs.isLoading ? (
          <Skeleton className="h-16 w-full" />
        ) : (runs.data ?? []).length === 0 ? (
          <p className="text-text-muted text-sm">Noch keine automatischen E-Mails.</p>
        ) : (
          <ul className="divide-surface-divider divide-y text-sm">
            {(runs.data ?? []).map((r) => {
              const status = RUN_STATUS[r.status] ?? {
                label: r.status,
                variant: "neutral" as const,
              }
              const base = r.entityType ? ENTITY_ROUTES[r.entityType] : null
              return (
                <li key={r.id} className="flex flex-wrap items-center gap-x-3 gap-y-1 py-2">
                  <span className="text-text-muted w-20 shrink-0 text-xs">
                    {formatDate(r.createdAt)}
                  </span>
                  <span className="text-text-primary min-w-0 flex-1">
                    {r.automationName}
                    <span className="text-text-muted"> · {r.toName ?? r.toEmail}</span>
                    {r.reason && r.status !== "sent" && (
                      <span className="text-text-muted block text-xs">{r.reason}</span>
                    )}
                  </span>
                  {base && r.entityId && (
                    <Link
                      href={`${base}/${r.entityId}`}
                      className="text-signal-600 text-xs hover:underline"
                    >
                      Öffnen
                    </Link>
                  )}
                  <Badge variant={status.variant}>{status.label}</Badge>
                </li>
              )
            })}
          </ul>
        )}
      </section>

      {editing && <EditDialog automation={editing} onClose={() => setEditing(null)} />}
    </div>
  )
}

function AutomationCard({
  automation: a,
  canManage,
  onEdit,
}: {
  automation: AutomationItem
  canManage: boolean
  onEdit: () => void
}) {
  const toast = useToast()
  const utils = trpc.useUtils()
  const update = trpc.automations.update.useMutation()

  async function toggle() {
    try {
      await update.mutateAsync({
        id: a.id,
        enabled: !a.enabled,
        delayDays: a.delayDays,
        mode: a.mode,
        subject: a.subject,
        body: a.body,
      })
      await utils.automations.list.invalidate()
      toast.success(a.enabled ? `«${a.name}» ausgeschaltet` : `«${a.name}» eingeschaltet`)
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Speichern fehlgeschlagen")
    }
  }

  return (
    <section className="border-surface-divider bg-surface-raised flex flex-wrap items-center gap-4 rounded-[var(--radius-lg)] border px-5 py-4">
      <button
        type="button"
        role="switch"
        aria-checked={a.enabled}
        aria-label={`${a.name} ${a.enabled ? "ausschalten" : "einschalten"}`}
        disabled={!canManage || update.isPending}
        onClick={toggle}
        className={cn(
          "relative h-6 w-11 shrink-0 rounded-full transition-colors disabled:opacity-50",
          a.enabled ? "bg-signal-600" : "bg-surface-divider",
        )}
      >
        <span
          className={cn(
            "absolute top-0.5 left-0.5 h-5 w-5 rounded-full bg-white shadow transition-transform",
            a.enabled && "translate-x-5",
          )}
        />
      </button>
      <div className="min-w-0 flex-1">
        <p className="text-text-primary font-medium">{a.name}</p>
        <p className="text-text-muted text-sm">{a.description}</p>
        <p className="text-text-secondary mt-1 text-xs">
          {timingLabel(a)} · {a.mode === "approval" ? "zuerst bestätigen" : "automatisch senden"}
          {a.customText ? " · eigener Text" : ""}
        </p>
      </div>
      <Button variant="secondary" size="sm" onClick={onEdit}>
        {canManage ? "Bearbeiten" : "Ansehen"}
      </Button>
    </section>
  )
}

function EditDialog({
  automation: a,
  onClose,
}: {
  automation: AutomationItem
  onClose: () => void
}) {
  const toast = useToast()
  const utils = trpc.useUtils()
  const canManage = useHasPermission("communications.manage_automations")
  const update = trpc.automations.update.useMutation()
  const [form, setForm] = useState({
    delayDays: String(a.delayDays),
    mode: a.mode,
    subject: a.subject,
    body: a.body,
  })
  const [error, setError] = useState<string | null>(null)
  const [showPreview, setShowPreview] = useState(false)
  const preview = trpc.automations.preview.useQuery({ id: a.id }, { enabled: showPreview })

  async function save() {
    setError(null)
    try {
      await update.mutateAsync({
        id: a.id,
        enabled: a.enabled,
        delayDays: Number(form.delayDays) || 0,
        mode: form.mode,
        subject: form.subject,
        body: form.body,
      })
      await utils.automations.invalidate()
      toast.success("Gespeichert")
      onClose()
    } catch (err) {
      setError(err instanceof Error ? err.message : "Speichern fehlgeschlagen")
    }
  }

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>{a.name}</DialogTitle>
        </DialogHeader>
        {showPreview ? (
          <div className="border-surface-divider rounded-[var(--radius-md)] border p-4 text-sm">
            {preview.isLoading ? (
              <Skeleton className="h-32 w-full" />
            ) : preview.data ? (
              <>
                <p className="text-text-muted text-xs">Betreff</p>
                <p className="text-text-primary mb-3 font-medium">{preview.data.subject}</p>
                <p className="text-text-secondary whitespace-pre-line">{preview.data.body}</p>
                {preview.data.action && (
                  <span className="bg-signal-600 mt-3 inline-block rounded-[var(--radius-md)] px-3 py-1.5 text-xs font-semibold text-white">
                    {preview.data.action}
                  </span>
                )}
                <p className="text-text-muted mt-3 text-xs">
                  Vorschau mit dem neuesten passenden Eintrag (gespeicherter Text).
                </p>
              </>
            ) : null}
          </div>
        ) : (
          <div className="grid gap-3 py-1 sm:grid-cols-2">
            {a.timing !== "now" && (
              <div>
                <FieldLabel htmlFor="au-delay">
                  {a.timing === "before" ? "Tage vorher" : "Tage danach"}
                </FieldLabel>
                <Input
                  id="au-delay"
                  inputMode="numeric"
                  disabled={!canManage}
                  value={form.delayDays}
                  onChange={(e) => setForm((f) => ({ ...f, delayDays: e.target.value }))}
                />
              </div>
            )}
            <div className={a.timing === "now" ? "sm:col-span-2" : undefined}>
              <FieldLabel htmlFor="au-mode">Senden</FieldLabel>
              <Select
                id="au-mode"
                disabled={!canManage}
                value={form.mode}
                onChange={(e) =>
                  setForm((f) => ({ ...f, mode: e.target.value as AutomationItem["mode"] }))
                }
              >
                <option value="auto_send">Automatisch senden</option>
                <option value="approval">
                  Zuerst bestätigen (erscheint oben auf dieser Seite)
                </option>
              </Select>
            </div>
            <div className="sm:col-span-2">
              <FieldLabel htmlFor="au-subject">Betreff</FieldLabel>
              <Input
                id="au-subject"
                disabled={!canManage}
                value={form.subject}
                onChange={(e) => setForm((f) => ({ ...f, subject: e.target.value }))}
              />
            </div>
            <div className="sm:col-span-2">
              <FieldLabel htmlFor="au-body">Text</FieldLabel>
              <Textarea
                id="au-body"
                rows={7}
                disabled={!canManage}
                value={form.body}
                onChange={(e) => setForm((f) => ({ ...f, body: e.target.value }))}
              />
              <p className="text-text-muted mt-1 text-xs">
                Anrede und Grussformel werden automatisch ergänzt. Platzhalter:{" "}
                {a.placeholders.map((p) => (
                  <code key={p} className="bg-surface-sunken mr-1 rounded px-1">
                    {`{${p}}`}
                  </code>
                ))}
                {a.placeholders.includes("link") && "— der Link erscheint zusätzlich als Knopf."}
              </p>
              <p className="text-text-muted mt-1 text-xs">
                Französisch, Italienisch und Englisch verwenden die mitgelieferten Texte.
              </p>
            </div>
            {error && (
              <div className="sm:col-span-2">
                <FieldError message={error} />
              </div>
            )}
          </div>
        )}
        <DialogFooter>
          <Button variant="ghost" className="mr-auto" onClick={() => setShowPreview((p) => !p)}>
            {showPreview ? (
              "Zurück zum Text"
            ) : (
              <>
                <Eye className="h-4 w-4" />
                Vorschau
              </>
            )}
          </Button>
          <Button variant="secondary" onClick={onClose}>
            {canManage ? "Abbrechen" : "Schliessen"}
          </Button>
          {canManage && !showPreview && (
            <Button disabled={update.isPending} onClick={save}>
              Speichern
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

function PendingRow({ run, canSend }: { run: AutomationRun; canSend: boolean }) {
  const toast = useToast()
  const utils = trpc.useUtils()
  const approve = trpc.automations.approve.useMutation()
  const discard = trpc.automations.discard.useMutation()
  const busy = approve.isPending || discard.isPending

  return (
    <li className="flex flex-wrap items-center gap-3 py-2 text-sm">
      <Mail className="text-text-muted h-4 w-4 shrink-0" />
      <span className="text-text-primary min-w-0 flex-1">
        {run.automationName}
        <span className="text-text-muted"> · {run.toName ?? run.toEmail}</span>
      </span>
      {canSend && (
        <>
          <Button
            size="sm"
            disabled={busy}
            onClick={async () => {
              try {
                const r = await approve.mutateAsync({ id: run.id })
                await utils.automations.runs.invalidate()
                if (r.delivered) toast.success("E-Mail gesendet")
                else toast.error("E-Mail konnte nicht zugestellt werden")
              } catch (err) {
                toast.error(err instanceof Error ? err.message : "Senden fehlgeschlagen")
              }
            }}
          >
            <Send className="h-4 w-4" />
            Senden
          </Button>
          <Button
            size="sm"
            variant="ghost"
            disabled={busy}
            onClick={async () => {
              await discard.mutateAsync({ id: run.id })
              await utils.automations.runs.invalidate()
            }}
          >
            <X className="h-4 w-4" />
            Verwerfen
          </Button>
        </>
      )}
      {!canSend && <Check className="text-text-muted h-4 w-4" />}
    </li>
  )
}
