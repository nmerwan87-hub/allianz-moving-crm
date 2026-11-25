"use client"

import { useState } from "react"
import { trpc } from "@/lib/trpc/client"
import { Button } from "@/app/(dashboard)/_components/ui/button"
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
import { useToast } from "@/app/(dashboard)/_components/ui/toast"
import type { CalendarEvent } from "@/modules/calendar/interface"

const DURATIONS = [30, 60, 90, 120, 180, 240, 480]

function durationLabel(minutes: number): string {
  if (minutes < 60) return `${minutes} Min.`
  const h = minutes / 60
  return `${Number.isInteger(h) ? h : h.toFixed(1)} Std.`
}

/**
 * New or existing appointment (Bixin: "Personalisierter Termin" / "Hausbesuch
 * abmachen"). Optionally linked to an inquiry; confirmed by the customer or not.
 */
export function AppointmentDialog({
  event,
  defaults,
  onClose,
}: {
  event?: CalendarEvent | undefined
  defaults?:
    | {
        title?: string
        kind?: "site_visit" | "other"
        date?: string
        startTime?: string
        leadId?: string
        leadLabel?: string
        customerId?: string
      }
    | undefined
  onClose: () => void
}) {
  const toast = useToast()
  const utils = trpc.useUtils()
  const create = trpc.calendar.create.useMutation()
  const update = trpc.calendar.update.useMutation()
  const remove = trpc.calendar.remove.useMutation()
  const [form, setForm] = useState({
    title: event?.title ?? defaults?.title ?? "",
    kind: (event?.kind === "other"
      ? "other"
      : event
        ? "site_visit"
        : (defaults?.kind ?? "other")) as "site_visit" | "other",
    date: event?.date ?? defaults?.date ?? new Date().toISOString().slice(0, 10),
    startTime: event?.startTime ?? defaults?.startTime ?? "09:00",
    durationMinutes: event?.durationMinutes ?? 60,
    confirmed: event?.confirmed ?? false,
    notes: event?.notes ?? "",
  })
  const [error, setError] = useState<string | null>(null)
  const leadId = event?.leadId ?? defaults?.leadId ?? null
  const pending = create.isPending || update.isPending || remove.isPending
  const set = <K extends keyof typeof form>(key: K, value: (typeof form)[K]) =>
    setForm((f) => ({ ...f, [key]: value }))

  async function done(message: string) {
    await Promise.all([utils.calendar.invalidate(), utils.dashboard.invalidate()])
    toast.success(message)
    onClose()
  }

  async function save() {
    if (!form.title.trim()) return setError("Titel eingeben.")
    const payload = {
      ...form,
      leadId,
      customerId: event?.customerId ?? defaults?.customerId ?? null,
    }
    try {
      if (event) {
        await update.mutateAsync({ id: event.id, ...payload })
        await done("Termin gespeichert")
      } else {
        await create.mutateAsync(payload)
        await done("Termin erstellt")
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Speichern fehlgeschlagen")
    }
  }

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{event ? "Termin bearbeiten" : "Neuer Termin"}</DialogTitle>
        </DialogHeader>
        <div className="grid gap-3 py-1 sm:grid-cols-2">
          <div className="sm:col-span-2">
            <FieldLabel htmlFor="ap-title" required>
              Titel
            </FieldLabel>
            <Input
              id="ap-title"
              autoFocus
              value={form.title}
              placeholder="z. B. Hausbesuch Muster"
              onChange={(e) => set("title", e.target.value)}
            />
          </div>
          <label className="text-text-primary flex items-center gap-2 text-sm sm:col-span-2">
            <input
              type="checkbox"
              checked={form.kind === "site_visit"}
              onChange={(e) => set("kind", e.target.checked ? "site_visit" : "other")}
            />
            Hausbesuch / Besichtigung
          </label>
          <div>
            <FieldLabel htmlFor="ap-date">Datum</FieldLabel>
            <Input
              id="ap-date"
              type="date"
              value={form.date}
              onChange={(e) => set("date", e.target.value)}
            />
          </div>
          <div className="grid grid-cols-2 gap-2">
            <div>
              <FieldLabel htmlFor="ap-time">Beginn</FieldLabel>
              <Input
                id="ap-time"
                type="time"
                value={form.startTime}
                onChange={(e) => set("startTime", e.target.value)}
              />
            </div>
            <div>
              <FieldLabel htmlFor="ap-duration">Dauer</FieldLabel>
              <Select
                id="ap-duration"
                value={String(form.durationMinutes)}
                onChange={(e) => set("durationMinutes", Number(e.target.value))}
              >
                {[...new Set([...DURATIONS, form.durationMinutes])]
                  .sort((a, b) => a - b)
                  .map((m) => (
                    <option key={m} value={m}>
                      {durationLabel(m)}
                    </option>
                  ))}
              </Select>
            </div>
          </div>
          <div className="border-surface-divider flex items-center justify-between gap-3 rounded-[var(--radius-md)] border px-3 py-2 sm:col-span-2">
            <span className="text-sm">
              Termin ist{" "}
              <strong className={form.confirmed ? "text-success-700" : "text-text-primary"}>
                {form.confirmed ? "vom Kunden bestätigt" : "nicht bestätigt"}
              </strong>
            </span>
            <Button size="sm" variant="secondary" onClick={() => set("confirmed", !form.confirmed)}>
              {form.confirmed ? "Bestätigung aufheben" : "Bestätigen"}
            </Button>
          </div>
          {(defaults?.leadLabel ?? event?.subtitle) && leadId && (
            <p className="text-text-secondary text-sm sm:col-span-2">
              Verknüpft mit Anfrage: <strong>{defaults?.leadLabel ?? event?.subtitle}</strong>
            </p>
          )}
          <div className="sm:col-span-2">
            <FieldLabel htmlFor="ap-notes">Kommentar</FieldLabel>
            <Textarea
              id="ap-notes"
              rows={2}
              value={form.notes}
              onChange={(e) => set("notes", e.target.value)}
            />
          </div>
          {error && (
            <div className="sm:col-span-2">
              <FieldError message={error} />
            </div>
          )}
        </div>
        <DialogFooter>
          {event && (
            <Button
              variant="dangerGhost"
              className="mr-auto"
              disabled={pending}
              onClick={async () => {
                await remove.mutateAsync({ id: event.id })
                await done("Termin gelöscht")
              }}
            >
              Löschen
            </Button>
          )}
          <Button variant="secondary" onClick={onClose} disabled={pending}>
            Abbrechen
          </Button>
          <Button onClick={save} disabled={pending}>
            {event ? "Speichern" : "Termin hinzufügen"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
