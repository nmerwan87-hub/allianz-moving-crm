"use client"

import { useState } from "react"
import { useRouter } from "next/navigation"
import { trpc } from "@/lib/trpc/client"
import { Button } from "@/app/(dashboard)/_components/ui/button"
import { Input, Select, FieldLabel, FieldError } from "@/app/(dashboard)/_components/ui/field"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/app/(dashboard)/_components/ui/dialog"
import { createJobInput } from "@/modules/jobs/interface"
import { moveTypeEnum } from "@/modules/leads/interface"

/** A job without a quote — small jobs agreed by phone. Jobs from quotes are created automatically. */
export function NewJobDialog({
  open,
  onOpenChange,
  defaultDate,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  defaultDate: string
}) {
  const router = useRouter()
  const [search, setSearch] = useState("")
  const customers = trpc.customers.list.useQuery(
    { ...(search ? { search } : {}), pageSize: 6 },
    { enabled: open },
  )
  const create = trpc.jobs.create.useMutation()
  const [form, setForm] = useState({
    customerId: "",
    moveType: "local",
    scheduledDate: defaultDate,
    startTime: "07:00",
    durationHours: "8",
    crewSizeRequired: "2",
    originAddress: "",
    originPostalCode: "",
    originCity: "",
    destAddress: "",
    destPostalCode: "",
    destCity: "",
  })
  const [error, setError] = useState<string | null>(null)
  const set =
    (key: keyof typeof form) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) =>
      setForm((f) => ({ ...f, [key]: e.target.value }))

  async function submit() {
    const parsed = createJobInput.safeParse({
      ...form,
      durationHours: Number(form.durationHours) || null,
      crewSizeRequired: Number(form.crewSizeRequired) || null,
    })
    if (!parsed.success) {
      const issue = parsed.error.issues[0]
      return setError(
        issue?.path[0] === "customerId"
          ? "Choose a customer."
          : (issue?.message ?? "Check the form"),
      )
    }
    try {
      const { id } = await create.mutateAsync(parsed.data)
      onOpenChange(false)
      router.push(`/jobs/${id}`)
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to create job")
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>New job</DialogTitle>
          <DialogDescription>Accepted quotes become jobs automatically.</DialogDescription>
        </DialogHeader>
        <div className="grid max-h-[65vh] gap-3 overflow-y-auto py-1 sm:grid-cols-6">
          <div className="sm:col-span-6">
            <FieldLabel htmlFor="nj-search" required>
              Customer
            </FieldLabel>
            <Input
              id="nj-search"
              placeholder="Search customers..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
            <Select
              aria-label="Customer"
              className="mt-2"
              value={form.customerId}
              onChange={set("customerId")}
            >
              <option value="">Choose…</option>
              {(customers.data?.items ?? []).map((c) => (
                <option key={c.id} value={c.id}>
                  {c.displayName}
                  {c.billingCity ? ` — ${c.billingCity}` : ""}
                </option>
              ))}
            </Select>
          </div>
          <div className="sm:col-span-2">
            <FieldLabel htmlFor="nj-date">Date</FieldLabel>
            <Input
              id="nj-date"
              type="date"
              value={form.scheduledDate}
              onChange={set("scheduledDate")}
            />
          </div>
          <div className="sm:col-span-2">
            <FieldLabel htmlFor="nj-time">Start</FieldLabel>
            <Input id="nj-time" type="time" value={form.startTime} onChange={set("startTime")} />
          </div>
          <div className="sm:col-span-1">
            <FieldLabel htmlFor="nj-hours">Hours</FieldLabel>
            <Input
              id="nj-hours"
              inputMode="decimal"
              value={form.durationHours}
              onChange={set("durationHours")}
            />
          </div>
          <div className="sm:col-span-1">
            <FieldLabel htmlFor="nj-crew">Crew</FieldLabel>
            <Input
              id="nj-crew"
              inputMode="numeric"
              value={form.crewSizeRequired}
              onChange={set("crewSizeRequired")}
            />
          </div>
          <div className="sm:col-span-6">
            <FieldLabel htmlFor="nj-type">Type</FieldLabel>
            <Select id="nj-type" value={form.moveType} onChange={set("moveType")}>
              {moveTypeEnum.options.map((v) => (
                <option key={v} value={v}>
                  {v.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase())}
                </option>
              ))}
            </Select>
          </div>
          {(["origin", "dest"] as const).map((side) => (
            <div key={side} className="grid gap-2 sm:col-span-6 sm:grid-cols-6">
              <p className="text-text-primary text-sm font-semibold sm:col-span-6">
                {side === "origin" ? "From" : "To"}
              </p>
              <Input
                aria-label={`${side} street`}
                className="sm:col-span-6"
                placeholder="Street and number"
                value={form[`${side}Address`]}
                onChange={set(`${side}Address`)}
              />
              <Input
                aria-label={`${side} postal code`}
                className="sm:col-span-2"
                placeholder="Postal code"
                value={form[`${side}PostalCode`]}
                onChange={set(`${side}PostalCode`)}
              />
              <Input
                aria-label={`${side} city`}
                className="sm:col-span-4"
                placeholder="City"
                value={form[`${side}City`]}
                onChange={set(`${side}City`)}
              />
            </div>
          ))}
          {error && (
            <div className="sm:col-span-6">
              <FieldError message={error} />
            </div>
          )}
        </div>
        <DialogFooter>
          <Button variant="secondary" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button onClick={submit} disabled={create.isPending}>
            {create.isPending ? "Creating..." : "Create job"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
