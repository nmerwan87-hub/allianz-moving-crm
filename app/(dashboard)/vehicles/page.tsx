"use client"

import { useState } from "react"
import { Car, Pencil, Plus } from "lucide-react"
import { trpc } from "@/lib/trpc/client"
import { PageHeader } from "@/app/(dashboard)/_components/ui/page-header"
import { Button } from "@/app/(dashboard)/_components/ui/button"
import { Badge } from "@/app/(dashboard)/_components/ui/badge"
import { Card } from "@/app/(dashboard)/_components/ui/card"
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
import { EmptyState } from "@/app/(dashboard)/_components/ui/empty-state"
import { useToast } from "@/app/(dashboard)/_components/ui/toast"
import { useHasPermission } from "@/app/(dashboard)/_lib/permissions"
import { createVehicleInput, vehicleTypeEnum, type Vehicle } from "@/modules/fleet/interface"
import { VEHICLE_TYPE_LABELS, formatDate, isoDate, addDays } from "../jobs/_lib/labels"

const STATUS_LABELS: Record<string, string> = {
  available: "Verfügbar",
  in_use: "Im Einsatz",
  maintenance: "In Wartung",
  retired: "Ausser Betrieb",
}

function VehicleDialog({ vehicle, onClose }: { vehicle?: Vehicle; onClose: () => void }) {
  const toast = useToast()
  const utils = trpc.useUtils()
  const create = trpc.fleet.create.useMutation()
  const update = trpc.fleet.update.useMutation()
  const [form, setForm] = useState({
    name: vehicle?.name ?? "",
    type: vehicle?.type ?? "box_truck_16ft",
    licensePlate: vehicle?.licensePlate ?? "",
    make: vehicle?.make ?? "",
    model: vehicle?.model ?? "",
    capacityM3: vehicle?.capacityM3 ? String(vehicle.capacityM3) : "",
    payloadKg: vehicle?.payloadKg ? String(vehicle.payloadKg) : "",
    status: vehicle?.status ?? "available",
    nextInspectionOn: vehicle?.nextInspectionOn ?? "",
    insuranceExpiry: vehicle?.insuranceExpiry ?? "",
    notes: vehicle?.notes ?? "",
  })
  const [error, setError] = useState<string | null>(null)
  const set =
    (key: keyof typeof form) =>
    (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) =>
      setForm((f) => ({ ...f, [key]: e.target.value }))

  async function save() {
    const parsed = createVehicleInput.safeParse({
      ...form,
      capacityM3: form.capacityM3 ? Number(form.capacityM3.replace(",", ".")) : null,
      payloadKg: form.payloadKg ? Number(form.payloadKg) : null,
      nextInspectionOn: form.nextInspectionOn || null,
      insuranceExpiry: form.insuranceExpiry || null,
    })
    if (!parsed.success) return setError(parsed.error.issues[0]?.message ?? "Angaben prüfen")
    try {
      if (vehicle) await update.mutateAsync({ id: vehicle.id, ...parsed.data })
      else await create.mutateAsync(parsed.data)
      await Promise.all([utils.fleet.list.invalidate(), utils.jobs.invalidate()])
      toast.success("Fahrzeug gespeichert")
      onClose()
    } catch (err) {
      setError(err instanceof Error ? err.message : "Speichern fehlgeschlagen")
    }
  }

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{vehicle ? "Fahrzeug bearbeiten" : "Fahrzeug erfassen"}</DialogTitle>
        </DialogHeader>
        <div className="grid max-h-[65vh] gap-3 overflow-y-auto py-1 sm:grid-cols-2">
          <div>
            <FieldLabel htmlFor="ve-name" required>
              Bezeichnung
            </FieldLabel>
            <Input id="ve-name" placeholder="LKW 1" value={form.name} onChange={set("name")} />
          </div>
          <div>
            <FieldLabel htmlFor="ve-plate">Kontrollschild</FieldLabel>
            <Input
              id="ve-plate"
              placeholder="ZH 123456"
              value={form.licensePlate}
              onChange={set("licensePlate")}
            />
          </div>
          <div>
            <FieldLabel htmlFor="ve-type">Typ</FieldLabel>
            <Select id="ve-type" value={form.type} onChange={set("type")}>
              {vehicleTypeEnum.options.map((t) => (
                <option key={t} value={t}>
                  {VEHICLE_TYPE_LABELS[t]}
                </option>
              ))}
            </Select>
          </div>
          <div>
            <FieldLabel htmlFor="ve-status">Status</FieldLabel>
            <Select id="ve-status" value={form.status} onChange={set("status")}>
              {Object.entries(STATUS_LABELS).map(([v, l]) => (
                <option key={v} value={v}>
                  {l}
                </option>
              ))}
            </Select>
          </div>
          <div>
            <FieldLabel htmlFor="ve-m3">Ladevolumen (m³)</FieldLabel>
            <Input
              id="ve-m3"
              inputMode="decimal"
              value={form.capacityM3}
              onChange={set("capacityM3")}
            />
          </div>
          <div>
            <FieldLabel htmlFor="ve-kg">Nutzlast (kg)</FieldLabel>
            <Input
              id="ve-kg"
              inputMode="numeric"
              value={form.payloadKg}
              onChange={set("payloadKg")}
            />
          </div>
          <div>
            <FieldLabel htmlFor="ve-mfk">Nächste MFK</FieldLabel>
            <Input
              id="ve-mfk"
              type="date"
              value={form.nextInspectionOn}
              onChange={set("nextInspectionOn")}
            />
          </div>
          <div>
            <FieldLabel htmlFor="ve-ins">Versicherung gültig bis</FieldLabel>
            <Input
              id="ve-ins"
              type="date"
              value={form.insuranceExpiry}
              onChange={set("insuranceExpiry")}
            />
          </div>
          <div>
            <FieldLabel htmlFor="ve-make">Marke</FieldLabel>
            <Input id="ve-make" value={form.make} onChange={set("make")} />
          </div>
          <div>
            <FieldLabel htmlFor="ve-model">Modell</FieldLabel>
            <Input id="ve-model" value={form.model} onChange={set("model")} />
          </div>
          <div className="sm:col-span-2">
            <FieldLabel htmlFor="ve-notes">Notiz</FieldLabel>
            <Textarea id="ve-notes" rows={2} value={form.notes} onChange={set("notes")} />
          </div>
          {error && (
            <div className="sm:col-span-2">
              <FieldError message={error} />
            </div>
          )}
        </div>
        <DialogFooter>
          <Button variant="secondary" onClick={onClose}>
            Abbrechen
          </Button>
          <Button onClick={save} disabled={create.isPending || update.isPending}>
            Speichern
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

export default function VehiclesPage() {
  const vehicles = trpc.fleet.list.useQuery()
  const canCreate = useHasPermission("vehicles.create")
  const canEdit = useHasPermission("vehicles.edit")
  const [editing, setEditing] = useState<Vehicle | "new" | null>(null)
  const soon = isoDate(addDays(new Date(), 30))

  return (
    <div>
      <PageHeader
        title="Fahrzeuge"
        description="Eure Fahrzeuge mit MFK- und Versicherungsdaten."
        actions={
          canCreate ? (
            <Button onClick={() => setEditing("new")}>
              <Plus className="h-4 w-4" />
              Fahrzeug erfassen
            </Button>
          ) : undefined
        }
      />

      {vehicles.isLoading ? (
        <Skeleton className="h-64 w-full rounded-[var(--radius-lg)]" />
      ) : (vehicles.data ?? []).length === 0 ? (
        <EmptyState
          icon={Car}
          title="Noch keine Fahrzeuge"
          description="Erfasse Lieferwagen und LKW, um sie in Aufträgen einzuplanen."
        />
      ) : (
        <Card className="overflow-hidden p-0">
          <table className="w-full border-collapse text-sm">
            <thead>
              <tr className="border-surface-divider text-text-muted border-b text-left text-xs font-medium">
                <th className="px-4 py-2.5">Fahrzeug</th>
                <th className="hidden px-4 py-2.5 md:table-cell">Typ</th>
                <th className="hidden px-4 py-2.5 md:table-cell">Volumen</th>
                <th className="px-4 py-2.5">MFK</th>
                <th className="hidden px-4 py-2.5 lg:table-cell">Versicherung</th>
                <th className="px-4 py-2.5">Status</th>
                {canEdit && <th className="px-4 py-2.5" />}
              </tr>
            </thead>
            <tbody>
              {(vehicles.data ?? []).map((v) => (
                <tr key={v.id} className="border-surface-divider border-b last:border-0">
                  <td className="px-4 py-3">
                    <div className="text-text-primary font-medium">{v.name}</div>
                    <div className="text-text-muted text-xs">{v.licensePlate ?? "—"}</div>
                  </td>
                  <td className="text-text-secondary hidden px-4 py-3 md:table-cell">
                    {VEHICLE_TYPE_LABELS[v.type]}
                  </td>
                  <td className="text-text-secondary hidden px-4 py-3 md:table-cell">
                    {v.capacityM3 ? `${v.capacityM3} m³` : "—"}
                  </td>
                  <td
                    className={`px-4 py-3 ${v.nextInspectionOn && v.nextInspectionOn <= soon ? "text-danger-700 font-medium" : "text-text-secondary"}`}
                  >
                    {formatDate(v.nextInspectionOn)}
                  </td>
                  <td
                    className={`hidden px-4 py-3 lg:table-cell ${v.insuranceExpiry && v.insuranceExpiry <= soon ? "text-danger-700 font-medium" : "text-text-secondary"}`}
                  >
                    {formatDate(v.insuranceExpiry)}
                  </td>
                  <td className="px-4 py-3">
                    <Badge
                      variant={
                        v.status === "available"
                          ? "success"
                          : v.status === "maintenance"
                            ? "warning"
                            : "neutral"
                      }
                    >
                      {STATUS_LABELS[v.status]}
                    </Badge>
                  </td>
                  {canEdit && (
                    <td className="px-2 py-3 text-right">
                      <Button
                        variant="ghost"
                        size="icon"
                        aria-label={`${v.name} bearbeiten`}
                        onClick={() => setEditing(v)}
                      >
                        <Pencil className="h-4 w-4" />
                      </Button>
                    </td>
                  )}
                </tr>
              ))}
            </tbody>
          </table>
        </Card>
      )}

      {editing && (
        <VehicleDialog
          {...(editing === "new" ? {} : { vehicle: editing })}
          onClose={() => setEditing(null)}
        />
      )}
    </div>
  )
}
