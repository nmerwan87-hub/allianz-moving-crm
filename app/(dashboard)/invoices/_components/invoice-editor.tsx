"use client"

import { useMemo, useState } from "react"
import Link from "next/link"
import { useRouter } from "next/navigation"
import { AlertTriangle, Eye, Plus, Receipt, Save, Trash2, X } from "lucide-react"
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
  FieldHint,
} from "@/app/(dashboard)/_components/ui/field"
import { ConfirmDialog } from "@/app/(dashboard)/_components/ui/confirm-dialog"
import { useToast } from "@/app/(dashboard)/_components/ui/toast"
import { useUnsavedChangesGuard } from "@/app/(dashboard)/_lib/active-company"
import type { Invoice, InvoiceLine } from "@/modules/invoices/interface"
import { LANGUAGE_LABELS, PRICING_MODE_LABELS } from "../../quotes/_lib/labels"
import { IssueDialog } from "./issue-dialog"

type PricingMode = InvoiceLine["pricingMode"]

interface DraftLine {
  key: string
  quoteItemId: string | null
  serviceCatalogId: string | null
  itemType: InvoiceLine["itemType"]
  name: string
  description: string
  pricingMode: PricingMode
  quantity: string
  quotedQuantity: number | null
  unit: string
  price: string
  discountType: "" | "percent" | "fixed"
  discountValue: string
  vat: string
}

let lineCounter = 0
const newKey = () => `inv-line-${++lineCounter}`

