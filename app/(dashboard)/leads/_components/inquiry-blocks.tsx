"use client"

import { useState } from "react"
import { Plus, Trash2 } from "lucide-react"
import { trpc } from "@/lib/trpc/client"
import { Button } from "@/app/(dashboard)/_components/ui/button"
import { Input, Select, Textarea } from "@/app/(dashboard)/_components/ui/field"
import { useToast } from "@/app/(dashboard)/_components/ui/toast"
import { cn } from "@/app/(dashboard)/_lib/cn"
import type {
  InventoryRow,
  Lead,
  LeadQuestionnaire,
  WishedService,
} from "@/modules/leads/interface"

/** One row of the inquiry hub: title, summary, and an "Hinzufügen/Bearbeiten" action. */
export function Block({
  title,
  action,
  highlight,
  children,
}: {
  title: string
  action?: React.ReactNode
  highlight?: boolean
  children?: React.ReactNode
}) {
  return (
    <section
      className={cn(
        "bg-surface-raised rounded-[var(--radius-lg)] border px-5 py-4",
        highlight ? "border-text-primary border-2" : "border-surface-divider",
      )}
    >
      <div className="flex items-center justify-between gap-3">
        <h2 className="text-text-primary text-sm font-semibold">{title}</h2>
        {action}
      </div>
      {children && <div className="mt-3">{children}</div>}
    </section>
  )
}

function useSaveDetails(leadId: string) {
  const utils = trpc.useUtils()
  const toast = useToast()
  const mutation = trpc.leads.updateDetails.useMutation()
  return {
    pending: mutation.isPending,
    async save(patch: Omit<Parameters<typeof mutation.mutateAsync>[0], "id">, message: string) {
      try {
        await mutation.mutateAsync({ id: leadId, ...patch })
        await utils.leads.getById.invalidate({ id: leadId })
        toast.success(message)
        return true
      } catch (err) {
        toast.error(err instanceof Error ? err.message : "Speichern fehlgeschlagen")
        return false
      }
    },
  }
}

// ─── Fragebogen ───────────────────────────────────────────────────────────────

const DWELLINGS: Record<string, string> = {
  flat: "Wohnung",
  maisonette: "Maisonette",
  shared_flat: "WG-Zimmer",
  house_1: "Haus 1 Etage",
  house_2: "Haus 2 Etagen",
  house_3: "Haus 3+ Etagen",
  storage: "Lager / Keller",
  office: "Büro",
}
const LIFTS: Record<string, string> = {
  none: "Kein Lift",
  small: "Lift 2–3 Personen",
  medium: "Lift 4–5 Personen",
  large: "Lift 6+ Personen",
  goods: "Warenlift",
}

type Side = NonNullable<LeadQuestionnaire["origin"]>

function sideSummary(side: Side | undefined, floor: number | null): string {
  if (!side) return "—"
  return (
    [
      side.dwelling ? DWELLINGS[side.dwelling] : null,
      floor === null ? null : floor === 0 ? "Erdgeschoss" : `${floor}. Stock`,
      side.liftSize ? LIFTS[side.liftSize] : null,
      side.parkingDistanceM != null ? `${side.parkingDistanceM} m zum Parkplatz` : null,
      side.outsideSteps ? `${side.outsideSteps} Stufen aussen` : null,
    ]
      .filter(Boolean)
      .join(" · ") || "—"
  )
}

