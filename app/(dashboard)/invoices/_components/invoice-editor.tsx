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
    if (!(terms >= 0 && terms <= 365)) problems.push("Payment terms: 0 to 365 days.")
    const payload = lines.map((l, i) => {
      const quantity = l.pricingMode === "manual" ? 1 : num(l.quantity)
      const price = parseToCents(l.price)
      if (!l.name.trim()) problems.push(`Line ${i + 1}: name is missing.`)
      if (!(quantity > 0)) problems.push(`Line ${i + 1}: quantity must be greater than zero.`)
      if (price === null) problems.push(`Line ${i + 1}: enter a price like 150 or 1'250.50.`)
      const vat = num(l.vat)
      if (!(vat >= 0 && vat <= 100)) problems.push(`Line ${i + 1}: VAT must be between 0 and 100.`)
      const discountValue = l.discountType
        ? l.discountType === "fixed"
          ? (parseToCents(l.discountValue) ?? NaN) / 100
          : num(l.discountValue)
        : null
      if (l.discountType && !(Number(discountValue) >= 0))
        problems.push(`Line ${i + 1}: check the discount.`)
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
      setErrors([err instanceof Error ? err.message : "Failed to save"])
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
    <div className="grid gap-6 xl:grid-cols-[1fr_320px]">
      <div className="min-w-0 space-y-6">
        {missingPaymentData.length > 0 && (
          <div className="border-warning-600/40 bg-warning-100 text-warning-700 flex gap-2 rounded-[var(--radius-md)] border p-3 text-sm">
            <AlertTriangle className="h-4 w-4 shrink-0" />
            <span>
              The QR-bill needs your company&apos;s {missingPaymentData.join(", ")}.{" "}
              <Link href="/settings/company" className="font-medium underline">
                Complete company settings
              </Link>
            </span>
          </div>
        )}

        <Card className="overflow-hidden p-0">
          <div className="flex flex-wrap items-center justify-between gap-2 pr-4">
            <CardHeader>Services (actual)</CardHeader>
            {!readOnly && (
              <div className="flex flex-wrap gap-2 py-2 pl-4">
                <Select
                  aria-label="Add extra service from catalog"
                  className="h-8 w-48 text-xs"
                  value=""
                  onChange={(e) => addFromService(e.target.value)}
                >
                  <option value="">+ Extra from catalog…</option>
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
                  Custom line
                </Button>
              </div>
            )}
          </div>

          {lines.length === 0 ? (
            <p className="text-text-muted border-surface-divider border-t px-4 py-6 text-sm">
              No lines yet. This job has no accepted quote — add the services performed.
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
                  <li key={l.key} className="grid gap-2 px-4 py-3">
                    <div className="flex items-start gap-2">
                      <span className="text-text-muted w-5 pt-2 text-xs">{index + 1}</span>
                      <div className="flex-1 space-y-1.5">
                        <Input
                          aria-label={`Line ${index + 1} name`}
                          value={l.name}
                          disabled={readOnly}
                          placeholder="Service"
                          onChange={(e) => setLine(l.key, { name: e.target.value })}
                        />
                        <Input
                          aria-label={`Line ${index + 1} description`}
                          value={l.description}
                          disabled={readOnly}
                          placeholder="Description on the invoice (optional)"
                          className="h-8 text-xs"
                          onChange={(e) => setLine(l.key, { description: e.target.value })}
                        />
                      </div>
                      {!readOnly && (
                        <Button
                          variant="dangerGhost"
                          size="icon"
                          aria-label={`Remove line ${index + 1}`}
                          onClick={() => {
                            setLines((ls) => ls.filter((x) => x.key !== l.key))
                            setDirty(true)
                          }}
                        >
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      )}
                    </div>
                    <div className="grid grid-cols-2 gap-2 pl-7 md:grid-cols-12">
                      <Select
                        aria-label={`Line ${index + 1} pricing`}
                        className="md:col-span-2"
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
                        <div className="md:col-span-3">
                          <div className="flex gap-1">
                            <Input
                              aria-label={`Line ${index + 1} quantity`}
                              inputMode="decimal"
                              value={l.quantity}
                              disabled={readOnly}
                              onChange={(e) => setLine(l.key, { quantity: e.target.value })}
                            />
                            <Input
                              aria-label={`Line ${index + 1} unit`}
                              value={l.unit}
                              disabled={readOnly}
                              placeholder="Unit"
                              className="w-20"
                              onChange={(e) => setLine(l.key, { unit: e.target.value })}
                            />
                          </div>
                          {l.quotedQuantity !== null && (
                            <p
                              className={`mt-0.5 text-xs ${changed ? "text-warning-700" : "text-text-muted"}`}
                            >
                              Quoted: {l.quotedQuantity} {l.unit}
                            </p>
                          )}
                        </div>
                      ) : (
                        <div className="md:col-span-3" />
                      )}
                      <Input
                        aria-label={`Line ${index + 1} price`}
                        className="md:col-span-2"
                        inputMode="decimal"
                        value={l.price}
                        disabled={readOnly}
                        placeholder={l.pricingMode === "manual" ? "Amount CHF" : "Price CHF"}
                        onChange={(e) => setLine(l.key, { price: e.target.value })}
                      />
                      <div className="flex gap-1 md:col-span-2">
                        <Select
                          aria-label={`Line ${index + 1} discount type`}
                          value={l.discountType}
                          disabled={readOnly || !permissions.applyDiscount}
                          className="w-24 shrink-0"
                          onChange={(e) =>
                            setLine(l.key, {
                              discountType: e.target.value as DraftLine["discountType"],
                            })
                          }
                        >
                          <option value="">No discount</option>
                          <option value="percent">%</option>
                          <option value="fixed">CHF</option>
                        </Select>
                        {l.discountType && (
                          <Input
                            aria-label={`Line ${index + 1} discount`}
                            inputMode="decimal"
                            value={l.discountValue}
                            disabled={readOnly || !permissions.applyDiscount}
                            onChange={(e) => setLine(l.key, { discountValue: e.target.value })}
                          />
                        )}
                      </div>
                      <div className="flex items-center gap-1 md:col-span-3">
                        <Input
                          aria-label={`Line ${index + 1} VAT`}
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
          <CardHeader>Invoice</CardHeader>
          <CardContent className="grid gap-4 sm:grid-cols-6">
            <div className="sm:col-span-4">
              <FieldLabel htmlFor="inv-title">Title on the invoice</FieldLabel>
              <Input placeholder="e.g. Privatumzug 3.5 Zimmer" {...field("title")} />
            </div>
            <div className="sm:col-span-2">
              <FieldLabel htmlFor="inv-language">Language</FieldLabel>
              <Select {...field("language")}>
                {Object.entries(LANGUAGE_LABELS).map(([v, label]) => (
                  <option key={v} value={v}>
                    {label}
                  </option>
                ))}
              </Select>
            </div>
            <div className="sm:col-span-3">
              <FieldLabel htmlFor="inv-serviceDate">Date of service</FieldLabel>
              <Input type="date" {...field("serviceDate")} />
            </div>
            <div className="sm:col-span-3">
              <FieldLabel htmlFor="inv-paymentTermsDays">Payment terms (days)</FieldLabel>
              <Input inputMode="numeric" {...field("paymentTermsDays")} />
            </div>
            <div className="sm:col-span-3">
              <FieldLabel htmlFor="inv-notes">Notes on the invoice</FieldLabel>
              <Textarea rows={3} {...field("notes")} />
            </div>
            <div className="sm:col-span-3">
              <FieldLabel htmlFor="inv-internalNotes">Internal notes</FieldLabel>
              <Textarea rows={3} {...field("internalNotes")} />
            </div>
          </CardContent>
        </Card>
      </div>

      <div className="space-y-4 xl:sticky xl:top-4 xl:self-start">
        <Card>
          <CardHeader>Settlement</CardHeader>
          <CardContent className="space-y-2 text-sm">
            <Row label="Subtotal" value={formatChf(totals.netCents)} />
            {totals.discountCents > 0 && (
              <Row label="incl. discounts" value={`−${formatChf(totals.discountCents)}`} muted />
            )}
            {totals.vatByRate.map((v) => (
              <Row key={v.rate} label={`VAT ${v.rate}%`} value={formatChf(v.vatCents)} />
            ))}
            <div className="border-text-primary border-t pt-2">
              <Row label="Total" value={formatChf(totals.totalCents)} strong />
            </div>
            {invoice.depositAppliedCents > 0 && (
              <>
                <Row
                  label="Deposit received"
                  value={`−${formatChf(invoice.depositAppliedCents)}`}
                  muted
                />
                <Row label="Amount due" value={formatChf(amountDue)} strong />
              </>
            )}
            {invoice.costCapCents !== null && (
              <div className="border-surface-divider mt-2 border-t pt-2">
                <Row label="Cost cap" value={formatChf(invoice.costCapCents)} muted />
                {!overCap && (
                  <p className="text-success-700 text-xs">
                    Within the cost cap ({formatChf(invoice.costCapCents - totals.totalCents)}{" "}
                    left).
                  </p>
                )}
              </div>
            )}
            {overCap && (
              <div className="bg-danger-100 text-danger-700 mt-2 space-y-2 rounded-[var(--radius-md)] p-2 text-xs">
                <p className="flex gap-2">
                  <AlertTriangle className="h-4 w-4 shrink-0" />
                  Total exceeds the agreed cost cap by{" "}
                  {formatChf(totals.totalCents - (invoice.costCapCents ?? 0))}. Lower the lines or
                  give a reason (e.g. extra work ordered by the customer).
                </p>
                <Textarea
                  aria-label="Reason for exceeding the cost cap"
                  rows={2}
                  disabled={readOnly}
                  value={header.costCapOverrideReason}
                  onChange={(e) => setH("costCapOverrideReason", e.target.value)}
                />
                <FieldHint>Recorded in the activity log.</FieldHint>
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
              {saving ? "Saving..." : dirty ? "Save settlement" : "Saved"}
            </Button>
            <Button
              variant="secondary"
              onClick={preview}
              disabled={saving || missingPaymentData.length > 0}
            >
              <Eye className="h-4 w-4" />
              Preview PDF
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
              Issue invoice
            </Button>
            <Button variant="dangerGhost" onClick={() => setDiscardOpen(true)}>
              <X className="h-4 w-4" />
              Discard draft
            </Button>
          </div>
        )}
        {dirty && <Badge variant="warning">Unsaved changes</Badge>}
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
        title="Discard this settlement draft?"
        description="The job can be settled again afterwards. Nothing was issued yet."
        confirmLabel="Discard draft"
        onConfirm={async () => {
          try {
            await discardMutation.mutateAsync({ id: invoice.id })
            setDirty(false)
            await Promise.all([utils.invoices.invalidate(), utils.jobs.invalidate()])
            toast.success("Draft discarded")
            router.push(`/jobs/${invoice.jobId}`)
          } catch (err) {
            toast.error(err instanceof Error ? err.message : "Failed to discard")
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
