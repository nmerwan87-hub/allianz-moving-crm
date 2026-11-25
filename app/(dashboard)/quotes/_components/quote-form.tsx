"use client"

import { useState } from "react"
import Link from "next/link"
import { useRouter } from "next/navigation"
import {
  AlertTriangle,
  ArrowLeft,
  ChevronDown,
  Eye,
  Plus,
  Send,
  SlidersHorizontal,
  Trash2,
} from "lucide-react"
import { trpc } from "@/lib/trpc/client"
import { formatCents, parseToCents } from "@/lib/format/money"
import { calcTotals, type CalcLine } from "@/lib/quotes/calc"
import { Button } from "@/app/(dashboard)/_components/ui/button"
import { Input, Select, Textarea, FieldError } from "@/app/(dashboard)/_components/ui/field"
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/app/(dashboard)/_components/ui/dialog"
import { ConfirmDialog } from "@/app/(dashboard)/_components/ui/confirm-dialog"
import { useToast } from "@/app/(dashboard)/_components/ui/toast"
import { useUnsavedChangesGuard } from "@/app/(dashboard)/_lib/active-company"
import { cn } from "@/app/(dashboard)/_lib/cn"
import type { Quote, QuoteLine } from "@/modules/quotes/interface"
import type { Service } from "@/modules/catalog/interface"
import { LANGUAGE_LABELS, MOVE_TYPE_LABELS } from "../_lib/labels"
import { SendDialog } from "./send-dialog"

/**
 * The quote the way movers think about it (modelled on Bixin, kept simple):
 * customer → move → price (by effort or flat) → extra services → note.
 * The form writes ordinary quote lines; the database computes every total.
 * Lines with details the form does not show (discounts, VAT rates, cost
 * prices) are kept unchanged; the detailed line editor is one click away.
 */

type Side = { street: string; postal: string; city: string; floor: string; lift: boolean }

interface Extra {
  key: string
  id?: string
  serviceCatalogId: string | null
  itemType: QuoteLine["itemType"]
  name: string
  description: string
  pricingMode: QuoteLine["pricingMode"]
  quantity: string
  unit: string
  price: string
  included: boolean
  vat: number
  costPriceCents: number | null
  discountType: QuoteLine["discountType"]
  discountValue: number | null
}

const INCLUDED_TEXT: Record<Quote["language"], string> = {
  de: "inklusive",
  fr: "inclus",
  it: "incluso",
  en: "included",
}

let keyCounter = 0
const newKey = () => `extra-${++keyCounter}`

