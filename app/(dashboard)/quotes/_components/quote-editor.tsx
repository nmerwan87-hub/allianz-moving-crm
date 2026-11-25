"use client"

import { useMemo, useState } from "react"
import { useRouter } from "next/navigation"
import { AlertTriangle, Eye, Plus, Save, Send, Trash2, X } from "lucide-react"
import { trpc } from "@/lib/trpc/client"
import { formatChf, formatCents, parseToCents } from "@/lib/format/money"
import { calcLine, calcTotals, type CalcLine } from "@/lib/quotes/calc"
import { Button } from "@/app/(dashboard)/_components/ui/button"
import { Badge } from "@/app/(dashboard)/_components/ui/badge"
import { Card, CardContent, CardHeader } from "@/app/(dashboard)/_components/ui/card"
import {
  Input,
  Select,
  Textarea,
  FieldLabel,
  FieldError,
} from "@/app/(dashboard)/_components/ui/field"
import { ConfirmDialog } from "@/app/(dashboard)/_components/ui/confirm-dialog"
import { useToast } from "@/app/(dashboard)/_components/ui/toast"
import { useUnsavedChangesGuard } from "@/app/(dashboard)/_lib/active-company"
import { moveTypeEnum } from "@/modules/leads/interface"
import type { Quote, QuoteLine } from "@/modules/quotes/interface"
import { LANGUAGE_LABELS, PRICING_MODE_LABELS } from "../_lib/labels"
import { SendDialog } from "./send-dialog"

type PricingMode = QuoteLine["pricingMode"]

interface DraftLine {
  key: string
  id?: string
  serviceCatalogId: string | null
  itemType: QuoteLine["itemType"]
  name: string
  description: string
  pricingMode: PricingMode
  quantity: string
  unit: string
  price: string
  cost: string
  discountType: "" | "percent" | "fixed"
  discountValue: string
  vat: string
}

let lineCounter = 0
const newKey = () => `line-${++lineCounter}`

