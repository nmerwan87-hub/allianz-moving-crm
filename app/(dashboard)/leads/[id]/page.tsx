"use client"

import { use, useState } from "react"
import Link from "next/link"
import { useRouter } from "next/navigation"
import { ArrowLeft, CalendarPlus, CheckCircle2, FileText, Home } from "lucide-react"
import { trpc } from "@/lib/trpc/client"
import { formatPhone } from "@/lib/format/phone"
import { formatChf } from "@/lib/format/money"
import { labelOf } from "@/app/(dashboard)/_lib/labels"
import { Button } from "@/app/(dashboard)/_components/ui/button"
import { Badge } from "@/app/(dashboard)/_components/ui/badge"
import { Skeleton } from "@/app/(dashboard)/_components/ui/skeleton"
import { ErrorState } from "@/app/(dashboard)/_components/ui/error-state"
import { WrongCompanyNotice } from "@/app/(dashboard)/_components/wrong-company-notice"
import { Select, Textarea, FieldLabel } from "@/app/(dashboard)/_components/ui/field"
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/app/(dashboard)/_components/ui/dialog"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/app/(dashboard)/_components/ui/dropdown-menu"
import { useToast } from "@/app/(dashboard)/_components/ui/toast"
import { useHasPermission } from "@/app/(dashboard)/_lib/permissions"
import { AttachmentsBlock } from "@/app/(dashboard)/_components/attachments-block"
import { AppointmentDialog } from "@/app/(dashboard)/_components/appointment-dialog"
import type { CalendarEvent } from "@/modules/calendar/interface"
import type { leadStatusEnum } from "@/modules/leads/interface"
import { QUOTE_STATUS_BADGE, QUOTE_STATUS_LABELS } from "../../quotes/_lib/labels"
import {
  Block,
  InventoryBlock,
  NotesBlock,
  QuestionnaireBlock,
  ServicesBlock,
} from "../_components/inquiry-blocks"

const STATUS_BADGE: Record<
  string,
  "default" | "success" | "warning" | "danger" | "info" | "neutral"
> = {
  new: "info",
  contacted: "neutral",
  surveyed: "neutral",
  quoted: "warning",
  booked: "success",
  lost: "danger",
  duplicate: "neutral",
}

function formatDate(value: string | null | undefined): string {
  if (!value) return "—"
  const [y, m, d] = value.slice(0, 10).split("-")
  return `${d}.${m}.${y}`
}

function address(street: string | null, postal: string | null, city: string | null): string {
  return [street, [postal, city].filter(Boolean).join(" ")].filter(Boolean).join(", ") || "—"
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <dt className="text-text-muted text-xs">{label}</dt>
      <dd className="text-text-primary text-sm">{children || "—"}</dd>
    </div>
  )
}

/**
 * The inquiry is the centre of a move (Bixin structure): contact, move,
 * quotes, questionnaire, inventory, wished services, media, private notes and
 * the home visit — each a block that is filled when needed.
 */