function num(value: string): number {
  const n = Number(value.replace(",", ".").replace(/['’\s]/g, ""))
  return Number.isFinite(n) ? n : NaN
}

const optionalNum = (v: string) => (v.trim() === "" ? null : num(v))
const qtyMode = (mode: QuoteLine["pricingMode"]) =>
  mode === "quantity" || mode === "distance" || mode === "hourly"

function toExtra(l: QuoteLine): Extra {
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
    included: l.unitPriceCents === 0,
    vat: l.vatRatePercent,
    costPriceCents: l.costPriceCents,
    discountType: l.discountType,
    discountValue: l.discountValue,
  }
}

function extraFromService(s: Service, quantity = "1"): Extra {
  return {
    key: newKey(),
    serviceCatalogId: s.id,
    itemType: "other",
    name: s.name,
    description: s.customerDescription ?? "",
    pricingMode: s.defaultPricingMode,
    quantity,
    unit: s.defaultUnitLabel ?? "",
    price: formatCents(s.defaultUnitPriceCents),
    included: false,
    vat: s.defaultVatRatePercent,
    costPriceCents: s.defaultCostPriceCents,
    discountType: null,
    discountValue: null,
  }
}

function customExtra(name: string, vat: number): Extra {
  return {
    key: newKey(),
    serviceCatalogId: null,
    itemType: "other",
    name,
    description: "",
    pricingMode: "fixed",
    quantity: "1",
    unit: "",
    price: "",
    included: false,
    vat,
    costPriceCents: 0,
    discountType: null,
    discountValue: null,
  }
}

export function QuoteForm({
  quote,
  lines: initialLines,
  permissions,
  onDetailMode,
}: {
  quote: Quote
  lines: QuoteLine[]
  permissions: { viewCost: boolean; applyDiscount: boolean; send: boolean; edit: boolean }
  onDetailMode: () => void
}) {
  const router = useRouter()
  const toast = useToast()
  const utils = trpc.useUtils()
  const services = trpc.catalog.services.list.useQuery()
  const rateCards = trpc.catalog.rateCards.list.useQuery()
  const settings = trpc.catalog.pricingSettings.get.useQuery()
  const updateMutation = trpc.quotes.update.useMutation()
  const saveLinesMutation = trpc.quotes.saveLines.useMutation()
  const cancelMutation = trpc.quotes.cancel.useMutation()

  const defaultVat = settings.data
    ? settings.data.taxEnabled
      ? settings.data.taxRatePercent
      : 0
    : 8.1
  const main = initialLines[0]?.itemType === "labor" ? initialLines[0] : undefined

  // ── Form state ──
  const [date, setDate] = useState(quote.scheduledDate ?? "")
  const [rooms, setRooms] = useState(quote.rooms === null ? "" : String(quote.rooms))
  const [origin, setOrigin] = useState<Side>({
    street: quote.originAddress ?? "",
    postal: quote.originPostalCode ?? "",
    city: quote.originCity ?? "",
    floor: quote.originFloor === null ? "" : String(quote.originFloor),
    lift: quote.originHasElevator,
  })
  const [dest, setDest] = useState<Side>({
    street: quote.destAddress ?? "",
    postal: quote.destPostalCode ?? "",
    city: quote.destCity ?? "",
    floor: quote.destFloor === null ? "" : String(quote.destFloor),
    lift: quote.destHasElevator,
  })
  const [kind, setKind] = useState<Quote["pricingKind"]>(quote.pricingKind)
  const [rateCardId, setRateCardId] = useState(quote.rateCardId ?? "")
  const [teamName, setTeamName] = useState(main?.name ?? "")
  const [rate, setRate] = useState(
    main && main.pricingMode !== "manual" ? formatCents(main.unitPriceCents) : "",
  )
  const [hours, setHours] = useState(
    quote.estimatedHours !== null
      ? String(quote.estimatedHours)
      : main && main.pricingMode === "hourly"
        ? String(main.quantity)
        : "",
  )
  const [crew, setCrew] = useState(quote.crewSize === null ? "" : String(quote.crewSize))
  const [flatPrice, setFlatPrice] = useState(
    main && main.pricingMode === "manual" ? formatCents(main.unitPriceCents) : "",
  )
  const [costCap, setCostCap] = useState(
    quote.costCapCents === null ? "" : formatCents(quote.costCapCents),
  )
  const [extras, setExtras] = useState<Extra[]>(() =>
    (main ? initialLines.slice(1) : initialLines).map(toExtra),
  )
  const [note, setNote] = useState(quote.customerNotes ?? "")
  const [title, setTitle] = useState(quote.title ?? "")
  const [language, setLanguage] = useState(quote.language)
  const [moveType, setMoveType] = useState(quote.moveType)
  const [validUntil, setValidUntil] = useState(quote.expiresAt?.slice(0, 10) ?? "")
  const [depositPercent, setDepositPercent] = useState(String(quote.depositPercent))
  const [distanceKm, setDistanceKm] = useState(
    quote.distanceKm === null ? "" : String(quote.distanceKm),
  )
  const [internalNotes, setInternalNotes] = useState(quote.internalNotes ?? "")
  const [moreOpen, setMoreOpen] = useState(false)
  const [servicesOpen, setServicesOpen] = useState(false)

  const [dirty, setDirty] = useState(false)
  const [errors, setErrors] = useState<string[]>([])
  const [saving, setSaving] = useState(false)
  const [sendOpen, setSendOpen] = useState(false)
  const [cancelOpen, setCancelOpen] = useState(false)
  useUnsavedChangesGuard(dirty)

  const readOnly = !permissions.edit
  const touch =
    <T,>(setter: (v: T) => void) =>
    (v: T) => {
      setter(v)
      setDirty(true)
    }

  const activeRates = (rateCards.data ?? []).filter((r) => r.isActive)
  const selectedRate = activeRates.find((r) => r.id === rateCardId)
  const mainVat = main?.vatRatePercent ?? defaultVat

  function chooseTeam(id: string) {
    setRateCardId(id)
    const r = activeRates.find((x) => x.id === id)
    if (r) {
      setTeamName(r.name)
      setRate(formatCents(r.hourlyRateCents))
      setCrew(String(r.crewSize))
    }
    setDirty(true)
  }

  // ── Lines the form writes ──
  function buildLines() {
    const hoursNum = num(hours)
    const mainCost = selectedRate ? selectedRate.hourlyCostCents : null
    const mainLine =
      kind === "hourly"
        ? {
            ...(main?.id ? { id: main.id } : {}),
            serviceCatalogId: null,
            itemType: "labor" as const,
            name: teamName.trim() || "Umzugsteam",
            description: "",
            pricingMode: "hourly" as const,
            quantity: hoursNum,
            unit: "Std.",
            unitPriceCents: parseToCents(rate) ?? NaN,
            costPriceCents: mainCost ?? main?.costPriceCents ?? 0,
            vatRatePercent: mainVat,
            discountType: null,
            discountValue: null,
          }
        : {
            ...(main?.id ? { id: main.id } : {}),
            serviceCatalogId: null,
            itemType: "labor" as const,
            name: teamName.trim() || "Umzug",
            description: [crew && `${crew} Mitarbeitende`, hours && `ca. ${hours} Std.`]
              .filter(Boolean)
              .join(" · "),
            pricingMode: "manual" as const,
            quantity: 1,
            unit: "",
            unitPriceCents: parseToCents(flatPrice) ?? NaN,
            costPriceCents:
              mainCost !== null && hoursNum > 0
                ? Math.round(mainCost * hoursNum)
                : (main?.costPriceCents ?? 0),
            vatRatePercent: mainVat,
            discountType: null,
            discountValue: null,
          }
    const extraLines = extras.map((e) => ({
      ...(e.id ? { id: e.id } : {}),
      serviceCatalogId: e.serviceCatalogId,
      itemType: e.itemType,
      name: e.name.trim(),
      description: e.included ? INCLUDED_TEXT[language] : e.description,
      pricingMode: e.pricingMode,
      quantity: qtyMode(e.pricingMode) ? num(e.quantity) : 1,
      unit: e.unit,
      unitPriceCents: e.included ? 0 : (parseToCents(e.price) ?? NaN),
      costPriceCents: e.costPriceCents ?? 0,
      discountType: e.discountType,
      discountValue:
        e.discountType === "fixed" && e.discountValue !== null
          ? e.discountValue / 100
          : e.discountValue,
      vatRatePercent: e.vat,
    }))
    return [mainLine, ...extraLines]
  }

  const preview = buildLines()
  const toCalc = (l: (typeof preview)[number]): CalcLine => ({
    pricingMode: l.pricingMode,
    quantity: Number.isFinite(l.quantity) ? l.quantity : 0,
    unitPriceCents: Number.isFinite(l.unitPriceCents) ? l.unitPriceCents : 0,
    discountType: l.discountType ?? null,
    discountValue: l.discountValue ?? null,
    vatRatePercent: l.vatRatePercent,
  })
  const totals = calcTotals(preview.map(toCalc), num(depositPercent) || 0)
  const costCapCents = kind === "hourly" && costCap.trim() ? parseToCents(costCap) : null
  const overCap = costCapCents !== null && totals.totalCents > costCapCents

  /**
   * Saves header and lines. `reload: false` keeps this form mounted (the page
   * remounts it after every reload), e.g. so the send dialog can open next.
   */
  async function save({ reload = true }: { reload?: boolean } = {}): Promise<boolean> {
    const problems: string[] = []
    const payload = buildLines()
    const m = payload[0]!
    if (kind === "hourly") {
      if (!Number.isFinite(m.unitPriceCents)) problems.push("Stundenansatz eingeben, z. B. 195.")
      if (!(m.quantity > 0)) problems.push("Geschätzte Stunden eingeben.")
    } else if (!Number.isFinite(m.unitPriceCents) || m.unitPriceCents <= 0) {
      problems.push("Pauschalpreis eingeben, z. B. 1'800.")
    }
    payload.slice(1).forEach((l) => {
      if (!l.name) problems.push("Jede Zusatzleistung braucht einen Namen.")
      if (!Number.isFinite(l.unitPriceCents))
        problems.push(`${l.name || "Zusatzleistung"}: Preis eingeben.`)
      if (!(l.quantity > 0)) problems.push(`${l.name || "Zusatzleistung"}: Menge eingeben.`)
    })
    if (costCap.trim() && kind === "hourly" && costCapCents === null)
      problems.push("Kostendach als Betrag eingeben, z. B. 2'500.")
    if (!validUntil) problems.push("«Gültig bis» fehlt.")
    setErrors([...new Set(problems)])
    if (problems.length) return false

    setSaving(true)
    try {
      await updateMutation.mutateAsync({
        id: quote.id,
        title: title.trim() || (rooms ? `Umzug ${rooms} Zimmer` : ""),
        language,
        moveType,
        scheduledDate: date || null,
        dateFlexible: quote.dateFlexible,
        originAddress: origin.street,
        originPostalCode: origin.postal,
        originCity: origin.city,
        originFloor: origin.floor === "" ? null : Math.trunc(num(origin.floor)),
        originHasElevator: origin.lift,
        destAddress: dest.street,
        destPostalCode: dest.postal,
        destCity: dest.city,
        destFloor: dest.floor === "" ? null : Math.trunc(num(dest.floor)),
        destHasElevator: dest.lift,
        distanceKm: optionalNum(distanceKm),
        estimatedHours: optionalNum(hours),
        depositPercent: num(depositPercent) || 0,
        costCapCents,
        pricingKind: kind,
        crewSize: crew ? Math.trunc(num(crew)) || null : null,
        rooms: optionalNum(rooms),
        rateCardId: rateCardId || null,
        validUntil,
        customerNotes: note,
        internalNotes,
      })
      await saveLinesMutation.mutateAsync({ id: quote.id, lines: payload })
      setDirty(false)
      if (reload) await utils.quotes.get.invalidate({ id: quote.id })
      return true
    } catch (err) {
      setErrors([err instanceof Error ? err.message : "Speichern fehlgeschlagen"])
      return false
    } finally {
      setSaving(false)
    }
  }

  function setExtra(key: string, patch: Partial<Extra>) {
    setExtras((xs) => xs.map((x) => (x.key === key ? { ...x, ...patch } : x)))
    setDirty(true)
  }

  function applyServices(next: Extra[]) {
    setExtras(next)
    setDirty(true)
  }

  const catalog = (services.data ?? []).filter(
    (x) => x.isActive && x.defaultPricingMode !== "hourly",
  )
  const hiddenDetails =
    extras.some((e) => e.discountType) ||
    initialLines.some((l) => l.itemType === "labor" && l !== main)

  const includedLabel = kind === "hourly" ? "Im Stundenpreis enthalten" : "Im Fixpreis enthalten"
  const capOk = costCapCents === null || !overCap

  return (
    <div className="pb-10">
      {/* Action bar (Bixin: Verwerfen · Speichern · Senden) */}
      <div className="border-surface-divider bg-surface-raised/95 sticky top-0 z-20 -mx-4 -mt-6 mb-6 flex flex-wrap items-center gap-x-3 gap-y-2 border-b px-4 py-3 backdrop-blur sm:-mx-6 sm:px-6 lg:-mx-8 lg:px-8">
        <Button variant="secondary" size="icon" aria-label="Zurück" onClick={() => router.back()}>
          <ArrowLeft className="h-4 w-4" />
        </Button>
        <h1 className="text-text-primary min-w-0 truncate text-[length:var(--text-display-md)] font-semibold">
          Offerte {quote.quoteNumber}
          {quote.version > 1 && (
            <span className="text-text-muted font-normal"> · Version {quote.version}</span>
          )}
        </h1>
        {!readOnly && (
          <div className="ml-auto flex flex-wrap items-center justify-end gap-2">
            <Button
              variant="ghost"
              size="sm"
              disabled={saving}
              onClick={async () => {
                if (dirty && !(await save())) return
                window.open(`/api/quotes/${quote.id}/preview`, "_blank", "noopener")
              }}
            >
              <Eye className="h-4 w-4" />
              <span className="hidden sm:inline">Vorschau</span>
            </Button>
            <Button variant="secondary" size="sm" onClick={() => setCancelOpen(true)}>
              Verwerfen
            </Button>
            <Button
              variant="secondary"
              size="sm"
              disabled={saving || !dirty}
              onClick={async () => {
                if (await save()) toast.success("Offerte gespeichert")
              }}
            >
              {saving ? "Speichern …" : dirty ? "Speichern" : "Gespeichert"}
            </Button>
            {permissions.send && (
              <Button
                size="sm"
                disabled={saving || !capOk}
                onClick={async () => {
                  if (!(await save({ reload: false }))) return
                  setSendOpen(true)
                }}
              >
                <Send className="h-4 w-4" />
                Senden
              </Button>
            )}
          </div>
        )}
      </div>

      <div className="mx-auto max-w-3xl space-y-5">
        {errors.length > 0 && (
          <div className="border-danger-600/30 bg-danger-100 rounded-[var(--radius-md)] border p-3">
            {errors.map((e) => (
              <FieldError key={e} message={e} />
            ))}
          </div>
        )}

        {/* Hauptservice */}
        <Section title="Hauptservice">
          <Row label="Kunde">
            <div className="flex min-w-0 items-center gap-3 text-sm sm:justify-end">
              <span className="text-text-primary min-w-0 truncate">
                {quote.customerName ?? "—"}
                {quote.customerEmail && (
                  <span className="text-text-muted"> · {quote.customerEmail}</span>
                )}
              </span>
              {quote.customerId && (
                <Link
                  href={`/customers/${quote.customerId}`}
                  className="text-signal-600 shrink-0 hover:underline"
                >
                  Öffnen
                </Link>
              )}
            </div>
          </Row>
          <Row label="Umzugsdatum">
            <Input
              type="date"
              disabled={readOnly}
              value={date}
              onChange={(e) => touch(setDate)(e.target.value)}
            />
          </Row>
          <Row label="Gültig bis">
            <Input
              type="date"
              disabled={readOnly}
              value={validUntil}
              onChange={(e) => touch(setValidUntil)(e.target.value)}
            />
          </Row>
        </Section>

        {/* Umzug */}
        <Section
          title="Umzug"
          badge={
            <span
              className={cn(
                "rounded-full px-2 py-0.5 text-xs font-medium",
                kind === "flat" ? "bg-signal-100 text-signal-700" : "bg-amber-100 text-amber-800",
              )}
            >
              {kind === "flat" ? "Fixpreis" : "Stundenpreis"}
            </span>
          }
          action={
            !readOnly && (
              <Button
                variant="secondary"
                size="sm"
                onClick={() => touch(setKind)(kind === "flat" ? "hourly" : "flat")}
              >
                {kind === "flat" ? "Stundenpreis eingeben" : "Fixpreis eingeben"}
              </Button>
            )
          }
        >
          <GridHead />
          {activeRates.length > 0 && (
            <GridRow label="Team / Tarif">
              <span />
              <Select
                aria-label="Team"
                disabled={readOnly}
                value={rateCardId}
                onChange={(e) => chooseTeam(e.target.value)}
              >
                <option value="">{teamName || "Wählen …"}</option>
                {activeRates.map((r) => (
                  <option key={r.id} value={r.id}>
                    {r.name} · {formatCents(r.hourlyRateCents)}/Std.
                  </option>
                ))}
              </Select>
            </GridRow>
          )}
          {kind === "hourly" ? (
            <>
              <GridRow label="Umzug pro Stunde (CHF)">
                <NumberInput
                  label="Stunden"
                  suffix="Std."
                  value={hours}
                  disabled={readOnly}
                  onChange={touch(setHours)}
                />
                <NumberInput
                  label="Stundenpreis"
                  suffix="CHF"
                  value={rate}
                  disabled={readOnly}
                  onChange={touch(setRate)}
                />
              </GridRow>
              <GridRow label="Kostendach">
                <span />
                <NumberInput
                  label="Kostendach"
                  suffix="CHF"
                  value={costCap}
                  disabled={readOnly}
                  onChange={touch(setCostCap)}
                />
              </GridRow>
            </>
          ) : (
            <>
              <GridRow label="Umzug (CHF)">
                <span />
                <NumberInput
                  label="Fixpreis"
                  suffix="CHF"
                  value={flatPrice}
                  disabled={readOnly}
                  onChange={touch(setFlatPrice)}
                />
              </GridRow>
              <GridRow label="Zeitaufwand (Stunden)">
                <NumberInput
                  label="Stunden"
                  suffix="Std."
                  value={hours}
                  disabled={readOnly}
                  onChange={touch(setHours)}
                />
                <span />
              </GridRow>
            </>
          )}
          <GridRow label="Anzahl Mitarbeiter">
            <NumberInput
              label="Mitarbeiter"
              value={crew}
              disabled={readOnly}
              onChange={touch(setCrew)}
            />
            <span />
          </GridRow>

          <div className="border-surface-divider mt-4 border-t pt-4">
            {extras.length > 0 && <GridHead title="Zusätzliche Services" />}
            {extras.map((e) => (
              <GridRow
                key={e.key}
                label={
                  <Input
                    aria-label="Leistung"
                    disabled={readOnly}
                    value={e.name}
                    placeholder="Eigene Leistung"
                    className="hover:border-surface-divider -ml-3 border-transparent bg-transparent shadow-none"
                    onChange={(ev) => setExtra(e.key, { name: ev.target.value })}
                  />
                }
                onRemove={
                  readOnly
                    ? undefined
                    : () => {
                        setExtras((xs) => xs.filter((x) => x.key !== e.key))
                        setDirty(true)
                      }
                }
              >
                {qtyMode(e.pricingMode) ? (
                  <NumberInput
                    label={`${e.name} Anzahl`}
                    suffix={e.unit}
                    value={e.quantity}
                    disabled={readOnly}
                    onChange={(v) => setExtra(e.key, { quantity: v })}
                  />
                ) : (
                  <span />
                )}
                <div>
                  <NumberInput
                    label={`${e.name} Preis`}
                    suffix="CHF"
                    value={e.included ? "" : e.price}
                    placeholder={e.included ? "inkl." : ""}
                    disabled={readOnly || e.included}
                    onChange={(v) => setExtra(e.key, { price: v })}
                  />
                  <label className="text-text-secondary mt-1 flex items-start gap-1.5 text-xs leading-tight">
                    <input
                      type="checkbox"
                      className="mt-0.5"
                      disabled={readOnly}
                      checked={e.included}
                      onChange={(ev) => setExtra(e.key, { included: ev.target.checked })}
                    />
                    {includedLabel}
                  </label>
                </div>
              </GridRow>
            ))}
            {!readOnly && (
              <button
                type="button"
                onClick={() => setServicesOpen(true)}
                className="text-signal-600 mt-1 text-sm hover:underline"
              >
                Services hinzufügen / anpassen
              </button>
            )}
          </div>

          <div className="border-text-primary mt-4 flex justify-between border-t pt-3 font-semibold">
            <span>Total Umzug</span>
            <span className="tabular-nums">CHF {formatCents(totals.netCents)}</span>
          </div>
        </Section>

        {/* Offerte */}
        <Section title="Offerte">
          <div className="text-text-muted mb-1 flex justify-between text-xs font-medium">
            <span>Service</span>
            <span>Preis</span>
          </div>
          <ul className="divide-surface-divider divide-y text-sm">
            {preview.map((l, i) => {
              const net = calcTotals([toCalc(l)], 0).netCents
              const included = i > 0 && l.unitPriceCents === 0
              return (
                <li key={i} className="flex justify-between gap-4 py-1.5">
                  <span className="text-text-primary min-w-0">
                    {l.name || "—"}
                    {l.description && !included && (
                      <span className="text-text-muted block text-xs">{l.description}</span>
                    )}
                  </span>
                  <span className="text-text-secondary text-right whitespace-nowrap tabular-nums">
                    {included ? (
                      <span className="text-text-muted">inklusive</span>
                    ) : l.pricingMode !== "manual" && l.quantity !== 1 ? (
                      <>
                        <span className="text-text-muted text-xs">
                          {formatCents(Number.isFinite(l.unitPriceCents) ? l.unitPriceCents : 0)} ×{" "}
                          {Number.isFinite(l.quantity) ? l.quantity : 0} {l.unit} ={" "}
                        </span>
                        CHF {formatCents(net)}
                      </>
                    ) : (
                      `CHF ${formatCents(net)}`
                    )}
                  </span>
                </li>
              )
            })}
          </ul>
          <dl className="border-surface-divider mt-2 space-y-1 border-t pt-2 text-sm">
            {totals.vatByRate.map((v) => (
              <Amount key={v.rate} label={`MWST ${v.rate} %`} cents={v.vatCents} muted />
            ))}
            <div className="text-text-primary flex justify-between text-base font-semibold">
              <dt>Total</dt>
              <dd className="tabular-nums">CHF {formatCents(totals.totalCents)}</dd>
            </div>
            {costCapCents !== null && <Amount label="Kostendach" cents={costCapCents} muted />}
            {totals.depositCents > 0 && (
              <Amount label={`Anzahlung ${depositPercent} %`} cents={totals.depositCents} muted />
            )}
          </dl>
          {overCap && costCapCents !== null && (
            <p className="bg-danger-100 text-danger-700 mt-3 flex gap-2 rounded-[var(--radius-md)] p-2 text-xs">
              <AlertTriangle className="h-4 w-4 shrink-0" />
              CHF {formatCents(totals.totalCents - costCapCents)} über dem Kostendach. So kann die
              Offerte nicht gesendet werden.
            </p>
          )}
          {hiddenDetails && (
            <p className="text-text-muted mt-2 text-xs">
              Enthält Rabatte oder Details aus der Detailansicht.
            </p>
          )}
        </Section>

        {/* Offertenkommentare */}
        <Section title="Offertenkommentare">
          <Textarea
            rows={4}
            maxLength={3000}
            disabled={readOnly}
            placeholder="Kommentar für den Kunden, z. B. Parkplatz ist reserviert."
            value={note}
            onChange={(e) => touch(setNote)(e.target.value)}
          />
          <p className="text-text-muted mt-1 text-right text-xs">{note.length}/3000</p>
        </Section>

        {/* Weitere Angaben — Bivro's extra freedom, folded away */}
        <div className="border-surface-divider bg-surface-raised rounded-[var(--radius-lg)] border">
          <button
            type="button"
            onClick={() => setMoreOpen((o) => !o)}
            className="text-text-secondary hover:text-text-primary flex w-full items-center justify-between px-5 py-3 text-sm font-medium"
          >
            Weitere Angaben (Adressen, Zimmer, Titel, Sprache, Anzahlung, interne Notiz)
            <ChevronDown className={cn("h-4 w-4 transition-transform", moreOpen && "rotate-180")} />
          </button>
          {moreOpen && (
            <div className="border-surface-divider space-y-4 border-t px-5 py-4">
              <div className="grid gap-4 md:grid-cols-2">
                <AddressFields
                  label="Von"
                  side={origin}
                  disabled={readOnly}
                  onChange={touch(setOrigin)}
                />
                <AddressFields
                  label="Nach"
                  side={dest}
                  disabled={readOnly}
                  onChange={touch(setDest)}
                />
              </div>
              <div className="grid gap-3 sm:grid-cols-3">
                <Field label="Zimmer">
                  <Input
                    inputMode="decimal"
                    placeholder="3.5"
                    disabled={readOnly}
                    value={rooms}
                    onChange={(e) => touch(setRooms)(e.target.value)}
                  />
                </Field>
                <Field label="Art">
                  <Select
                    disabled={readOnly}
                    value={moveType}
                    onChange={(e) => touch(setMoveType)(e.target.value as Quote["moveType"])}
                  >
                    {Object.entries(MOVE_TYPE_LABELS).map(([v, label]) => (
                      <option key={v} value={v}>
                        {label}
                      </option>
                    ))}
                  </Select>
                </Field>
                <Field label="Distanz km">
                  <Input
                    inputMode="decimal"
                    disabled={readOnly}
                    value={distanceKm}
                    onChange={(e) => touch(setDistanceKm)(e.target.value)}
                  />
                </Field>
                <Field label="Titel auf der Offerte" className="sm:col-span-3">
                  <Input
                    disabled={readOnly}
                    placeholder={rooms ? `Umzug ${rooms} Zimmer` : "Privatumzug"}
                    value={title}
                    onChange={(e) => touch(setTitle)(e.target.value)}
                  />
                </Field>
                <Field label="Sprache der Offerte">
                  <Select
                    disabled={readOnly}
                    value={language}
                    onChange={(e) => touch(setLanguage)(e.target.value as Quote["language"])}
                  >
                    {Object.entries(LANGUAGE_LABELS).map(([v, label]) => (
                      <option key={v} value={v}>
                        {label}
                      </option>
                    ))}
                  </Select>
                </Field>
                <Field label="Anzahlung %">
                  <Input
                    inputMode="decimal"
                    disabled={readOnly}
                    value={depositPercent}
                    onChange={(e) => touch(setDepositPercent)(e.target.value)}
                  />
                </Field>
                <Field label="Interne Notiz (nur für euch)" className="sm:col-span-3">
                  <Textarea
                    rows={2}
                    disabled={readOnly}
                    value={internalNotes}
                    onChange={(e) => touch(setInternalNotes)(e.target.value)}
                  />
                </Field>
              </div>
              {!readOnly && (
                <button
                  type="button"
                  onClick={async () => {
                    if (dirty && !(await save())) return
                    onDetailMode()
                  }}
                  className="text-signal-600 inline-flex items-center gap-1.5 text-sm hover:underline"
                >
                  <SlidersHorizontal className="h-4 w-4" />
                  Positionen im Detail bearbeiten (MWST, Rabatte, Einstandspreise)
                </button>
              )}
            </div>
          )}
        </div>
      </div>

      {servicesOpen && (
        <ServicesDialog
          catalog={catalog}
          extras={extras}
          defaultVat={defaultVat}
          onApply={applyServices}
          onClose={() => setServicesOpen(false)}
        />
      )}

      {sendOpen && (
        <SendDialog
          quoteId={quote.id}
          customerEmail={quote.customerEmail}
          totalCents={totals.totalCents}
          onClose={() => {
            setSendOpen(false)
            void utils.quotes.get.invalidate({ id: quote.id })
          }}
        />
      )}

      <ConfirmDialog
        open={cancelOpen}
        onOpenChange={setCancelOpen}
        title="Offerte verwerfen?"
        description="Der Entwurf bleibt zur Nachverfolgung erhalten, kann aber nicht mehr gesendet werden."
        confirmLabel="Verwerfen"
        onConfirm={async () => {
          try {
            await cancelMutation.mutateAsync({ id: quote.id })
            setDirty(false)
            await utils.quotes.invalidate()
            toast.success("Offerte verworfen")
            router.push("/quotes")
          } catch (err) {
            toast.error(err instanceof Error ? err.message : "Verwerfen fehlgeschlagen")
          }
        }}
      />
    </div>
  )
}

/** Choose catalog services (Bixin: "Services hinzufügen / anpassen") or add an own one. */
function ServicesDialog({
  catalog,
  extras,
  defaultVat,
  onApply,
  onClose,
}: {
  catalog: Service[]
  extras: Extra[]
  defaultVat: number
  onApply: (next: Extra[]) => void
  onClose: () => void
}) {
  const inExtras = (s: Service) =>
    extras.find(
      (e) =>
        e.serviceCatalogId === s.id || e.name.trim().toLowerCase() === s.name.trim().toLowerCase(),
    )
  const [checked, setChecked] = useState<Record<string, boolean>>(() =>
    Object.fromEntries([
      ...catalog.map((s) => [s.id, Boolean(inExtras(s))]),
      ...extras.filter((e) => !catalog.some((s) => inExtras(s) === e)).map((e) => [e.key, true]),
    ]),
  )
  const [qty, setQty] = useState<Record<string, string>>(() =>
    Object.fromEntries(catalog.map((s) => [s.id, inExtras(s)?.quantity ?? ""])),
  )
  const [customs, setCustoms] = useState<string[]>([])
  const [newName, setNewName] = useState("")
  const others = extras.filter((e) => !catalog.some((s) => inExtras(s) === e))

  function apply() {
    const next: Extra[] = []
    for (const s of catalog) {
      if (!checked[s.id]) continue
      const existing = inExtras(s)
      const quantity = qty[s.id]?.trim() || existing?.quantity || "1"
      next.push(existing ? { ...existing, quantity } : extraFromService(s, quantity))
    }
    for (const e of others) if (checked[e.key]) next.push(e)
    for (const name of customs) next.push(customExtra(name, defaultVat))
    onApply(next)
    onClose()
  }

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Services hinzufügen / anpassen</DialogTitle>
        </DialogHeader>
        <div className="max-h-[60vh] space-y-2 overflow-y-auto py-1">
          {catalog.length === 0 && others.length === 0 && (
            <p className="text-text-muted text-sm">
              Noch keine Services im Katalog. Lege sie unter Einstellungen → Leistungen an oder füge
              unten eine eigene Leistung hinzu.
            </p>
          )}
          {catalog.map((s) => (
            <div key={s.id}>
              <label className="text-text-primary flex items-center gap-2 text-sm">
                <input
                  type="checkbox"
                  checked={checked[s.id] ?? false}
                  onChange={(e) => setChecked((c) => ({ ...c, [s.id]: e.target.checked }))}
                />
                {s.name}
                <span className="text-text-muted ml-auto text-xs tabular-nums">
                  {formatCents(s.defaultUnitPriceCents)}
                  {s.defaultUnitLabel ? ` / ${s.defaultUnitLabel}` : ""}
                </span>
              </label>
              {checked[s.id] && qtyMode(s.defaultPricingMode) && (
                <Input
                  aria-label={`${s.name} Anzahl`}
                  inputMode="decimal"
                  placeholder="Anzahl"
                  className="mt-1 ml-6 h-8 w-24"
                  value={qty[s.id] ?? ""}
                  onChange={(e) => setQty((q) => ({ ...q, [s.id]: e.target.value }))}
                />
              )}
            </div>
          ))}
          {others.map((e) => (
            <label key={e.key} className="text-text-primary flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                checked={checked[e.key] ?? false}
                onChange={(ev) => setChecked((c) => ({ ...c, [e.key]: ev.target.checked }))}
              />
              {e.name || "Eigene Leistung"}
            </label>
          ))}
          {customs.map((name, i) => (
            <p key={i} className="text-text-primary flex items-center gap-2 text-sm">
              <Plus className="text-signal-600 h-4 w-4" />
              {name}
            </p>
          ))}
          <div className="border-surface-divider flex gap-2 border-t pt-3">
            <Input
              placeholder="Neue Dienstleistung, z. B. Klavier tragen"
              value={newName}
              onChange={(e) => setNewName(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && newName.trim()) {
                  e.preventDefault()
                  setCustoms((c) => [...c, newName.trim()])
                  setNewName("")
                }
              }}
            />
            <Button
              variant="secondary"
              disabled={!newName.trim()}
              onClick={() => {
                setCustoms((c) => [...c, newName.trim()])
                setNewName("")
              }}
            >
              <Plus className="h-4 w-4" />
              Hinzufügen
            </Button>
          </div>
        </div>
        <DialogFooter>
          <Button variant="secondary" onClick={onClose}>
            Abbrechen
          </Button>
          <Button onClick={apply}>Speichern</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

/** A Bixin card: title (with optional badge) and an action on the right. */
function Section({
  title,
  badge,
  action,
  children,
}: {
  title: string
  badge?: React.ReactNode
  action?: React.ReactNode
  children: React.ReactNode
}) {
  return (
    <section className="border-surface-divider bg-surface-raised rounded-[var(--radius-lg)] border px-5 py-4">
      <div className="mb-3 flex flex-wrap items-center gap-2">
        <h2 className="text-text-primary text-base font-semibold">{title}</h2>
        {badge}
        {action && <div className="ml-auto">{action}</div>}
      </div>
      {children}
    </section>
  )
}

/** Label on the left, field on the right. */
function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="grid items-center gap-2 py-1.5 sm:grid-cols-[180px_minmax(0,1fr)]">
      <span className="text-text-secondary text-sm">{label}</span>
      {children}
    </div>
  )
}