function num(value: string): number {
  const n = Number(value.replace(",", ".").replace(/['’\s]/g, ""))
  return Number.isFinite(n) ? n : NaN
}

function toDraftLine(l: QuoteLine): DraftLine {
  return {
    key: newKey(),
    id: l.id,
    serviceCatalogId: l.serviceCatalogId,
    itemType: l.itemType,
    name: l.name,
    description: l.description ?? "",
    pricingMode: l.pricingMode,
    quantity: String(l.quantity),
    unit: l.unit ?? "",
    price: formatCents(l.unitPriceCents),
    cost: l.costPriceCents === null ? "" : formatCents(l.costPriceCents),
    discountType: l.discountType ?? "",
    discountValue:
      l.discountValue === null
        ? ""
        : l.discountType === "fixed"
          ? formatCents(l.discountValue)
          : String(l.discountValue),
    vat: String(l.vatRatePercent),
  }
}

function toCalc(l: DraftLine): CalcLine {
  return {
    pricingMode: l.pricingMode,
    quantity: num(l.quantity) || 0,
    unitPriceCents: parseToCents(l.price) ?? 0,
    costPriceCents: parseToCents(l.cost) ?? 0,
    discountType: l.discountType || null,
    discountValue:
      l.discountType === "fixed"
        ? (parseToCents(l.discountValue) ?? 0) / 100
        : num(l.discountValue) || 0,
    vatRatePercent: num(l.vat) || 0,
  }
}

interface HeaderForm {
  title: string
  language: Quote["language"]
  moveType: Quote["moveType"]
  scheduledDate: string
  dateFlexible: boolean
  originAddress: string
  originPostalCode: string
  originCity: string
  originFloor: string
  originHasElevator: boolean
  destAddress: string
  destPostalCode: string
  destCity: string
  destFloor: string
  destHasElevator: boolean
  distanceKm: string
  estimatedHours: string
  depositPercent: string
  costCap: string
  validUntil: string
  customerNotes: string
  internalNotes: string
}

function toHeader(q: Quote): HeaderForm {
  return {
    title: q.title ?? "",
    language: q.language,
    moveType: q.moveType,
    scheduledDate: q.scheduledDate ?? "",
    dateFlexible: q.dateFlexible,
    originAddress: q.originAddress ?? "",
    originPostalCode: q.originPostalCode ?? "",
    originCity: q.originCity ?? "",
    originFloor: q.originFloor === null ? "" : String(q.originFloor),
    originHasElevator: q.originHasElevator,
    destAddress: q.destAddress ?? "",
    destPostalCode: q.destPostalCode ?? "",
    destCity: q.destCity ?? "",
    destFloor: q.destFloor === null ? "" : String(q.destFloor),
    destHasElevator: q.destHasElevator,
    distanceKm: q.distanceKm === null ? "" : String(q.distanceKm),
    estimatedHours: q.estimatedHours === null ? "" : String(q.estimatedHours),
    depositPercent: String(q.depositPercent),
    costCap: q.costCapCents === null ? "" : formatCents(q.costCapCents),
    validUntil: q.expiresAt?.slice(0, 10) ?? "",
    customerNotes: q.customerNotes ?? "",
    internalNotes: q.internalNotes ?? "",
  }
}

const optionalInt = (v: string) => (v.trim() === "" ? null : Math.trunc(num(v)))
const optionalNum = (v: string) => (v.trim() === "" ? null : num(v))

export function QuoteEditor({
  quote,
  lines: initialLines,
  permissions,
}: {
  quote: Quote
  lines: QuoteLine[]
  permissions: { viewCost: boolean; applyDiscount: boolean; send: boolean; edit: boolean }
}) {
  const router = useRouter()
  const toast = useToast()
  const utils = trpc.useUtils()
  const services = trpc.catalog.services.list.useQuery()
  const rateCards = trpc.catalog.rateCards.list.useQuery()
  const updateMutation = trpc.quotes.update.useMutation()
  const saveLinesMutation = trpc.quotes.saveLines.useMutation()
  const cancelMutation = trpc.quotes.cancel.useMutation()

  const [header, setHeader] = useState(() => toHeader(quote))
  const [lines, setLines] = useState<DraftLine[]>(() => initialLines.map(toDraftLine))
  const [dirty, setDirty] = useState(false)
  const [errors, setErrors] = useState<string[]>([])
  const [saving, setSaving] = useState(false)
  const [sendOpen, setSendOpen] = useState(false)
  const [cancelOpen, setCancelOpen] = useState(false)
  useUnsavedChangesGuard(dirty)

  const readOnly = !permissions.edit
  const totals = useMemo(
    () => calcTotals(lines.map(toCalc), num(header.depositPercent) || 0),
    [lines, header.depositPercent],
  )
  const costCapCents = header.costCap.trim() ? parseToCents(header.costCap) : null
  const overCap = costCapCents !== null && totals.totalCents > costCapCents
  const margin =
    totals.netCents > 0
      ? Math.round(((totals.netCents - totals.costCents) / totals.netCents) * 1000) / 10
      : null

  const setH = <K extends keyof HeaderForm>(key: K, value: HeaderForm[K]) => {
    setHeader((h) => ({ ...h, [key]: value }))
    setDirty(true)
  }
  const setLine = (key: string, patch: Partial<DraftLine>) => {
    setLines((ls) => ls.map((l) => (l.key === key ? { ...l, ...patch } : l)))
    setDirty(true)
  }
  const addLine = (line: Omit<DraftLine, "key">) => {
    setLines((ls) => [...ls, { key: newKey(), ...line }])
    setDirty(true)
  }

  function addFromService(serviceId: string) {
    const s = services.data?.find((x) => x.id === serviceId)
    if (!s) return
    addLine({
      serviceCatalogId: s.id,
      itemType: s.defaultPricingMode === "hourly" ? "labor" : "other",
      name: s.name,
      description: s.customerDescription ?? "",
      pricingMode: s.defaultPricingMode,
      quantity:
        s.defaultPricingMode === "hourly" && header.estimatedHours ? header.estimatedHours : "1",
      unit: s.defaultUnitLabel ?? "",
      price: formatCents(s.defaultUnitPriceCents),
      cost: permissions.viewCost ? formatCents(s.defaultCostPriceCents) : "",
      discountType: "",
      discountValue: "",
      vat: String(s.defaultVatRatePercent),
    })
  }

  function addFromRate(rateId: string) {
    const r = rateCards.data?.find((x) => x.id === rateId)
    if (!r) return
    const service = services.data?.find((s) => s.defaultPricingMode === "hourly")
    addLine({
      serviceCatalogId: null,
      itemType: "labor",
      name: r.name,
      description: "",
      pricingMode: "hourly",
      quantity: header.estimatedHours || "1",
      unit: "Std.",
      price: formatCents(r.hourlyRateCents),
      cost: permissions.viewCost ? formatCents(r.hourlyCostCents) : "",
      discountType: "",
      discountValue: "",
      vat: String(service?.defaultVatRatePercent ?? 8.1),
    })
  }

  /** Validates locally, then saves header and lines. Returns false on any problem. */
  async function save(): Promise<boolean> {
    const problems: string[] = []
    if (!header.validUntil) problems.push("Gültigkeitsdatum setzen.")
    if (header.costCap.trim() && costCapCents === null)
      problems.push("Kostendach als Betrag eingeben, z. B. 2'000.")
    const payload = lines.map((l, i) => {
      const quantity = l.pricingMode === "manual" ? 1 : num(l.quantity)
      const price = parseToCents(l.price)
      if (!l.name.trim()) problems.push(`Position ${i + 1}: Name fehlt.`)
      if (!(quantity > 0)) problems.push(`Position ${i + 1}: Menge muss grösser als null sein.`)
      if (price === null)
        problems.push(`Position ${i + 1}: Preis eingeben, z. B. 150 oder 1'250.50.`)
      const vat = num(l.vat)
      if (!(vat >= 0 && vat <= 100)) problems.push(`Position ${i + 1}: MWST zwischen 0 und 100.`)
      const discountValue = l.discountType
        ? l.discountType === "fixed"
          ? (parseToCents(l.discountValue) ?? NaN) / 100
          : num(l.discountValue)
        : null
      if (l.discountType && !(Number(discountValue) >= 0))
        problems.push(`Position ${i + 1}: Rabatt prüfen.`)
      return {
        ...(l.id ? { id: l.id } : {}),
        serviceCatalogId: l.serviceCatalogId,
        itemType: l.itemType,
        name: l.name.trim(),
        description: l.description,
        pricingMode: l.pricingMode,
        quantity,
        unit: l.unit,
        unitPriceCents: price ?? 0,
        costPriceCents: parseToCents(l.cost) ?? 0,
        discountType: l.discountType || null,
        discountValue,
        vatRatePercent: vat,
      }
    })
    setErrors(problems)
    if (problems.length) return false

    setSaving(true)
    try {
      await updateMutation.mutateAsync({
        id: quote.id,
        title: header.title,
        language: header.language,
        moveType: header.moveType,
        scheduledDate: header.scheduledDate || null,
        dateFlexible: header.dateFlexible,
        originAddress: header.originAddress,
        originPostalCode: header.originPostalCode,
        originCity: header.originCity,
        originFloor: optionalInt(header.originFloor),
        originHasElevator: header.originHasElevator,
        destAddress: header.destAddress,
        destPostalCode: header.destPostalCode,
        destCity: header.destCity,
        destFloor: optionalInt(header.destFloor),
        destHasElevator: header.destHasElevator,
        distanceKm: optionalNum(header.distanceKm),
        estimatedHours: optionalNum(header.estimatedHours),
        depositPercent: num(header.depositPercent) || 0,
        costCapCents,
        pricingKind: quote.pricingKind,
        crewSize: quote.crewSize,
        rooms: quote.rooms,
        rateCardId: quote.rateCardId,
        validUntil: header.validUntil,
        customerNotes: header.customerNotes,
        internalNotes: header.internalNotes,
      })
      await saveLinesMutation.mutateAsync({ id: quote.id, lines: payload })
      await utils.quotes.get.invalidate({ id: quote.id })
      setDirty(false)
      return true
    } catch (err) {
      setErrors([err instanceof Error ? err.message : "Speichern fehlgeschlagen"])
      return false
    } finally {
      setSaving(false)
    }
  }

  async function preview() {
    if (dirty && !(await save())) return
    window.open(`/api/quotes/${quote.id}/preview`, "_blank", "noopener")
  }

  const field = (key: keyof HeaderForm) => ({
    id: `q-${key}`,
    value: header[key] as string,
    disabled: readOnly,
    onChange: (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) =>
      setH(key, e.target.value as never),
  })

  return (
    <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_280px]">
      <div className="min-w-0 space-y-6">
        <Card>
          <CardHeader>Umzug</CardHeader>
          <CardContent className="grid gap-4 sm:grid-cols-6">
            <div className="sm:col-span-4">
              <FieldLabel htmlFor="q-title">Titel auf der Offerte</FieldLabel>
              <Input placeholder="z. B. Privatumzug 3.5 Zimmer" {...field("title")} />
            </div>
            <div className="sm:col-span-2">
              <FieldLabel htmlFor="q-language">Sprache</FieldLabel>
              <Select {...field("language")}>
                {Object.entries(LANGUAGE_LABELS).map(([v, label]) => (
                  <option key={v} value={v}>
                    {label}
                  </option>
                ))}
              </Select>
            </div>
            <div className="sm:col-span-2">
              <FieldLabel htmlFor="q-moveType">Art</FieldLabel>
              <Select {...field("moveType")}>
                {moveTypeEnum.options.map((v) => (
                  <option key={v} value={v}>
                    {v.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase())}
                  </option>
                ))}
              </Select>
            </div>
            <div className="sm:col-span-2">
              <FieldLabel htmlFor="q-scheduledDate">Umzugsdatum</FieldLabel>
              <Input type="date" {...field("scheduledDate")} />
            </div>
            <label className="text-text-primary flex items-end gap-2 pb-2 text-sm sm:col-span-2">
              <input
                type="checkbox"
                disabled={readOnly}
                checked={header.dateFlexible}
                onChange={(e) => setH("dateFlexible", e.target.checked)}
              />
              Datum flexibel
            </label>

            {(["origin", "dest"] as const).map((side) => (
              <div
                key={side}
                className="border-surface-divider grid gap-3 border-t pt-4 sm:col-span-6 sm:grid-cols-6"
              >
                <p className="text-text-primary text-sm font-semibold sm:col-span-6">
                  {side === "origin" ? "Von" : "Nach"}
                </p>
                <div className="sm:col-span-6">
                  <Input
                    aria-label={`${side} street`}
                    placeholder="Strasse und Nr."
                    {...field(`${side}Address`)}
                  />
                </div>
                <div className="sm:col-span-2">
                  <Input
                    aria-label={`${side} postal code`}
                    placeholder="PLZ"
                    {...field(`${side}PostalCode`)}
                  />
                </div>
                <div className="sm:col-span-4">
                  <Input aria-label={`${side} city`} placeholder="Ort" {...field(`${side}City`)} />
                </div>
                <div className="sm:col-span-2">
                  <Input
                    aria-label={`${side} floor`}
                    type="number"
                    placeholder="Stock (0 = EG)"
                    {...field(`${side}Floor`)}
                  />
                </div>
                <label className="text-text-primary flex items-center gap-2 text-sm sm:col-span-4">
                  <input
                    type="checkbox"
                    disabled={readOnly}
                    checked={header[`${side}HasElevator`]}
                    onChange={(e) => setH(`${side}HasElevator`, e.target.checked)}
                  />
                  Lift vorhanden
                </label>
              </div>
            ))}

            <div className="border-surface-divider grid gap-3 border-t pt-4 sm:col-span-6 sm:grid-cols-6">
              <div className="sm:col-span-3">
                <FieldLabel htmlFor="q-distanceKm">Distanz (km)</FieldLabel>
                <Input inputMode="decimal" {...field("distanceKm")} />
              </div>
              <div className="sm:col-span-3">
                <FieldLabel htmlFor="q-estimatedHours">Geschätzte Stunden</FieldLabel>
                <Input inputMode="decimal" {...field("estimatedHours")} />
              </div>
            </div>
          </CardContent>
        </Card>

        <Card className="overflow-hidden p-0">
          <div className="flex flex-wrap items-center justify-between gap-2 pr-4">
            <CardHeader>Positionen</CardHeader>
            {!readOnly && (
              <div className="flex flex-wrap gap-2 py-2 pl-4">
                <Select
                  aria-label="Leistung aus Katalog hinzufügen"
                  className="h-8 w-48 text-xs"
                  value=""
                  onChange={(e) => addFromService(e.target.value)}
                >
                  <option value="">+ Aus Katalog …</option>
                  {(services.data ?? [])
                    .filter((s) => s.isActive)
                    .map((s) => (
                      <option key={s.id} value={s.id}>
                        {s.name}
                      </option>
                    ))}
                </Select>
                {(rateCards.data ?? []).some((r) => r.isActive) && (
                  <Select
                    aria-label="Teamansatz hinzufügen"
                    className="h-8 w-48 text-xs"
                    value=""
                    onChange={(e) => addFromRate(e.target.value)}
                  >
                    <option value="">+ Teamansatz …</option>
                    {(rateCards.data ?? [])
                      .filter((r) => r.isActive)
                      .map((r) => (
                        <option key={r.id} value={r.id}>
                          {r.name}
                        </option>
                      ))}
                  </Select>
                )}
                <Button
                  size="sm"
                  variant="secondary"
                  onClick={() =>
                    addLine({
                      serviceCatalogId: null,
                      itemType: "other",
                      name: "",
                      description: "",
                      pricingMode: "fixed",
                      quantity: "1",
                      unit: "",
                      price: "",
                      cost: "",
                      discountType: "",
                      discountValue: "",
                      vat: lines[0]?.vat ?? "8.1",
                    })
                  }
                >
                  <Plus className="h-4 w-4" />
                  Eigene Position
                </Button>
              </div>
            )}
          </div>

          {lines.length === 0 ? (
            <p className="text-text-muted border-surface-divider border-t px-4 py-6 text-sm">
              Noch keine Positionen. Aus dem Katalog, als Teamansatz oder als eigene Position
              hinzufügen.
            </p>
          ) : (
            <ul className="divide-surface-divider border-surface-divider divide-y border-t">
              {lines.map((l, index) => {
                const result = calcLine(toCalc(l))
                return (
                  <li key={l.key} className="grid gap-2 px-4 py-3 sm:grid-cols-12">
                    <div className="flex items-start gap-2 sm:col-span-12">
                      <span className="text-text-muted w-5 pt-2 text-xs">{index + 1}</span>
                      <div className="flex-1 space-y-1.5">
                        <Input
                          aria-label={`Position ${index + 1} Name`}
                          value={l.name}
                          disabled={readOnly}
                          placeholder="Leistung"
                          onChange={(e) => setLine(l.key, { name: e.target.value })}
                        />
                        <Input
                          aria-label={`Position ${index + 1} Beschreibung`}
                          value={l.description}
                          disabled={readOnly}
                          placeholder="Beschreibung auf der Offerte (optional)"
                          className="h-8 text-xs"
                          onChange={(e) => setLine(l.key, { description: e.target.value })}
                        />
                      </div>
                      {!readOnly && (
                        <Button
                          variant="dangerGhost"
                          size="icon"
                          aria-label={`Position ${index + 1} entfernen`}
                          onClick={() => {
                            setLines((ls) => ls.filter((x) => x.key !== l.key))
                            setDirty(true)
                          }}
                        >
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      )}
                    </div>
                    <div className="grid grid-cols-2 gap-2 pl-7 sm:col-span-12 sm:grid-cols-6">
                      <Select
                        aria-label={`Position ${index + 1} Preisart`}
                        value={l.pricingMode}
                        disabled={readOnly}
                        onChange={(e) =>
                          setLine(l.key, { pricingMode: e.target.value as PricingMode })
                        }
                      >
                        {Object.entries(PRICING_MODE_LABELS).map(([v, label]) => (
                          <option key={v} value={v}>
                            {label}
                          </option>
                        ))}
                      </Select>
                      {l.pricingMode !== "manual" ? (
                        <div className="flex gap-1">
                          <Input
                            aria-label={`Position ${index + 1} Menge`}
                            inputMode="decimal"
                            value={l.quantity}
                            disabled={readOnly}
                            onChange={(e) => setLine(l.key, { quantity: e.target.value })}
                          />
                          <Input
                            aria-label={`Position ${index + 1} Einheit`}
                            value={l.unit}
                            disabled={readOnly}
                            placeholder="Einheit"
                            className="w-20"
                            onChange={(e) => setLine(l.key, { unit: e.target.value })}
                          />
                        </div>
                      ) : (
                        <div />
                      )}
                      <Input
                        aria-label={`Position ${index + 1} Preis`}
                        inputMode="decimal"
                        value={l.price}
                        disabled={readOnly}
                        placeholder={l.pricingMode === "manual" ? "Betrag CHF" : "Preis CHF"}
                        onChange={(e) => setLine(l.key, { price: e.target.value })}
                      />
                      {permissions.viewCost ? (
                        <Input
                          aria-label={`Position ${index + 1} Einstand`}
                          inputMode="decimal"
                          value={l.cost}
                          disabled={readOnly}
                          placeholder="Einstand CHF"
                          onChange={(e) => setLine(l.key, { cost: e.target.value })}
                        />
                      ) : (
                        <div />
                      )}
                      <div className="flex gap-1">
                        <Select
                          aria-label={`Position ${index + 1} Rabattart`}
                          value={l.discountType}
                          disabled={readOnly || !permissions.applyDiscount}
                          className="w-20"
                          onChange={(e) =>
                            setLine(l.key, {
                              discountType: e.target.value as DraftLine["discountType"],
                            })
                          }
                        >
                          <option value="">Kein Rabatt</option>
                          <option value="percent">%</option>
                          <option value="fixed">CHF</option>
                        </Select>
                        {l.discountType && (
                          <Input
                            aria-label={`Position ${index + 1} Rabatt`}
                            inputMode="decimal"
                            value={l.discountValue}
                            disabled={readOnly || !permissions.applyDiscount}
                            onChange={(e) => setLine(l.key, { discountValue: e.target.value })}
                          />
                        )}
                      </div>
                      <div className="flex items-center gap-1">
                        <Input
                          aria-label={`Position ${index + 1} MWST`}
                          inputMode="decimal"
                          value={l.vat}
                          disabled={readOnly}
                          className="w-16"
                          onChange={(e) => setLine(l.key, { vat: e.target.value })}
                        />
                        <span className="text-text-muted text-xs">%</span>
                        <span className="text-text-primary ml-auto text-sm font-medium tabular-nums">
                          {formatCents(result.netCents)}
                        </span>
                      </div>
                    </div>
                  </li>
                )
              })}
            </ul>
          )}
        </Card>

        <Card>
          <CardHeader>Bemerkungen</CardHeader>
          <CardContent className="grid gap-4 sm:grid-cols-2">
            <div>
              <FieldLabel htmlFor="q-customerNotes">Bemerkung auf der Offerte</FieldLabel>
              <Textarea rows={4} {...field("customerNotes")} />
            </div>
            <div>
              <FieldLabel htmlFor="q-internalNotes">Interne Notiz</FieldLabel>
              <Textarea rows={4} {...field("internalNotes")} />
            </div>
          </CardContent>
        </Card>
      </div>

      <div className="space-y-4 lg:sticky lg:top-4 lg:self-start">
        <Card>
          <CardHeader>Total</CardHeader>
          <CardContent className="space-y-2 text-sm">
            <Row label="Zwischensumme" value={formatChf(totals.netCents)} />
            {totals.discountCents > 0 && (
              <Row label="inkl. Rabatte" value={`−${formatChf(totals.discountCents)}`} muted />
            )}
            {totals.vatByRate.map((v) => (
              <Row key={v.rate} label={`MWST ${v.rate} %`} value={formatChf(v.vatCents)} />
            ))}
            <div className="border-text-primary border-t pt-2">
              <Row label="Total" value={formatChf(totals.totalCents)} strong />
            </div>
            {totals.depositCents > 0 && (
              <Row
                label={`Anzahlung ${header.depositPercent} %`}
                value={formatChf(totals.depositCents)}
                muted
              />
            )}
            {permissions.viewCost && (
              <div className="border-surface-divider mt-2 border-t pt-2">
                <Row label="Einstand" value={formatChf(totals.costCents)} muted />
                <Row label="Marge" value={margin === null ? "—" : `${margin}%`} muted />
              </div>
            )}
            {overCap && (
              <p className="bg-danger-100 text-danger-700 mt-2 flex gap-2 rounded-[var(--radius-md)] p-2 text-xs">
                <AlertTriangle className="h-4 w-4 shrink-0" />
                Total liegt {formatChf(totals.totalCents - (costCapCents ?? 0))} über dem
                Kostendach. So kann die Offerte nicht gesendet werden.
              </p>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>Bedingungen</CardHeader>
          <CardContent className="space-y-3">
            <div>
              <FieldLabel htmlFor="q-validUntil" required>
                Gültig bis
              </FieldLabel>
              <Input type="date" {...field("validUntil")} />
            </div>
            <div>
              <FieldLabel htmlFor="q-costCap">Kostendach inkl. MWST (CHF)</FieldLabel>
              <Input inputMode="decimal" placeholder="optional" {...field("costCap")} />
            </div>
            <div>
              <FieldLabel htmlFor="q-depositPercent">Anzahlung (%)</FieldLabel>
              <Input inputMode="decimal" {...field("depositPercent")} />
            </div>
          </CardContent>
        </Card>

        {errors.length > 0 && (
          <div className="border-danger-600/30 bg-danger-100 rounded-[var(--radius-md)] border p-3">
            {errors.map((e) => (
              <FieldError key={e} message={e} />
            ))}
          </div>
        )}

        {!readOnly && (
          <div className="flex flex-col gap-2">
            <Button onClick={save} disabled={saving || !dirty}>
              <Save className="h-4 w-4" />
              {saving ? "Speichern …" : dirty ? "Entwurf speichern" : "Gespeichert"}
            </Button>
            <Button variant="secondary" onClick={preview} disabled={saving}>
              <Eye className="h-4 w-4" />
              Vorschau PDF
            </Button>
            {permissions.send && (
              <Button
                variant="secondary"
                disabled={saving || lines.length === 0 || overCap}
                onClick={async () => {
                  if (dirty && !(await save())) return
                  setSendOpen(true)
                }}
              >
                <Send className="h-4 w-4" />
                Offerte senden
              </Button>
            )}
            <Button variant="dangerGhost" onClick={() => setCancelOpen(true)}>
              <X className="h-4 w-4" />
              Entwurf verwerfen
            </Button>
          </div>
        )}
        {dirty && <Badge variant="warning">Ungespeicherte Änderungen</Badge>}
      </div>

      {sendOpen && (
        <SendDialog
          quoteId={quote.id}
          customerEmail={quote.customerEmail}
          totalCents={totals.totalCents}
          onClose={() => setSendOpen(false)}
        />
      )}

      <ConfirmDialog
        open={cancelOpen}
        onOpenChange={setCancelOpen}
        title="Entwurf verwerfen?"
        description="Der Entwurf bleibt zur Nachverfolgung erhalten, kann aber nicht mehr gesendet werden."
        confirmLabel="Verwerfen"
        onConfirm={async () => {
          try {
            await cancelMutation.mutateAsync({ id: quote.id })
            setDirty(false)
            await utils.quotes.invalidate()
            toast.success("Entwurf verworfen")
            router.push("/quotes")
          } catch (err) {
            toast.error(err instanceof Error ? err.message : "Verwerfen fehlgeschlagen")
          }
        }}
      />
    </div>
  )
}

function Row({
  label,
  value,
  strong,
  muted,
}: {
  label: string
  value: string
  strong?: boolean
  muted?: boolean
}) {
  return (
    <div
      className={`flex justify-between gap-4 ${strong ? "text-text-primary text-base font-semibold" : muted ? "text-text-muted" : "text-text-secondary"}`}
    >
      <span>{label}</span>
      <span className="tabular-nums">{value}</span>
    </div>
  )
}