export function QuestionnaireBlock({ lead, canEdit }: { lead: Lead; canEdit: boolean }) {
  const [editing, setEditing] = useState(false)
  const [q, setQ] = useState<LeadQuestionnaire>(lead.questionnaire)
  const { save, pending } = useSaveDetails(lead.id)
  const filled = Boolean(q.origin || q.dest || q.boxes != null)

  const setSide = (key: "origin" | "dest", patch: Partial<Side>) =>
    setQ((x) => ({ ...x, [key]: { ...(x[key] ?? {}), ...patch } }))
  const num = (v: string) => (v.trim() === "" ? null : Math.max(0, Math.trunc(Number(v)) || 0))

  return (
    <Block
      title="Fragebogen"
      action={
        canEdit && !editing ? (
          <Button size="sm" variant="secondary" onClick={() => setEditing(true)}>
            {filled ? "Bearbeiten" : "Hinzufügen"}
          </Button>
        ) : undefined
      }
    >
      {editing ? (
        <div className="space-y-4">
          {(["origin", "dest"] as const).map((key) => (
            <div key={key} className="grid gap-2 sm:grid-cols-2">
              <p className="text-text-primary text-xs font-semibold tracking-wide uppercase sm:col-span-2">
                {key === "origin" ? "Aktuelle Adresse" : "Neue Adresse"}
              </p>
              <Select
                aria-label="Wohnungsart"
                value={q[key]?.dwelling ?? ""}
                onChange={(e) =>
                  setSide(key, { dwelling: (e.target.value || null) as Side["dwelling"] })
                }
              >
                <option value="">Wohnungsart …</option>
                {Object.entries(DWELLINGS).map(([v, l]) => (
                  <option key={v} value={v}>
                    {l}
                  </option>
                ))}
              </Select>
              <Select
                aria-label="Lift"
                value={q[key]?.liftSize ?? ""}
                onChange={(e) =>
                  setSide(key, { liftSize: (e.target.value || null) as Side["liftSize"] })
                }
              >
                <option value="">Lift …</option>
                {Object.entries(LIFTS).map(([v, l]) => (
                  <option key={v} value={v}>
                    {l}
                  </option>
                ))}
              </Select>
              <Input
                aria-label="Distanz Parkplatz bis Eingang (m)"
                inputMode="numeric"
                placeholder="Distanz Parkplatz → Eingang (m)"
                value={q[key]?.parkingDistanceM ?? ""}
                onChange={(e) => setSide(key, { parkingDistanceM: num(e.target.value) })}
              />
              <Input
                aria-label="Treppenstufen aussen"
                inputMode="numeric"
                placeholder="Treppenstufen aussen"
                value={q[key]?.outsideSteps ?? ""}
                onChange={(e) => setSide(key, { outsideSteps: num(e.target.value) })}
              />
              <Input
                aria-label="Kommentar"
                className="sm:col-span-2"
                placeholder="Kommentar (z. B. enges Treppenhaus)"
                value={q[key]?.comment ?? ""}
                onChange={(e) => setSide(key, { comment: e.target.value })}
              />
            </div>
          ))}
          <Input
            aria-label="Anzahl Kisten / Säcke"
            inputMode="numeric"
            placeholder="Anzahl Kisten / Säcke"
            className="sm:w-64"
            value={q.boxes ?? ""}
            onChange={(e) => setQ((x) => ({ ...x, boxes: num(e.target.value) }))}
          />
          <div className="flex justify-end gap-2">
            <Button variant="secondary" size="sm" onClick={() => setEditing(false)}>
              Abbrechen
            </Button>
            <Button
              size="sm"
              disabled={pending}
              onClick={async () => {
                if (await save({ questionnaire: q }, "Fragebogen gespeichert")) setEditing(false)
              }}
            >
              Speichern
            </Button>
          </div>
        </div>
      ) : (
        filled && (
          <dl className="grid gap-2 text-sm sm:grid-cols-2">
            <div>
              <dt className="text-text-muted text-xs">Aktuelle Adresse</dt>
              <dd>{sideSummary(q.origin, lead.originFloor)}</dd>
              {q.origin?.comment && <dd className="text-text-muted text-xs">{q.origin.comment}</dd>}
            </div>
            <div>
              <dt className="text-text-muted text-xs">Neue Adresse</dt>
              <dd>{sideSummary(q.dest, lead.destFloor)}</dd>
              {q.dest?.comment && <dd className="text-text-muted text-xs">{q.dest.comment}</dd>}
            </div>
            {q.boxes != null && (
              <div>
                <dt className="text-text-muted text-xs">Kisten / Säcke</dt>
                <dd>{q.boxes}</dd>
              </div>
            )}
          </dl>
        )
      )}
    </Block>
  )
}