const GRID =
  "grid grid-cols-[minmax(0,1fr)_76px_100px_20px] items-start gap-2 sm:grid-cols-[minmax(0,1fr)_96px_128px_28px] sm:gap-3"

function GridHead({ title = "Service" }: { title?: string }) {
  return (
    <div className={cn(GRID, "text-text-muted mb-1 text-xs font-medium")}>
      <span>{title}</span>
      <span className="text-right">Anzahl</span>
      <span className="text-right">Preis</span>
      <span />
    </div>
  )
}

function GridRow({
  label,
  onRemove,
  children,
}: {
  label: React.ReactNode
  onRemove?: (() => void) | undefined
  children: React.ReactNode
}) {
  return (
    <div className={cn(GRID, "py-1.5")}>
      <div className="text-text-primary min-w-0 text-sm [&>span]:block [&>span]:pt-2">
        {typeof label === "string" ? <span>{label}</span> : label}
      </div>
      {children}
      {onRemove ? (
        <button
          type="button"
          aria-label="Entfernen"
          className="text-text-muted hover:text-danger-700 pt-2"
          onClick={onRemove}
        >
          <Trash2 className="h-4 w-4" />
        </button>
      ) : (
        <span />
      )}
    </div>
  )
}

function NumberInput({
  label,
  suffix,
  value,
  placeholder,
  disabled,
  onChange,
}: {
  label: string
  suffix?: string
  value: string
  placeholder?: string
  disabled: boolean
  onChange: (v: string) => void
}) {
  return (
    <div className="relative">
      <Input
        aria-label={label}
        inputMode="decimal"
        className={cn("text-right", suffix && "pr-11")}
        disabled={disabled}
        value={value}
        placeholder={placeholder}
        onChange={(e) => onChange(e.target.value)}
      />
      {suffix && (
        <span className="text-text-muted pointer-events-none absolute top-1/2 right-2.5 -translate-y-1/2 text-xs">
          {suffix}
        </span>
      )}
    </div>
  )
}

