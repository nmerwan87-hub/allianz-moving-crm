"use client"

import { useState } from "react"
import { Pencil, Plus, Trash2 } from "lucide-react"
import { trpc } from "@/lib/trpc/client"
import { formatChf, formatCents, parseToCents } from "@/lib/format/money"
import { PageHeader } from "@/app/(dashboard)/_components/ui/page-header"
import { Button } from "@/app/(dashboard)/_components/ui/button"
import { Badge } from "@/app/(dashboard)/_components/ui/badge"
import { Card, CardContent, CardHeader } from "@/app/(dashboard)/_components/ui/card"
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
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/app/(dashboard)/_components/ui/dialog"
import { ConfirmDialog } from "@/app/(dashboard)/_components/ui/confirm-dialog"
import { Skeleton } from "@/app/(dashboard)/_components/ui/skeleton"
import { useToast } from "@/app/(dashboard)/_components/ui/toast"
import { useHasPermission } from "@/app/(dashboard)/_lib/permissions"
import { useUnsavedChangesGuard } from "@/app/(dashboard)/_lib/active-company"
import {
  vehicleTypeEnum,
  pricingSettingsInput,
  type RateCard,
  type PricingSettings,
} from "@/modules/catalog/interface"

// Swiss names for the stored vehicle classes
const VEHICLE_LABELS: Record<RateCard["vehicleType"] & string, string> = {
  cargo_van: "Lieferwagen",
  pickup_truck: "Pickup",
  box_truck_16ft: "LKW 3.5 t",
  box_truck_24ft: "LKW 7.5 t",
  box_truck_26ft: "LKW 12 t",
  semi_truck: "LKW 18 t+",
}

// ─── Rate card dialog ─────────────────────────────────────────────────────────

interface DraftRate {
  id?: string
  name: string
  crewSize: string
  vehicleType: string
  rate: string
  cost: string
  isActive: boolean
}