// ─── Inventarliste ────────────────────────────────────────────────────────────

export function InventoryBlock({ lead, canEdit }: { lead: Lead; canEdit: boolean }) {
  const [editing, setEditing] = useState(false)
  const [rows, setRows] = useState<InventoryRow[]>(lead.inventory)
  const { save, pending } = useSaveDetails(lead.id)
  const set = (i: number, patch: Partial<InventoryRow>) =>
    setRows((r) => r.map((row, j) => (j === i ? { ...row, ...patch } : row)))

  return (
    <Block
      title={`Inventarliste${lead.inventory.length ? ` (${lead.inventory.reduce((s, r) => s + r.quantity, 0)} Stück)` : ""}`}
      action={
        canEdit && !editing ? (
          <Button
            size="sm"
            variant="secondary"
            onClick={() => {
              if (rows.length === 0) setRows([{ room: "", item: "", quantity: 1, note: "" }])
              setEditing(true)
            }}
          >
            {lead.inventory.length ? "Bearbeiten" : "Hinzufügen"}
          </Button>
        ) : undefined
      }
    >
      {editing ? (
        <div className="space-y-2">
          {rows.map((row, i) => (
            <div key={i} className="grid grid-cols-[1fr_1.5fr_70px_1.2fr_auto] gap-2">
              <Input
                aria-label="Raum"
                placeholder="Raum"
                value={row.room}
                onChange={(e) => set(i, { room: e.target.value })}
              />
              <Input
                aria-label="Gegenstand"
                placeholder="Gegenstand"
                value={row.item}
                onChange={(e) => set(i, { item: e.target.value })}
              />
              <Input
                aria-label="Anzahl"
                inputMode="numeric"
                className="text-right"
                value={row.quantity}
                onChange={(e) =>
                  set(i, { quantity: Math.max(1, Math.trunc(Number(e.target.value)) || 1) })
                }
              />
              <Input
                aria-label="Notiz"
                placeholder="Notiz"
                value={row.note}
                onChange={(e) => set(i, { note: e.target.value })}
              />
              <button
                type="button"
                aria-label="Zeile entfernen"
                className="text-text-muted hover:text-danger-700 px-1"
                onClick={() => setRows((r) => r.filter((_, j) => j !== i))}
              >
                <Trash2 className="h-4 w-4" />
              </button>
            </div>
          ))}
          <div className="flex items-center justify-between gap-2 pt-1">
            <button
              type="button"
              className="text-signal-600 inline-flex items-center gap-1 text-sm hover:underline"
              onClick={() =>
                setRows((r) => [
                  ...r,
                  { room: r.at(-1)?.room ?? "", item: "", quantity: 1, note: "" },
                ])
              }
            >
              <Plus className="h-4 w-4" />
              Zeile
            </button>
            <div className="flex gap-2">
              <Button
                variant="secondary"
                size="sm"
                onClick={() => {
                  setRows(lead.inventory)
                  setEditing(false)
                }}
              >
                Abbrechen
              </Button>
              <Button
                size="sm"
                disabled={pending}
                onClick={async () => {
                  const clean = rows.filter((r) => r.item.trim())
                  if (await save({ inventory: clean }, "Inventar gespeichert")) {
                    setRows(clean)
                    setEditing(false)
                  }
                }}
              >
                Speichern
              </Button>
            </div>
          </div>
        </div>
      ) : (
        lead.inventory.length > 0 && (
          <ul className="text-sm">
            {lead.inventory.map((r, i) => (
              <li key={i} className="flex gap-2 py-0.5">
                <span className="text-text-muted w-28 shrink-0 truncate">{r.room || "—"}</span>
                <span className="flex-1">
                  {r.quantity > 1 ? `${r.quantity} × ` : ""}
                  {r.item}
                  {r.note && <span className="text-text-muted"> · {r.note}</span>}
                </span>
              </li>
            ))}
          </ul>
        )
      )}
    </Block>
  )
}