function Field({
  label,
  hint,
  className,
  children,
}: {
  label: string
  hint?: string
  className?: string
  children: React.ReactNode
}) {
  return (
    <label className={cn("block", className)}>
      <span className="text-text-secondary mb-1 block text-xs font-medium">
        {label}
        {hint && <span className="text-text-muted font-normal"> · {hint}</span>}
      </span>
      {children}
    </label>
  )
}

function AddressFields({
  label,
  side,
  disabled,
  onChange,
}: {
  label: string
  side: Side
  disabled: boolean
  onChange: (side: Side) => void
}) {
  const set = (patch: Partial<Side>) => onChange({ ...side, ...patch })
  return (
    <div className="space-y-2">
      <p className="text-text-primary text-xs font-semibold tracking-wide uppercase">{label}</p>
      <Input
        aria-label={`${label} Strasse`}
        placeholder="Strasse und Nr."
        disabled={disabled}
        value={side.street}
        onChange={(e) => set({ street: e.target.value })}
      />
      <div className="grid grid-cols-[90px_minmax(0,1fr)] gap-2">
        <Input
          aria-label={`${label} PLZ`}
          placeholder="PLZ"
          disabled={disabled}
          value={side.postal}
          onChange={(e) => set({ postal: e.target.value })}
        />
        <Input
          aria-label={`${label} Ort`}
          placeholder="Ort"
          disabled={disabled}
          value={side.city}
          onChange={(e) => set({ city: e.target.value })}
        />
      </div>
      <div className="flex items-center gap-3">
        <Select
          aria-label={`${label} Stockwerk`}
          className="w-40"
          disabled={disabled}
          value={side.floor}
          onChange={(e) => set({ floor: e.target.value })}
        >
          <option value="">Stockwerk …</option>
          <option value="-1">Untergeschoss</option>
          <option value="0">Erdgeschoss</option>
          {Array.from({ length: 12 }, (_, i) => i + 1).map((f) => (
            <option key={f} value={String(f)}>
              {f}. Stock
            </option>
          ))}
        </Select>
        <label className="text-text-secondary flex items-center gap-1.5 text-sm">
          <input
            type="checkbox"
            disabled={disabled}
            checked={side.lift}
            onChange={(e) => set({ lift: e.target.checked })}
          />
          Lift
        </label>
      </div>
    </div>
  )
}

function Amount({ label, cents, muted }: { label: string; cents: number; muted?: boolean }) {
  return (
    <div
      className={cn(
        "flex justify-between gap-3",
        muted ? "text-text-muted" : "text-text-secondary",
      )}
    >
      <dt>{label}</dt>
      <dd className="whitespace-nowrap tabular-nums">{formatCents(cents)}</dd>
    </div>
  )
}