function num(value: string): number {
  const n = Number(value.replace(",", ".").replace(/['’\s]/g, ""))
  return Number.isFinite(n) ? n : NaN
}

function toDraftLine(l: InvoiceLine): DraftLine {
  return {
    key: newKey(),
    quoteItemId: l.quoteItemId,
    serviceCatalogId: l.serviceCatalogId,
    itemType: l.itemType,
    name: l.name,
    description: l.description ?? "",
    pricingMode: l.pricingMode,
    quantity: String(l.quantity),
    quotedQuantity: l.quotedQuantity,
    unit: l.unit ?? "",
    price: formatCents(l.unitPriceCents),
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
  language: Invoice["language"]
  serviceDate: string
  paymentTermsDays: string
  costCapOverrideReason: string
  notes: string
  internalNotes: string
}

function toHeader(i: Invoice): HeaderForm {
  return {
    title: i.title ?? "",
    language: i.language,
    serviceDate: i.serviceDate ?? "",
    paymentTermsDays: String(i.paymentTermsDays),
    costCapOverrideReason: i.costCapOverrideReason ?? "",
    notes: i.notes ?? "",
    internalNotes: i.internalNotes ?? "",
  }
}

/**
 * Final settlement (Schlussabrechnung): the accepted quote's lines with the
 * actual quantities, extras added, checked against the cost cap, then issued
 * as an invoice with QR-bill.
 */
export function InvoiceEditor({
  invoice,
  lines: initialLines,
  missingPaymentData,
  permissions,
}: {
  invoice: Invoice
  lines: InvoiceLine[]
  missingPaymentData: string[]
  permissions: { edit: boolean; applyDiscount: boolean }
}) {
  const router = useRouter()
  const toast = useToast()
  const utils = trpc.useUtils()
  const services = trpc.catalog.services.list.useQuery()
  const updateMutation = trpc.invoices.update.useMutation()
  const saveLinesMutation = trpc.invoices.saveLines.useMutation()
  const discardMutation = trpc.invoices.discardDraft.useMutation()

  const [header, setHeader] = useState(() => toHeader(invoice))
  const [lines, setLines] = useState<DraftLine[]>(() => initialLines.map(toDraftLine))
  const [dirty, setDirty] = useState(false)
  const [errors, setErrors] = useState<string[]>([])
  const [saving, setSaving] = useState(false)
  const [issueOpen, setIssueOpen] = useState(false)
  const [discardOpen, setDiscardOpen] = useState(false)
  const [expanded, setExpanded] = useState<string | null>(null)
  useUnsavedChangesGuard(dirty)

  const readOnly = !permissions.edit
  const totals = useMemo(() => calcTotals(lines.map(toCalc), 0), [lines])
  const amountDue = totals.totalCents - invoice.depositAppliedCents
  const overCap = invoice.costCapCents !== null && totals.totalCents > invoice.costCapCents
  const overCapWithoutReason = overCap && !header.costCapOverrideReason.trim()

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
      quoteItemId: null,
      serviceCatalogId: s.id,
      itemType: s.defaultPricingMode === "hourly" ? "labor" : "other",
      name: s.name,
      description: s.customerDescription ?? "",
      pricingMode: s.defaultPricingMode,
      quantity: "1",
      quotedQuantity: null,
      unit: s.defaultUnitLabel ?? "",
      price: formatCents(s.defaultUnitPriceCents),
      discountType: "",
      discountValue: "",
      vat: String(s.defaultVatRatePercent),
    })
  }

  async function save(): Promise<boolean> {
    const problems: string[] = []
    const terms = Math.trunc(num(header.paymentTermsDays))
    if (!(terms >= 0 && terms <= 365)) problems.push("Zahlungsfrist: 0 bis 365 Tage.")
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
        quoteItemId: l.quoteItemId,
        serviceCatalogId: l.serviceCatalogId,
        itemType: l.itemType,
        name: l.name.trim(),
        description: l.description,
        pricingMode: l.pricingMode,
        quantity,
        quotedQuantity: l.quotedQuantity,
        unit: l.unit,
        unitPriceCents: price ?? 0,
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
        id: invoice.id,
        title: header.title,
        language: header.language,
        serviceDate: header.serviceDate || null,
        paymentTermsDays: terms,
        costCapOverrideReason: header.costCapOverrideReason,
        notes: header.notes,
        internalNotes: header.internalNotes,
      })
      await saveLinesMutation.mutateAsync({ id: invoice.id, lines: payload })
      await utils.invoices.get.invalidate({ id: invoice.id })
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
    window.open(`/api/invoices/${invoice.id}/preview`, "_blank", "noopener")
  }

  const field = (key: keyof HeaderForm) => ({
    id: `inv-${key}`,
    value: header[key] as string,
    disabled: readOnly,
    onChange: (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) =>
      setH(key, e.target.value as never),
  })

  return (
    <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_280px]">
      <div className="min-w-0 space-y-6">
        {missingPaymentData.length > 0 && (
          <div className="border-warning-600/40 bg-warning-100 text-warning-700 flex gap-2 rounded-[var(--radius-md)] border p-3 text-sm">
            <AlertTriangle className="h-4 w-4 shrink-0" />
            <span>
              Für die QR-Rechnung fehlen in den Firmendaten: {missingPaymentData.join(", ")}.{" "}
              <Link href="/settings/company" className="font-medium underline">
                Firmendaten ergänzen
              </Link>
            </span>
          </div>
        )}

        <Card className="overflow-hidden p-0">
          <div className="flex flex-wrap items-center justify-between gap-2 pr-4">
            <CardHeader>Leistungen</CardHeader>
            {!readOnly && (
              <div className="flex flex-wrap gap-2 py-2 pl-4">
                <Select
                  aria-label="Zusatzleistung aus Katalog hinzufügen"
                  className="h-8 w-48 text-xs"
                  value=""
                  onChange={(e) => addFromService(e.target.value)}
                >
                  <option value="">+ Zusatz aus Katalog …</option>
                  {(services.data ?? [])
                    .filter((s) => s.isActive)
                    .map((s) => (
                      <option key={s.id} value={s.id}>
                        {s.name}
                      </option>
                    ))}
                </Select>
                <Button
                  size="sm"
                  variant="secondary"
                  onClick={() =>
                    addLine({
                      quoteItemId: null,
                      serviceCatalogId: null,
                      itemType: "other",
                      name: "",
                      description: "",
                      pricingMode: "fixed",
                      quantity: "1",
                      quotedQuantity: null,
                      unit: "",
                      price: "",
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
              Noch keine Positionen. Dieser Auftrag hat keine angenommene Offerte — erfasse die
              erbrachten Leistungen.
            </p>
          ) : (
            <ul className="divide-surface-divider border-surface-divider divide-y border-t">
              {lines.map((l, index) => {
                const result = calcLine(toCalc(l))
                const changed =
                  l.quotedQuantity !== null &&
                  l.pricingMode !== "manual" &&
                  num(l.quantity) !== l.quotedQuantity
                return (
                  <li key={l.key} className="px-4 py-3">
                    <div className="flex items-center gap-2">
                      <span className="text-text-muted w-5 shrink-0 text-xs">{index + 1}</span>
                      <Input
                        aria-label={`Position ${index + 1} Name`}
                        value={l.name}
                        disabled={readOnly}
                        placeholder="Leistung"
                        className="flex-1"
                        onChange={(e) => setLine(l.key, { name: e.target.value })}
                      />
                      <span className="text-text-primary w-28 shrink-0 text-right text-sm font-semibold tabular-nums">
                        {formatCents(result.netCents)}
                      </span>
                      {!readOnly && (
                        <Button
                          variant="ghost"
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
                    <div className="mt-2 flex flex-wrap items-center gap-2 pl-7 text-sm">
                      {l.pricingMode !== "manual" ? (
                        <>
                          <Input
                            aria-label={`Position ${index + 1} Menge`}
                            inputMode="decimal"
                            value={l.quantity}
                            disabled={readOnly}
                            className="h-8 w-20 text-right"
                            onChange={(e) => setLine(l.key, { quantity: e.target.value })}
                          />
                          <Input
                            aria-label={`Position ${index + 1} Einheit`}
                            value={l.unit}
                            disabled={readOnly}
                            placeholder="Einheit"
                            className="h-8 w-20"
                            onChange={(e) => setLine(l.key, { unit: e.target.value })}
                          />
                          <span className="text-text-muted">× CHF</span>
                          <Input
                            aria-label={`Position ${index + 1} Preis`}
                            inputMode="decimal"
                            value={l.price}
                            disabled={readOnly}
                            className="h-8 w-28 text-right"
                            onChange={(e) => setLine(l.key, { price: e.target.value })}
                          />
                        </>
                      ) : (
                        <>
                          <span className="text-text-muted">Betrag CHF</span>
                          <Input
                            aria-label={`Position ${index + 1} Preis`}
                            inputMode="decimal"
                            value={l.price}
                            disabled={readOnly}
                            className="h-8 w-28 text-right"
                            onChange={(e) => setLine(l.key, { price: e.target.value })}
                          />
                        </>
                      )}
                      {l.quotedQuantity !== null && l.pricingMode !== "manual" && (
                        <span
                          className={
                            changed ? "text-warning-700 text-xs" : "text-text-muted text-xs"
                          }
                        >
                          offeriert {l.quotedQuantity} {l.unit}
                        </span>
                      )}
                      {result.discountCents > 0 && (
                        <span className="text-text-muted text-xs">
                          Rabatt −{formatCents(result.discountCents)}
                        </span>
                      )}
                      <button
                        type="button"
                        className="text-signal-600 ml-auto text-xs hover:underline"
                        onClick={() => setExpanded((k) => (k === l.key ? null : l.key))}
                      >
                        {expanded === l.key ? "Weniger" : "Details"}
                      </button>
                    </div>
                    {expanded !== l.key && l.description && (
                      <p className="text-text-muted mt-1 pl-7 text-xs">{l.description}</p>
                    )}
                    {expanded === l.key && (
                      <div className="bg-surface-sunken mt-2 ml-7 grid gap-2 rounded-[var(--radius-md)] p-3 sm:grid-cols-3">
                        <div className="sm:col-span-3">
                          <FieldLabel htmlFor={`${l.key}-desc`}>
                            Beschreibung auf der Rechnung
                          </FieldLabel>
                          <Input
                            id={`${l.key}-desc`}
                            value={l.description}
                            disabled={readOnly}
                            onChange={(e) => setLine(l.key, { description: e.target.value })}
                          />
                        </div>
                        <div>
                          <FieldLabel htmlFor={`${l.key}-mode`}>Preisart</FieldLabel>
                          <Select
                            id={`${l.key}-mode`}
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
                        </div>
                        <div>
                          <FieldLabel htmlFor={`${l.key}-disc`}>Rabatt</FieldLabel>
                          <div className="flex gap-1">
                            <Select
                              id={`${l.key}-disc`}
                              value={l.discountType}
                              disabled={readOnly || !permissions.applyDiscount}
                              className="w-24 shrink-0"
                              onChange={(e) =>
                                setLine(l.key, {
                                  discountType: e.target.value as DraftLine["discountType"],
                                })
                              }
                            >
                              <option value="">Keiner</option>
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
                        </div>
                        <div>
                          <FieldLabel htmlFor={`${l.key}-vat`}>MWST %</FieldLabel>
                          <Input
                            id={`${l.key}-vat`}
                            inputMode="decimal"
                            value={l.vat}
                            disabled={readOnly}
                            onChange={(e) => setLine(l.key, { vat: e.target.value })}
                          />
                        </div>
                      </div>
                    )}
                  </li>
                )
              })}
            </ul>
          )}
        </Card>

        <Card>
          <CardHeader>Rechnung</CardHeader>
          <CardContent className="grid gap-4 sm:grid-cols-6">
            <div className="sm:col-span-4">
              <FieldLabel htmlFor="inv-title">Titel auf der Rechnung</FieldLabel>
              <Input placeholder="z. B. Privatumzug 3.5 Zimmer" {...field("title")} />
            </div>
            <div className="sm:col-span-2">
              <FieldLabel htmlFor="inv-language">Sprache</FieldLabel>
              <Select {...field("language")}>
                {Object.entries(LANGUAGE_LABELS).map(([v, label]) => (
                  <option key={v} value={v}>
                    {label}
                  </option>
                ))}
              </Select>
            </div>
            <div className="sm:col-span-3">
              <FieldLabel htmlFor="inv-serviceDate">Leistungsdatum</FieldLabel>
              <Input type="date" {...field("serviceDate")} />
            </div>
            <div className="sm:col-span-3">
              <FieldLabel htmlFor="inv-paymentTermsDays">Zahlungsfrist (Tage)</FieldLabel>
              <Input inputMode="numeric" {...field("paymentTermsDays")} />
            </div>
            <div className="sm:col-span-3">
              <FieldLabel htmlFor="inv-notes">Bemerkung auf der Rechnung</FieldLabel>
              <Textarea rows={3} {...field("notes")} />
            </div>
            <div className="sm:col-span-3">
              <FieldLabel htmlFor="inv-internalNotes">Interne Notiz</FieldLabel>
              <Textarea rows={3} {...field("internalNotes")} />
            </div>
          </CardContent>
        </Card>
      </div>

      <div className="space-y-4 lg:sticky lg:top-4 lg:self-start">
        <Card>
          <CardHeader>Abrechnung</CardHeader>
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
            {invoice.depositAppliedCents > 0 && (
              <>
                <Row
                  label="Erhaltene Anzahlung"
                  value={`−${formatChf(invoice.depositAppliedCents)}`}
                  muted
                />
                <Row label="Zu bezahlen" value={formatChf(amountDue)} strong />
              </>
            )}
            {invoice.costCapCents !== null && (
              <div className="border-surface-divider mt-2 border-t pt-2">
                <Row label="Kostendach" value={formatChf(invoice.costCapCents)} muted />
                {!overCap && (
                  <p className="text-success-700 text-xs">
                    Unter dem Kostendach (noch {formatChf(invoice.costCapCents - totals.totalCents)}{" "}
                    Spielraum).
                  </p>
                )}
              </div>
            )}
            {overCap && (
              <div className="bg-danger-100 text-danger-700 mt-2 space-y-2 rounded-[var(--radius-md)] p-2 text-xs">
                <p className="flex gap-2">
                  <AlertTriangle className="h-4 w-4 shrink-0" />
                  Total liegt {formatChf(totals.totalCents - (invoice.costCapCents ?? 0))} über dem
                  vereinbarten Kostendach. Positionen anpassen oder Grund angeben (z. B. Mehraufwand
                  auf Wunsch des Kunden).
                </p>
                <Textarea
                  aria-label="Grund für die Überschreitung des Kostendachs"
                  rows={2}
                  disabled={readOnly}
                  value={header.costCapOverrideReason}
                  onChange={(e) => setH("costCapOverrideReason", e.target.value)}
                />
                <FieldHint>Wird im Verlauf festgehalten.</FieldHint>
              </div>
            )}
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
              {saving ? "Speichern …" : dirty ? "Abrechnung speichern" : "Gespeichert"}
            </Button>
            <Button
              variant="secondary"
              onClick={preview}
              disabled={saving || missingPaymentData.length > 0}
            >
              <Eye className="h-4 w-4" />
              Vorschau PDF
            </Button>
            <Button
              variant="secondary"
              disabled={
                saving ||
                lines.length === 0 ||
                overCapWithoutReason ||
                missingPaymentData.length > 0
              }
              onClick={async () => {
                if (dirty && !(await save())) return
                setIssueOpen(true)
              }}
            >
              <Receipt className="h-4 w-4" />
              Rechnung ausstellen
            </Button>
            <Button variant="dangerGhost" onClick={() => setDiscardOpen(true)}>
              <X className="h-4 w-4" />
              Entwurf verwerfen
            </Button>
          </div>
        )}
        {dirty && <Badge variant="warning">Ungespeicherte Änderungen</Badge>}
      </div>

      {issueOpen && (
        <IssueDialog
          invoiceId={invoice.id}
          customerEmail={invoice.customerEmail}
          amountCents={amountDue}
          mode="issue"
          onClose={() => setIssueOpen(false)}
        />
      )}

      <ConfirmDialog
        open={discardOpen}
        onOpenChange={setDiscardOpen}
        title="Abrechnungsentwurf verwerfen?"
        description="Der Auftrag kann danach neu abgerechnet werden. Es wurde noch nichts ausgestellt."
        confirmLabel="Verwerfen"
        onConfirm={async () => {
          try {
            await discardMutation.mutateAsync({ id: invoice.id })
            setDirty(false)
            await Promise.all([utils.invoices.invalidate(), utils.jobs.invalidate()])
            toast.success("Entwurf verworfen")
            router.push(`/jobs/${invoice.jobId}`)
          } catch (err) {
            toast.error(err instanceof Error ? err.message : "Verwerfen fehlgeschlagen")
          }
        }}
      />
    </div>
  )
}

export function Row({
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