function RateDialog({ draft, onClose }: { draft: DraftRate; onClose: () => void }) {
  const toast = useToast()
  const utils = trpc.useUtils()
  const [form, setForm] = useState(draft)
  const [error, setError] = useState<string | null>(null)
  const create = trpc.catalog.rateCards.create.useMutation()
  const update = trpc.catalog.rateCards.update.useMutation()
  const saving = create.isPending || update.isPending

  async function save() {
    const crewSize = Number(form.crewSize)
    const rate = parseToCents(form.rate)
    const cost = parseToCents(form.cost || "0")
    if (!form.name.trim()) return setError("Namen eingeben, z. B. «2 Mann + Lieferwagen».")
    if (!Number.isInteger(crewSize) || crewSize < 1 || crewSize > 20)
      return setError("Anzahl Personen zwischen 1 und 20.")
    if (rate === null || cost === null)
      return setError("Beträge eingeben, z. B. 150 oder 1'250.50.")

    const input = {
      name: form.name.trim(),
      crewSize,
      vehicleType: (form.vehicleType || null) as RateCard["vehicleType"],
      hourlyRateCents: rate,
      hourlyCostCents: cost,
      isActive: form.isActive,
    }
    try {
      if (form.id) await update.mutateAsync({ id: form.id, ...input })
      else await create.mutateAsync(input)
      await utils.catalog.rateCards.list.invalidate()
      toast.success("Ansatz gespeichert")
      onClose()
    } catch (err) {
      setError(err instanceof Error ? err.message : "Speichern fehlgeschlagen")
    }
  }

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{form.id ? "Teamansatz bearbeiten" : "Teamansatz erfassen"}</DialogTitle>
        </DialogHeader>
        <div className="grid gap-4 py-2 sm:grid-cols-2">
          <div className="sm:col-span-2">
            <FieldLabel required htmlFor="rate-name">
              Name
            </FieldLabel>
            <Input
              id="rate-name"
              placeholder="2 Mann + Lieferwagen"
              value={form.name}
              onChange={(e) => setForm({ ...form, name: e.target.value })}
            />
          </div>
          <div>
            <FieldLabel required htmlFor="rate-crew">
              Personen
            </FieldLabel>
            <Input
              id="rate-crew"
              type="number"
              min={1}
              max={20}
              value={form.crewSize}
              onChange={(e) => setForm({ ...form, crewSize: e.target.value })}
            />
          </div>
          <div>
            <FieldLabel htmlFor="rate-vehicle">Fahrzeug</FieldLabel>
            <Select
              id="rate-vehicle"
              value={form.vehicleType}
              onChange={(e) => setForm({ ...form, vehicleType: e.target.value })}
            >
              <option value="">Ohne Fahrzeug</option>
              {vehicleTypeEnum.options.map((v) => (
                <option key={v} value={v}>
                  {VEHICLE_LABELS[v]}
                </option>
              ))}
            </Select>
          </div>
          <div>
            <FieldLabel required htmlFor="rate-price">
              Preis pro Stunde (CHF)
            </FieldLabel>
            <Input
              id="rate-price"
              inputMode="decimal"
              value={form.rate}
              onChange={(e) => setForm({ ...form, rate: e.target.value })}
            />
          </div>
          <div>
            <FieldLabel htmlFor="rate-cost">Kosten pro Stunde (CHF)</FieldLabel>
            <Input
              id="rate-cost"
              inputMode="decimal"
              value={form.cost}
              onChange={(e) => setForm({ ...form, cost: e.target.value })}
            />
            <FieldHint>Lohn und Fahrzeug, nur für die Marge.</FieldHint>
          </div>
          <label className="text-text-primary flex items-center gap-2 text-sm sm:col-span-2">
            <input
              type="checkbox"
              checked={form.isActive}
              onChange={(e) => setForm({ ...form, isActive: e.target.checked })}
            />
            In neuen Offerten anbieten
          </label>
          {error && (
            <div className="sm:col-span-2">
              <FieldError message={error} />
            </div>
          )}
        </div>
        <DialogFooter>
          <Button variant="secondary" onClick={onClose} disabled={saving}>
            Abbrechen
          </Button>
          <Button onClick={save} disabled={saving}>
            {saving ? "Speichern …" : "Speichern"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

// ─── Pricing settings form ────────────────────────────────────────────────────

type MoneyKey =
  | "minimumChargeCents"
  | "travelFlatFeeCents"
  | "ratePerKmCents"
  | "stairCarryRateCents"
  | "longCarryRateCents"
  | "elevatorWaitRateCents"
type NumberKey =
  | "minimumHours"
  | "weekendSurchargePercent"
  | "fuelSurchargePercent"
  | "defaultDepositPercent"
  | "defaultQuoteExpiryDays"
  | "defaultPaymentTermsDays"
  | "taxRatePercent"

const MONEY_FIELDS: Array<{ key: MoneyKey; label: string; hint?: string }> = [
  { key: "travelFlatFeeCents", label: "Anfahrtspauschale", hint: "pro Auftrag" },
  { key: "ratePerKmCents", label: "Preis pro km" },
  { key: "minimumChargeCents", label: "Mindestbetrag pro Auftrag" },
  { key: "stairCarryRateCents", label: "Zuschlag pro Stockwerk", hint: "ohne Lift" },
  { key: "longCarryRateCents", label: "Zuschlag langer Tragweg", hint: "weit vom Parkplatz" },
  { key: "elevatorWaitRateCents", label: "Wartezeit Lift pro Stunde" },
]

const NUMBER_FIELDS: Array<{ key: NumberKey; label: string; suffix: string }> = [
  { key: "minimumHours", label: "Mindeststunden", suffix: "Std." },
  { key: "weekendSurchargePercent", label: "Wochenend-/Feiertagszuschlag", suffix: "%" },
  { key: "fuelSurchargePercent", label: "Treibstoffzuschlag", suffix: "%" },
  { key: "defaultDepositPercent", label: "Anzahlung", suffix: "%" },
  { key: "defaultQuoteExpiryDays", label: "Offerte gültig", suffix: "Tage" },
  { key: "defaultPaymentTermsDays", label: "Zahlungsfrist", suffix: "Tage" },
]

function SettingsForm({ initial, canEdit }: { initial: PricingSettings; canEdit: boolean }) {
  const toast = useToast()
  const utils = trpc.useUtils()
  const update = trpc.catalog.pricingSettings.update.useMutation()
  const toText = (s: PricingSettings) => ({
    money: Object.fromEntries(MONEY_FIELDS.map((f) => [f.key, formatCents(s[f.key])])),
    numbers: Object.fromEntries(
      [...NUMBER_FIELDS.map((f) => f.key), "taxRatePercent" as const].map((k) => [k, String(s[k])]),
    ),
    taxEnabled: s.taxEnabled,
    taxLabel: s.taxLabel,
  })
  const [form, setForm] = useState(() => toText(initial))
  const [error, setError] = useState<string | null>(null)
  const [dirty, setDirty] = useState(false)
  useUnsavedChangesGuard(dirty)

  function change(mutator: (f: ReturnType<typeof toText>) => void) {
    setForm((f) => {
      const next = structuredClone(f)
      mutator(next)
      return next
    })
    setDirty(true)
  }

  async function save() {
    const values: Record<string, unknown> = { taxEnabled: form.taxEnabled, taxLabel: form.taxLabel }
    for (const f of MONEY_FIELDS) {
      const cents = parseToCents(form.money[f.key] || "0")
      if (cents === null) return setError(`${f.label}: enter an amount like 150 or 1'250.50.`)
      values[f.key] = cents
    }
    for (const [key, text] of Object.entries(form.numbers)) {
      values[key] = Number(String(text).replace(",", "."))
    }
    const parsed = pricingSettingsInput.safeParse(values)
    if (!parsed.success) {
      const issue = parsed.error.issues[0]
      return setError(`${String(issue?.path[0])}: ${issue?.message}`)
    }
    setError(null)
    try {
      await update.mutateAsync(parsed.data)
      await utils.catalog.pricingSettings.get.invalidate()
      setDirty(false)
      toast.success("Ansätze und Bedingungen gespeichert")
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Speichern fehlgeschlagen")
    }
  }

  return (
    <Card>
      <CardHeader>Zuschläge und Bedingungen</CardHeader>
      <CardContent className="space-y-6">
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {MONEY_FIELDS.map((f) => (
            <div key={f.key}>
              <FieldLabel htmlFor={f.key}>{f.label} (CHF)</FieldLabel>
              <Input
                id={f.key}
                inputMode="decimal"
                disabled={!canEdit}
                value={form.money[f.key]}
                onChange={(e) => change((d) => void (d.money[f.key] = e.target.value))}
              />
              {f.hint && <FieldHint>{f.hint}</FieldHint>}
            </div>
          ))}
          {NUMBER_FIELDS.map((f) => (
            <div key={f.key}>
              <FieldLabel htmlFor={f.key}>
                {f.label} ({f.suffix})
              </FieldLabel>
              <Input
                id={f.key}
                inputMode="decimal"
                disabled={!canEdit}
                value={form.numbers[f.key]}
                onChange={(e) => change((d) => void (d.numbers[f.key] = e.target.value))}
              />
            </div>
          ))}
        </div>

        <div className="border-surface-divider grid gap-4 border-t pt-4 sm:grid-cols-3">
          <label className="text-text-primary flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              disabled={!canEdit}
              checked={form.taxEnabled}
              onChange={(e) => change((d) => void (d.taxEnabled = e.target.checked))}
            />
            Firma ist MWST-pflichtig
          </label>
          <div>
            <FieldLabel htmlFor="taxLabel">MWST-Bezeichnung</FieldLabel>
            <Input
              id="taxLabel"
              disabled={!canEdit || !form.taxEnabled}
              value={form.taxLabel}
              onChange={(e) => change((d) => void (d.taxLabel = e.target.value))}
            />
          </div>
          <div>
            <FieldLabel htmlFor="taxRatePercent">Normalsatz MWST (%)</FieldLabel>
            <Input
              id="taxRatePercent"
              inputMode="decimal"
              disabled={!canEdit || !form.taxEnabled}
              value={form.numbers["taxRatePercent"]}
              onChange={(e) => change((d) => void (d.numbers["taxRatePercent"] = e.target.value))}
            />
          </div>
        </div>

        {error && <FieldError message={error} />}
        {canEdit && (
          <div className="flex justify-end">
            <Button onClick={save} disabled={!dirty || update.isPending}>
              {update.isPending ? "Speichern …" : "Speichern"}
            </Button>
          </div>
        )}
      </CardContent>
    </Card>
  )
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function RatesSettingsPage() {
  const toast = useToast()
  const utils = trpc.useUtils()
  const canEdit = useHasPermission("settings.services")
  const rates = trpc.catalog.rateCards.list.useQuery()
  const settings = trpc.catalog.pricingSettings.get.useQuery()
  const remove = trpc.catalog.rateCards.remove.useMutation()
  const [editing, setEditing] = useState<DraftRate | null>(null)
  const [removing, setRemoving] = useState<RateCard | null>(null)

  const toDraft = (r?: RateCard): DraftRate => ({
    ...(r ? { id: r.id } : {}),
    name: r?.name ?? "",
    crewSize: String(r?.crewSize ?? 2),
    vehicleType: r?.vehicleType ?? "cargo_van",
    rate: r ? formatCents(r.hourlyRateCents) : "",
    cost: r ? formatCents(r.hourlyCostCents) : "",
    isActive: r?.isActive ?? true,
  })

  return (
    <div className="space-y-6">
      <PageHeader
        title="Ansätze und Bedingungen"
        description="Stundenansätze pro Team sowie Zuschläge und Bedingungen für neue Offerten."
      />

      <Card className="overflow-hidden p-0">
        <div className="flex items-center justify-between pr-4">
          <CardHeader>Teamansätze (pro Stunde)</CardHeader>
          {canEdit && (
            <Button size="sm" onClick={() => setEditing(toDraft())}>
              <Plus className="h-4 w-4" />
              Ansatz erfassen
            </Button>
          )}
        </div>
        {rates.isLoading ? (
          <div className="p-4">
            <Skeleton className="h-24 w-full" />
          </div>
        ) : (rates.data ?? []).length === 0 ? (
          <p className="text-text-muted px-4 pb-4 text-sm">
            No team rates yet. Add one per team you offer, e.g. “2 Mann + Lieferwagen” or “3 Mann +
            LKW 3.5 t”.
          </p>
        ) : (
          <table className="w-full border-collapse text-sm">
            <thead>
              <tr className="border-surface-divider text-text-muted border-y text-left text-xs font-medium">
                <th className="px-4 py-2.5">Team</th>
                <th className="hidden px-4 py-2.5 sm:table-cell">Personen</th>
                <th className="hidden px-4 py-2.5 md:table-cell">Fahrzeug</th>
                <th className="px-4 py-2.5 text-right">Preis / Std.</th>
                <th className="hidden px-4 py-2.5 text-right md:table-cell">Kosten / Std.</th>
                {canEdit && <th className="px-4 py-2.5" />}
              </tr>
            </thead>
            <tbody>
              {(rates.data ?? []).map((r) => (
                <tr key={r.id} className="border-surface-divider border-b last:border-0">
                  <td className="px-4 py-3">
                    <span className="text-text-primary font-medium">{r.name}</span>{" "}
                    {!r.isActive && <Badge variant="neutral">Inaktiv</Badge>}
                  </td>
                  <td className="text-text-secondary hidden px-4 py-3 sm:table-cell">
                    {r.crewSize}
                  </td>
                  <td className="text-text-secondary hidden px-4 py-3 md:table-cell">
                    {r.vehicleType ? VEHICLE_LABELS[r.vehicleType] : "—"}
                  </td>
                  <td className="text-text-primary px-4 py-3 text-right tabular-nums">
                    {formatChf(r.hourlyRateCents)}
                  </td>
                  <td className="text-text-muted hidden px-4 py-3 text-right tabular-nums md:table-cell">
                    {formatChf(r.hourlyCostCents)}
                  </td>
                  {canEdit && (
                    <td className="px-2 py-3">
                      <div className="flex justify-end gap-1">
                        <Button
                          variant="ghost"
                          size="icon"
                          aria-label={`${r.name} bearbeiten`}
                          onClick={() => setEditing(toDraft(r))}
                        >
                          <Pencil className="h-4 w-4" />
                        </Button>
                        <Button
                          variant="dangerGhost"
                          size="icon"
                          aria-label={`${r.name} entfernen`}
                          onClick={() => setRemoving(r)}
                        >
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </div>
                    </td>
                  )}
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </Card>

      {settings.data ? (
        // Remount when the saved values change so the form starts from them
        <SettingsForm
          key={JSON.stringify(settings.data)}
          initial={settings.data}
          canEdit={canEdit}
        />
      ) : (
        <Skeleton className="h-72 w-full rounded-[var(--radius-lg)]" />
      )}

      {editing && <RateDialog draft={editing} onClose={() => setEditing(null)} />}

      <ConfirmDialog
        open={removing !== null}
        onOpenChange={(open) => !open && setRemoving(null)}
        title={`${removing?.name ?? "Ansatz"} entfernen?`}
        description="Offerten mit diesem Ansatz behalten ihre Preise."
        confirmLabel="Entfernen"
        onConfirm={async () => {
          if (!removing) return
          const target = removing
          setRemoving(null)
          try {
            await remove.mutateAsync({ id: target.id })
            await utils.catalog.rateCards.list.invalidate()
            toast.success("Ansatz entfernt")
          } catch (err) {
            toast.error(err instanceof Error ? err.message : "Entfernen fehlgeschlagen")
          }
        }}
      />
    </div>
  )
}