export default function LeadDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params)
  const router = useRouter()
  const toast = useToast()
  const utils = trpc.useUtils()

  const query = trpc.leads.getById.useQuery({ id })
  const quotes = trpc.quotes.list.useQuery({ leadId: id, pageSize: 20 })
  const visits = trpc.calendar.forLead.useQuery({ leadId: id })
  const updateStatusMutation = trpc.leads.updateStatus.useMutation()
  const createQuote = trpc.quotes.create.useMutation()
  const deleteMutation = trpc.leads.delete.useMutation()
  const setConfirmed = trpc.calendar.setConfirmed.useMutation()
  const canCreateQuote = useHasPermission("quotes.create")
  const canEdit = useHasPermission("leads.edit")

  const [statusDialogOpen, setStatusDialogOpen] = useState(false)
  const [newStatus, setNewStatus] = useState("")
  const [lostReason, setLostReason] = useState("")
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false)
  const [appointment, setAppointment] = useState<CalendarEvent | "new" | null>(null)

  const lead = query.data
  const allowedQuery = trpc.workflow.allowedTransitions.useQuery(
    { entity: "lead", fromStatus: lead?.status ?? "" },
    { enabled: Boolean(lead?.status) },
  )
  const allowedTransitions = allowedQuery.data ?? []
  const selectedTransition = allowedTransitions.find((t) => t.toStatus === newStatus)

  async function handleStatusChange() {
    if (!newStatus) return
    try {
      await updateStatusMutation.mutateAsync({
        id,
        status: newStatus as (typeof leadStatusEnum)["options"][number],
        lostReason: selectedTransition?.requiresReason ? lostReason : undefined,
      })
      toast.success("Status geändert")
      setStatusDialogOpen(false)
      setNewStatus("")
      setLostReason("")
      void query.refetch()
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Statuswechsel fehlgeschlagen")
    }
  }

  async function startQuote() {
    try {
      const { id: quoteId } = await createQuote.mutateAsync({ leadId: id })
      router.push(`/quotes/${quoteId}`)
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Offerte konnte nicht erstellt werden")
    }
  }

  if (query.isLoading) {
    return (
      <div className="mx-auto max-w-4xl space-y-3">
        <Skeleton className="h-8 w-64" />
        <Skeleton className="h-32 w-full" />
        <Skeleton className="h-32 w-full" />
      </div>
    )
  }

  if (query.isError || !lead) {
    return (
      <div>
        <Button variant="ghost" size="sm" onClick={() => router.push("/leads")}>
          <ArrowLeft className="h-4 w-4" />
          Zurück zu den Anfragen
        </Button>
        <div className="mt-8">
          <WrongCompanyNotice entity="lead" id={id}>
            <ErrorState
              title="Anfrage nicht gefunden"
              message="Sie wurde archiviert oder du hast keinen Zugriff."
            />
          </WrongCompanyNotice>
        </div>
      </div>
    )
  }

  const name = `${lead.firstName} ${lead.lastName}`
  const leadQuotes = (quotes.data?.items ?? []).filter((q) => q.status !== "cancelled")

  return (
    <div className="mx-auto max-w-4xl space-y-4">
      {/* Header */}
      <div className="flex flex-wrap items-center gap-3">
        <Button
          variant="ghost"
          size="icon"
          aria-label="Zurück"
          onClick={() => router.push("/leads")}
        >
          <ArrowLeft className="h-4 w-4" />
        </Button>
        <h1 className="text-text-primary text-[length:var(--text-display-md)] font-semibold">
          Anfrage {name}
        </h1>
        <Badge variant={STATUS_BADGE[lead.status] ?? "neutral"}>{labelOf(lead.status)}</Badge>
        <span className="text-text-muted text-sm">vom {formatDate(lead.createdAt)}</span>
        {canEdit && (
          <div className="ml-auto">
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="secondary" size="sm">
                  ···
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                <DropdownMenuItem
                  onSelect={() => {
                    setNewStatus("")
                    setStatusDialogOpen(true)
                  }}
                >
                  Status ändern
                </DropdownMenuItem>
                <DropdownMenuItem onSelect={() => router.push(`/leads/${id}/edit`)}>
                  Kontakt und Umzug bearbeiten
                </DropdownMenuItem>
                <DropdownMenuSeparator />
                <DropdownMenuItem
                  onSelect={() => setDeleteDialogOpen(true)}
                  className="text-danger-700"
                >
                  Archivieren
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        )}
      </div>

      {/* Kontakt */}
      <Block
        title={name}
        action={
          canEdit ? (
            <Link href={`/leads/${id}/edit`} className="text-signal-600 text-sm hover:underline">
              Bearbeiten
            </Link>
          ) : undefined
        }
      >
        <dl className="grid gap-3 sm:grid-cols-3">
          <Field label="E-Mail">
            {lead.email && (
              <a href={`mailto:${lead.email}`} className="hover:underline">
                {lead.email}
              </a>
            )}
          </Field>
          <Field label="Telefon">
            {lead.phone && (
              <a href={`tel:${lead.phone}`} className="text-signal-600 hover:underline">
                {formatPhone(lead.phone)}
              </a>
            )}
          </Field>
          <Field label="Quelle">{labelOf(lead.source)}</Field>
        </dl>
      </Block>

      {/* Umzug */}
      <Block
        title="Umzug"
        action={
          canEdit ? (
            <Link href={`/leads/${id}/edit`} className="text-signal-600 text-sm hover:underline">
              Bearbeiten
            </Link>
          ) : undefined
        }
      >
        <dl className="grid gap-3 sm:grid-cols-3">
          <Field label="Aktuelle Adresse">
            {address(lead.originAddress, lead.originPostalCode, lead.originCity)}
          </Field>
          <Field label="Neue Adresse">
            {address(lead.destAddress, lead.destPostalCode, lead.destCity)}
          </Field>
          <Field label="Umzugsdatum">
            {formatDate(lead.requestedDate)}
            {lead.dateFlexible && <span className="text-text-muted"> (flexibel)</span>}
          </Field>
          <Field label="Anzahl Zimmer">
            {lead.rooms ?? (lead.propertySize ? labelOf(lead.propertySize) : null)}
          </Field>
          <Field label="Art">{lead.moveType ? labelOf(lead.moveType) : null}</Field>
        </dl>
      </Block>

      {/* Offerten */}
      <Block
        title="Umzug — Offerte"
        highlight
        action={
          canCreateQuote ? (
            <Button size="sm" disabled={createQuote.isPending} onClick={startQuote}>
              <FileText className="h-4 w-4" />
              {createQuote.isPending ? "Wird erstellt …" : "Offerte erstellen"}
            </Button>
          ) : undefined
        }
      >
        {leadQuotes.length > 0 && (
          <ul className="divide-surface-divider divide-y">
            {leadQuotes.map((q) => (
              <li key={q.id}>
                <Link
                  href={`/quotes/${q.id}`}
                  className="hover:bg-surface-sunken -mx-2 flex items-center gap-3 rounded-[var(--radius-md)] px-2 py-2"
                >
                  <span className="text-text-primary text-sm font-medium">{q.quoteNumber}</span>
                  <span className="text-text-muted min-w-0 flex-1 truncate text-sm">
                    {q.title ?? ""}
                  </span>
                  <span className="text-sm whitespace-nowrap tabular-nums">
                    {formatChf(q.totalAmountCents)}
                  </span>
                  <Badge variant={QUOTE_STATUS_BADGE[q.status] ?? "neutral"}>
                    {QUOTE_STATUS_LABELS[q.status] ?? q.status}
                  </Badge>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </Block>

      <QuestionnaireBlock key={`q-${lead.updatedAt}`} lead={lead} canEdit={canEdit} />
      <InventoryBlock key={`i-${lead.updatedAt}`} lead={lead} canEdit={canEdit} />
      <ServicesBlock key={`s-${lead.updatedAt}`} lead={lead} canEdit={canEdit} />

      <Block title="Medien">
        <AttachmentsBlock entityType="lead" entityId={id} canEdit={canEdit} />
      </Block>

      <NotesBlock key={`n-${lead.updatedAt}`} lead={lead} canEdit={canEdit} />

      {/* Hausbesuch */}
      <Block
        title="Hausbesuch abmachen"
        action={
          canEdit ? (
            <Button size="sm" variant="secondary" onClick={() => setAppointment("new")}>
              <CalendarPlus className="h-4 w-4" />
              Neu
            </Button>
          ) : undefined
        }
      >
        {(visits.data ?? []).length > 0 && (
          <ul className="divide-surface-divider divide-y">
            {(visits.data ?? []).map((v) => (
              <li key={v.id} className="flex items-center gap-3 py-2 text-sm">
                <Home className="text-text-muted h-4 w-4" />
                <button
                  type="button"
                  className="min-w-0 flex-1 text-left hover:underline"
                  onClick={() => setAppointment(v)}
                >
                  <span className="text-text-primary">{v.title}</span>
                  <span className="text-text-muted">
                    {" "}
                    · {formatDate(v.date)} {v.startTime}–{v.endTime}
                  </span>
                </button>
                {v.confirmed ? (
                  <Badge variant="success">
                    <CheckCircle2 className="h-3 w-3" />
                    bestätigt
                  </Badge>
                ) : (
                  canEdit && (
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={async () => {
                        await setConfirmed.mutateAsync({ id: v.id, confirmed: true })
                        await utils.calendar.invalidate()
                      }}
                    >
                      Bestätigen
                    </Button>
                  )
                )}
              </li>
            ))}
          </ul>
        )}
      </Block>

      {appointment && (
        <AppointmentDialog
          event={appointment === "new" ? undefined : appointment}
          defaults={{
            title: `Hausbesuch ${lead.lastName}`,
            kind: "site_visit",
            leadId: id,
            leadLabel: name,
          }}
          onClose={() => setAppointment(null)}
        />
      )}

      {/* Status change dialog */}
      <Dialog open={statusDialogOpen} onOpenChange={setStatusDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Status ändern</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div>
              <FieldLabel htmlFor="newStatus">Neuer Status</FieldLabel>
              <Select
                id="newStatus"
                value={newStatus}
                onChange={(e) => setNewStatus(e.target.value)}
              >
                <option value="" disabled>
                  {allowedTransitions.length === 0 ? "Kein weiterer Status möglich" : "Wählen …"}
                </option>
                {allowedTransitions.map((t) => (
                  <option key={t.toStatus} value={t.toStatus}>
                    {labelOf(t.toStatus)}
                  </option>
                ))}
              </Select>
            </div>
            {selectedTransition?.requiresReason && (
              <div>
                <FieldLabel htmlFor="lostReason">Grund (Pflicht)</FieldLabel>
                <Textarea
                  id="lostReason"
                  rows={3}
                  value={lostReason}
                  onChange={(e) => setLostReason(e.target.value)}
                  placeholder="Warum ist die Anfrage verloren?"
                />
              </div>
            )}
          </div>
          <DialogFooter>
            <Button variant="secondary" onClick={() => setStatusDialogOpen(false)}>
              Abbrechen
            </Button>
            <Button
              onClick={handleStatusChange}
              disabled={
                !newStatus ||
                (selectedTransition?.requiresReason === true && !lostReason.trim()) ||
                updateStatusMutation.isPending
              }
            >
              {updateStatusMutation.isPending ? "Speichern …" : "Status ändern"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Archive confirmation */}
      <Dialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Anfrage archivieren?</DialogTitle>
          </DialogHeader>
          <p className="text-text-secondary py-2 text-sm">
            Die Anfrage von {name} verschwindet aus der Liste. Die Daten bleiben erhalten.
          </p>
          <DialogFooter>
            <Button variant="secondary" onClick={() => setDeleteDialogOpen(false)}>
              Abbrechen
            </Button>
            <Button
              variant="danger"
              disabled={deleteMutation.isPending}
              onClick={async () => {
                try {
                  await deleteMutation.mutateAsync({ id })
                  toast.success("Anfrage archiviert")
                  router.push("/leads")
                } catch (err) {
                  toast.error(err instanceof Error ? err.message : "Archivieren fehlgeschlagen")
                }
              }}
            >
              {deleteMutation.isPending ? "Wird archiviert …" : "Archivieren"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