// ─── Dienstleistungen (Wunsch des Kunden) ─────────────────────────────────────

export function ServicesBlock({ lead, canEdit }: { lead: Lead; canEdit: boolean }) {
  const services = trpc.catalog.services.list.useQuery(undefined, { enabled: canEdit })
  const [editing, setEditing] = useState(false)
  const [picked, setPicked] = useState<WishedService[]>(lead.wishedServices)
  const { save, pending } = useSaveDetails(lead.id)
  const isPicked = (name: string) => picked.some((p) => p.name === name)

  return (
    <Block
      title="Dienstleistungen"
      action={
        canEdit && !editing ? (
          <Button size="sm" variant="secondary" onClick={() => setEditing(true)}>
            {lead.wishedServices.length ? "Bearbeiten" : "Hinzufügen"}
          </Button>
        ) : undefined
      }
    >
      {editing ? (
        <div className="space-y-3">
          <div className="flex flex-wrap gap-2">
            {(services.data ?? [])
              .filter((s) => s.isActive && s.defaultPricingMode !== "hourly")
              .map((s) => (
                <button
                  key={s.id}
                  type="button"
                  onClick={() =>
                    setPicked((p) =>
                      isPicked(s.name)
                        ? p.filter((x) => x.name !== s.name)
                        : [...p, { serviceId: s.id, name: s.name, quantity: null }],
                    )
                  }
                  className={cn(
                    "rounded-full border px-3 py-1 text-xs",
                    isPicked(s.name)
                      ? "border-text-primary bg-signal-600 text-text-inverse"
                      : "border-surface-divider text-text-secondary hover:border-text-muted",
                  )}
                >
                  {s.name}
                </button>
              ))}
          </div>
          <div className="flex justify-end gap-2">
            <Button variant="secondary" size="sm" onClick={() => setEditing(false)}>
              Abbrechen
            </Button>
            <Button
              size="sm"
              disabled={pending}
              onClick={async () => {
                if (await save({ wishedServices: picked }, "Dienstleistungen gespeichert"))
                  setEditing(false)
              }}
            >
              Speichern
            </Button>
          </div>
        </div>
      ) : (
        lead.wishedServices.length > 0 && (
          <div className="flex flex-wrap gap-2">
            {lead.wishedServices.map((s) => (
              <span
                key={s.name}
                className="bg-surface-sunken text-text-secondary rounded-full px-3 py-1 text-xs"
              >
                {s.name}
              </span>
            ))}
          </div>
        )
      )}
    </Block>
  )
}

// ─── Private Notizen ──────────────────────────────────────────────────────────

export function NotesBlock({ lead, canEdit }: { lead: Lead; canEdit: boolean }) {
  const [editing, setEditing] = useState(false)
  const [text, setText] = useState(lead.internalNotes ?? "")
  const { save, pending } = useSaveDetails(lead.id)
  return (
    <Block
      title="Private Notizen"
      action={
        canEdit && !editing ? (
          <Button size="sm" variant="secondary" onClick={() => setEditing(true)}>
            {lead.internalNotes ? "Bearbeiten" : "Hinzufügen"}
          </Button>
        ) : undefined
      }
    >
      {editing ? (
        <div className="space-y-2">
          <Textarea rows={4} autoFocus value={text} onChange={(e) => setText(e.target.value)} />
          <div className="flex justify-end gap-2">
            <Button variant="secondary" size="sm" onClick={() => setEditing(false)}>
              Abbrechen
            </Button>
            <Button
              size="sm"
              disabled={pending}
              onClick={async () => {
                if (await save({ internalNotes: text }, "Notiz gespeichert")) setEditing(false)
              }}
            >
              Speichern
            </Button>
          </div>
        </div>
      ) : (
        lead.internalNotes && (
          <p className="text-text-secondary text-sm whitespace-pre-line">{lead.internalNotes}</p>
        )
      )}
    </Block>
  )
}
