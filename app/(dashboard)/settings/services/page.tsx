"use client"

import { useMemo, useState } from "react"
import { ArrowDown, ArrowUp, Package, Pencil, Plus, Trash2 } from "lucide-react"
import { trpc } from "@/lib/trpc/client"
import { formatChf, formatCents, parseToCents } from "@/lib/format/money"
import { PageHeader } from "@/app/(dashboard)/_components/ui/page-header"
import { Button } from "@/app/(dashboard)/_components/ui/button"
import { Badge } from "@/app/(dashboard)/_components/ui/badge"
import { Card, CardHeader } from "@/app/(dashboard)/_components/ui/card"
import {
  Input,
  Select,
  Textarea,
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
import { ErrorState } from "@/app/(dashboard)/_components/ui/error-state"
import { useToast } from "@/app/(dashboard)/_components/ui/toast"
import { useHasPermission } from "@/app/(dashboard)/_lib/permissions"
import { pricingModeEnum, createServiceInput, type Service } from "@/modules/catalog/interface"

const PRICING_MODE_LABELS: Record<Service["defaultPricingMode"], string> = {
  fixed: "Fixed price",
  hourly: "Per hour",
  quantity: "Per unit",
  distance: "Per km",
  manual: "Manual",
}

interface DraftService {
  id?: string
  name: string
  category: string
  defaultPricingMode: Service["defaultPricingMode"]
  defaultUnitLabel: string
  price: string
  cost: string
  vat: string
  description: string
  customerDescription: string
}

function toDraft(s?: Service): DraftService {
  return {
    ...(s ? { id: s.id } : {}),
    name: s?.name ?? "",
    category: s?.category ?? "",
    defaultPricingMode: s?.defaultPricingMode ?? "fixed",
    defaultUnitLabel: s?.defaultUnitLabel ?? "",
    price: s ? formatCents(s.defaultUnitPriceCents) : "",
    cost: s ? formatCents(s.defaultCostPriceCents) : "",
    vat: s ? String(s.defaultVatRatePercent) : "8.1",
    description: s?.description ?? "",
    customerDescription: s?.customerDescription ?? "",
  }
}

function ServiceDialog({
  draft,
  categories,
  onClose,
}: {
  draft: DraftService
  categories: string[]
  onClose: () => void
}) {
  const toast = useToast()
  const utils = trpc.useUtils()
  const [form, setForm] = useState(draft)
  const [errors, setErrors] = useState<Record<string, string>>({})
  const createMutation = trpc.catalog.services.create.useMutation()
  const updateMutation = trpc.catalog.services.update.useMutation()
  const saving = createMutation.isPending || updateMutation.isPending

  const set = <K extends keyof DraftService>(key: K, value: DraftService[K]) =>
    setForm((f) => ({ ...f, [key]: value }))

  async function save() {
    const price = parseToCents(form.price || "0")
    const cost = parseToCents(form.cost || "0")
    const vat = Number(form.vat.replace(",", "."))
    const parsed = createServiceInput.safeParse({
      name: form.name,
      category: form.category,
      defaultPricingMode: form.defaultPricingMode,
      defaultUnitLabel: form.defaultUnitLabel,
      defaultUnitPriceCents: price ?? -1,
      defaultCostPriceCents: cost ?? -1,
      defaultVatRatePercent: Number.isFinite(vat) ? vat : -1,
      description: form.description,
      customerDescription: form.customerDescription,
    })
    if (!parsed.success) {
      const next: Record<string, string> = {}
      for (const issue of parsed.error.issues) {
        const key = String(issue.path[0])
        next[key] =
          key === "defaultUnitPriceCents" || key === "defaultCostPriceCents"
            ? "Enter an amount like 150 or 1'250.50"
            : key === "defaultVatRatePercent"
              ? "Enter a rate between 0 and 100"
              : issue.message
      }
      setErrors(next)
      return
    }

    try {
      if (form.id) await updateMutation.mutateAsync({ id: form.id, ...parsed.data })
      else await createMutation.mutateAsync(parsed.data)
      await utils.catalog.services.list.invalidate()
      toast.success(form.id ? "Service updated" : "Service added")
      onClose()
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to save service")
    }
  }

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{form.id ? "Edit service" : "Add service"}</DialogTitle>
        </DialogHeader>
        <div className="grid max-h-[70vh] gap-4 overflow-y-auto py-2 sm:grid-cols-2">
          <div className="sm:col-span-2">
            <FieldLabel required htmlFor="svc-name">
              Name
            </FieldLabel>
            <Input
              id="svc-name"
              value={form.name}
              hasError={!!errors["name"]}
              onChange={(e) => set("name", e.target.value)}
            />
            <FieldError message={errors["name"]} />
          </div>
          <div>
            <FieldLabel required htmlFor="svc-category">
              Category
            </FieldLabel>
            <Input
              id="svc-category"
              list="svc-categories"
              value={form.category}
              hasError={!!errors["category"]}
              onChange={(e) => set("category", e.target.value)}
            />
            <datalist id="svc-categories">
              {categories.map((c) => (
                <option key={c} value={c} />
              ))}
            </datalist>
            <FieldError message={errors["category"]} />
          </div>
          <div>
            <FieldLabel htmlFor="svc-mode">Pricing</FieldLabel>
            <Select
              id="svc-mode"
              value={form.defaultPricingMode}
              onChange={(e) =>
                set("defaultPricingMode", e.target.value as DraftService["defaultPricingMode"])
              }
            >
              {pricingModeEnum.options.map((mode) => (
                <option key={mode} value={mode}>
                  {PRICING_MODE_LABELS[mode]}
                </option>
              ))}
            </Select>
          </div>
          <div>
            <FieldLabel htmlFor="svc-price">Price (CHF)</FieldLabel>
            <Input
              id="svc-price"
              inputMode="decimal"
              value={form.price}
              hasError={!!errors["defaultUnitPriceCents"]}
              onChange={(e) => set("price", e.target.value)}
            />
            <FieldError message={errors["defaultUnitPriceCents"]} />
          </div>
          <div>
            <FieldLabel htmlFor="svc-unit">Unit</FieldLabel>
            <Input
              id="svc-unit"
              placeholder="Std., m³, Stk., Pauschale"
              value={form.defaultUnitLabel}
              onChange={(e) => set("defaultUnitLabel", e.target.value)}
            />
          </div>
          <div>
            <FieldLabel htmlFor="svc-cost">Cost price (CHF)</FieldLabel>
            <Input
              id="svc-cost"
              inputMode="decimal"
              value={form.cost}
              hasError={!!errors["defaultCostPriceCents"]}
              onChange={(e) => set("cost", e.target.value)}
            />
            <FieldError message={errors["defaultCostPriceCents"]} />
            <FieldHint>Internal, for margin. Never shown to customers.</FieldHint>
          </div>
          <div>
            <FieldLabel htmlFor="svc-vat">VAT (%)</FieldLabel>
            <Input
              id="svc-vat"
              inputMode="decimal"
              value={form.vat}
              hasError={!!errors["defaultVatRatePercent"]}
              onChange={(e) => set("vat", e.target.value)}
            />
            <FieldError message={errors["defaultVatRatePercent"]} />
          </div>
          <div className="sm:col-span-2">
            <FieldLabel htmlFor="svc-customer-desc">Text on offers</FieldLabel>
            <Textarea
              id="svc-customer-desc"
              rows={2}
              value={form.customerDescription}
              onChange={(e) => set("customerDescription", e.target.value)}
            />
          </div>
          <div className="sm:col-span-2">
            <FieldLabel htmlFor="svc-desc">Internal note</FieldLabel>
            <Textarea
              id="svc-desc"
              rows={2}
              value={form.description}
              onChange={(e) => set("description", e.target.value)}
            />
          </div>
        </div>
        <DialogFooter>
          <Button variant="secondary" onClick={onClose} disabled={saving}>
            Cancel
          </Button>
          <Button onClick={save} disabled={saving}>
            {saving ? "Saving..." : "Save"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

export default function ServicesSettingsPage() {
  const toast = useToast()
  const utils = trpc.useUtils()
  const canEdit = useHasPermission("settings.services")
  const query = trpc.catalog.services.list.useQuery()
  const setActive = trpc.catalog.services.setActive.useMutation()
  const reorder = trpc.catalog.services.reorder.useMutation()
  const remove = trpc.catalog.services.remove.useMutation()
  const [editing, setEditing] = useState<DraftService | null>(null)
  const [removing, setRemoving] = useState<Service | null>(null)

  const grouped = useMemo(() => {
    const map = new Map<string, Service[]>()
    for (const s of query.data ?? []) {
      if (!map.has(s.category)) map.set(s.category, [])
      map.get(s.category)!.push(s)
    }
    return [...map.entries()]
  }, [query.data])

  async function run(action: () => Promise<unknown>, success: string) {
    try {
      await action()
      await utils.catalog.services.list.invalidate()
      toast.success(success)
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Action failed")
    }
  }

  function move(category: string, services: Service[], index: number, delta: -1 | 1) {
    const ids = services.map((s) => s.id)
    const [moved] = ids.splice(index, 1)
    ids.splice(index + delta, 0, moved!)
    void run(() => reorder.mutateAsync({ category, orderedIds: ids }), "Order saved")
  }

  return (
    <div>
      <PageHeader
        title="Services"
        description="Prices and units used when you build offers. Changes never alter offers already sent."
        actions={
          canEdit ? (
            <Button onClick={() => setEditing(toDraft())}>
              <Plus className="h-4 w-4" />
              Add service
            </Button>
          ) : undefined
        }
      />

      {query.isLoading ? (
        <Skeleton className="h-96 w-full rounded-[var(--radius-lg)]" />
      ) : query.isError ? (
        <ErrorState title="Couldn't load services" message="Please try again." />
      ) : grouped.length === 0 ? (
        <Card className="p-8 text-center">
          <Package className="text-text-muted mx-auto h-8 w-8" />
          <p className="text-text-secondary mt-2 text-sm">No services yet.</p>
        </Card>
      ) : (
        <div className="space-y-6">
          {grouped.map(([category, services]) => (
            <Card key={category} className="overflow-hidden p-0">
              <CardHeader>{category}</CardHeader>
              <div className="overflow-x-auto">
                <table className="w-full border-collapse text-sm">
                  <thead>
                    <tr className="border-surface-divider text-text-muted border-b text-left text-xs font-semibold tracking-wide uppercase">
                      <th className="px-4 py-2.5">Service</th>
                      <th className="hidden px-4 py-2.5 md:table-cell">Pricing</th>
                      <th className="px-4 py-2.5 text-right">Price</th>
                      <th className="hidden px-4 py-2.5 text-right sm:table-cell">VAT</th>
                      <th className="px-4 py-2.5">Status</th>
                      {canEdit && <th className="px-4 py-2.5" />}
                    </tr>
                  </thead>
                  <tbody>
                    {services.map((s, index) => (
                      <tr key={s.id} className="border-surface-divider border-b last:border-0">
                        <td className="px-4 py-3">
                          <div
                            className={
                              s.isActive
                                ? "text-text-primary font-medium"
                                : "text-text-muted font-medium"
                            }
                          >
                            {s.name}
                          </div>
                          {!s.isSystemDefault && (
                            <div className="text-text-muted text-xs">Custom</div>
                          )}
                        </td>
                        <td className="text-text-secondary hidden px-4 py-3 md:table-cell">
                          {PRICING_MODE_LABELS[s.defaultPricingMode]}
                        </td>
                        <td className="text-text-primary px-4 py-3 text-right whitespace-nowrap tabular-nums">
                          {s.defaultUnitPriceCents > 0 ? formatChf(s.defaultUnitPriceCents) : "—"}
                          {s.defaultUnitLabel && (
                            <span className="text-text-muted"> / {s.defaultUnitLabel}</span>
                          )}
                        </td>
                        <td className="text-text-secondary hidden px-4 py-3 text-right tabular-nums sm:table-cell">
                          {s.defaultVatRatePercent}%
                        </td>
                        <td className="px-4 py-3">
                          {canEdit ? (
                            <button
                              type="button"
                              role="switch"
                              aria-checked={s.isActive}
                              aria-label={`${s.name} ${s.isActive ? "active" : "inactive"}`}
                              onClick={() =>
                                void run(
                                  () => setActive.mutateAsync({ id: s.id, isActive: !s.isActive }),
                                  s.isActive ? "Service deactivated" : "Service activated",
                                )
                              }
                            >
                              <Badge variant={s.isActive ? "success" : "neutral"}>
                                {s.isActive ? "Active" : "Inactive"}
                              </Badge>
                            </button>
                          ) : (
                            <Badge variant={s.isActive ? "success" : "neutral"}>
                              {s.isActive ? "Active" : "Inactive"}
                            </Badge>
                          )}
                        </td>
                        {canEdit && (
                          <td className="px-2 py-3">
                            <div className="flex justify-end gap-1">
                              <Button
                                variant="ghost"
                                size="icon"
                                aria-label="Move up"
                                disabled={index === 0 || reorder.isPending}
                                onClick={() => move(category, services, index, -1)}
                              >
                                <ArrowUp className="h-4 w-4" />
                              </Button>
                              <Button
                                variant="ghost"
                                size="icon"
                                aria-label="Move down"
                                disabled={index === services.length - 1 || reorder.isPending}
                                onClick={() => move(category, services, index, 1)}
                              >
                                <ArrowDown className="h-4 w-4" />
                              </Button>
                              <Button
                                variant="ghost"
                                size="icon"
                                aria-label={`Edit ${s.name}`}
                                onClick={() => setEditing(toDraft(s))}
                              >
                                <Pencil className="h-4 w-4" />
                              </Button>
                              {!s.isSystemDefault && (
                                <Button
                                  variant="dangerGhost"
                                  size="icon"
                                  aria-label={`Remove ${s.name}`}
                                  onClick={() => setRemoving(s)}
                                >
                                  <Trash2 className="h-4 w-4" />
                                </Button>
                              )}
                            </div>
                          </td>
                        )}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </Card>
          ))}
        </div>
      )}

      {editing && (
        <ServiceDialog
          draft={editing}
          categories={grouped.map(([c]) => c)}
          onClose={() => setEditing(null)}
        />
      )}

      <ConfirmDialog
        open={removing !== null}
        onOpenChange={(open) => !open && setRemoving(null)}
        title={`Remove ${removing?.name ?? "service"}?`}
        description="If the service was used on an offer it is archived instead, so existing offers stay unchanged."
        confirmLabel="Remove"
        onConfirm={() => {
          if (removing) {
            const target = removing
            setRemoving(null)
            void run(async () => {
              const { result } = await remove.mutateAsync({ id: target.id })
              if (result === "archived") toast.info("Used on offers — archived instead of deleted")
            }, "Service removed")
          }
        }}
      />
    </div>
  )
}
