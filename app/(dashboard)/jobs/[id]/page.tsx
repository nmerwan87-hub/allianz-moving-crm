"use client"

import { use, useState } from "react"
import Link from "next/link"
import { useRouter } from "next/navigation"
import {
  AlertTriangle,
  ArrowLeft,
  CheckCircle2,
  PauseCircle,
  PlayCircle,
  ThumbsUp,
  XCircle,
} from "lucide-react"
import { trpc } from "@/lib/trpc/client"
import { formatChf } from "@/lib/format/money"
import { Button } from "@/app/(dashboard)/_components/ui/button"
import { Badge } from "@/app/(dashboard)/_components/ui/badge"
import { Card, CardContent, CardHeader } from "@/app/(dashboard)/_components/ui/card"
import { Input, Textarea, FieldLabel } from "@/app/(dashboard)/_components/ui/field"
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/app/(dashboard)/_components/ui/dialog"
import { Skeleton } from "@/app/(dashboard)/_components/ui/skeleton"
import { ErrorState } from "@/app/(dashboard)/_components/ui/error-state"
import { useToast } from "@/app/(dashboard)/_components/ui/toast"
import { WrongCompanyNotice } from "@/app/(dashboard)/_components/wrong-company-notice"
import { useHasPermission } from "@/app/(dashboard)/_lib/permissions"
import type { Job, ResourceConflict } from "@/modules/jobs/interface"
import {
  CONFLICT_LABELS,
  EMPLOYEE_ROLE_LABELS,
  JOB_STATUS_BADGE,
  JOB_STATUS_LABELS,
  VEHICLE_TYPE_LABELS,
  formatDate,
} from "../_lib/labels"

function ConflictList({ conflicts }: { conflicts: ResourceConflict[] }) {
  return (
    <ul className="space-y-1 text-sm">
      {conflicts.map((c, i) => (
        <li
          key={`${c.resourceId}-${c.conflict}-${i}`}
          className="text-danger-700 flex items-start gap-2"
        >
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
          <span>
            <strong>{c.resourceName}</strong> {CONFLICT_LABELS[c.conflict] ?? c.conflict}
            {c.otherJobId && (
              <>
                {" "}
                (
                <Link href={`/jobs/${c.otherJobId}`} className="underline">
                  {c.otherJobNumber}
                </Link>
                )
              </>
            )}
          </span>
        </li>
      ))}
    </ul>
  )
}

function AssignmentCard({ job, canAssign }: { job: Job; canAssign: boolean }) {
  const toast = useToast()
  const utils = trpc.useUtils()
  const employees = trpc.crew.employees.list.useQuery()
  const vehicles = trpc.fleet.list.useQuery()
  const assign = trpc.jobs.assign.useMutation()
  const [crew, setCrew] = useState<string[]>(job.crew.map((c) => c.id))
  const [lead, setLead] = useState<string | null>(
    job.crew.find((c) => c.role === "lead")?.id ?? null,
  )
  const [cars, setCars] = useState<string[]>(job.vehicles.map((v) => v.id))
  const [pending, setPending] = useState<ResourceConflict[] | null>(null)
  const editable = canAssign && job.status !== "completed" && job.status !== "cancelled"

  const toggle = (list: string[], id: string) =>
    list.includes(id) ? list.filter((x) => x !== id) : [...list, id]

  async function save(force: boolean) {
    try {
      const result = await assign.mutateAsync({
        id: job.id,
        employeeIds: crew,
        leadEmployeeId: lead && crew.includes(lead) ? lead : null,
        vehicleIds: cars,
        force,
      })
      if (!result.saved) {
        setPending(result.conflicts)
        return
      }
      setPending(null)
      await utils.jobs.invalidate()
      toast.success(force ? "Assigned despite conflicts" : "Crew and vehicles assigned")
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to assign")
    }
  }

  const activeEmployees = (employees.data ?? []).filter(
    (e) => e.status === "active" || crew.includes(e.id),
  )
  const usableVehicles = (vehicles.data ?? []).filter(
    (v) => v.status !== "retired" || cars.includes(v.id),
  )

  return (
    <Card>
      <CardHeader>
        Crew & vehicles{" "}
        {job.crewSizeRequired ? (
          <span
            className={crew.length < job.crewSizeRequired ? "text-warning-700" : "text-text-muted"}
          >
            ({crew.length}/{job.crewSizeRequired})
          </span>
        ) : null}
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="grid gap-4 md:grid-cols-2">
          <div>
            <p className="text-text-muted mb-2 text-xs font-semibold uppercase">Crew</p>
            {activeEmployees.length === 0 && (
              <p className="text-text-muted text-sm">
                No employees yet — add them under{" "}
                <Link href="/employees" className="underline">
                  Employees
                </Link>
                .
              </p>
            )}
            <ul className="space-y-1.5">
              {activeEmployees.map((e) => (
                <li key={e.id} className="flex items-center gap-2 text-sm">
                  <input
                    type="checkbox"
                    aria-label={`Assign ${e.name}`}
                    disabled={!editable}
                    checked={crew.includes(e.id)}
                    onChange={() => setCrew((c) => toggle(c, e.id))}
                  />
                  <span className="text-text-primary flex-1">
                    {e.name}{" "}
                    <span className="text-text-muted text-xs">{EMPLOYEE_ROLE_LABELS[e.role]}</span>
                  </span>
                  {crew.includes(e.id) && (
                    <label className="text-text-muted flex items-center gap-1 text-xs">
                      <input
                        type="radio"
                        name="lead"
                        aria-label={`${e.name} is crew lead`}
                        disabled={!editable}
                        checked={lead === e.id}
                        onChange={() => setLead(e.id)}
                      />
                      Lead
                    </label>
                  )}
                </li>
              ))}
            </ul>
          </div>
          <div>
            <p className="text-text-muted mb-2 text-xs font-semibold uppercase">Vehicles</p>
            {usableVehicles.length === 0 && (
              <p className="text-text-muted text-sm">
                No vehicles yet — add them under{" "}
                <Link href="/vehicles" className="underline">
                  Vehicles
                </Link>
                .
              </p>
            )}
            <ul className="space-y-1.5">
              {usableVehicles.map((v) => (
                <li key={v.id} className="flex items-center gap-2 text-sm">
                  <input
                    type="checkbox"
                    aria-label={`Assign ${v.name}`}
                    disabled={!editable}
                    checked={cars.includes(v.id)}
                    onChange={() => setCars((c) => toggle(c, v.id))}
                  />
                  <span className="text-text-primary flex-1">
                    {v.name}{" "}
                    <span className="text-text-muted text-xs">
                      {VEHICLE_TYPE_LABELS[v.type]}
                      {v.capacityM3 ? ` · ${v.capacityM3} m³` : ""}
                    </span>
                  </span>
                  {v.status === "maintenance" && <Badge variant="warning">Maintenance</Badge>}
                </li>
              ))}
            </ul>
          </div>
        </div>

        {pending && pending.length > 0 && (
          <div className="border-danger-600/30 bg-danger-100/50 space-y-2 rounded-[var(--radius-md)] border p-3">
            <p className="text-text-primary text-sm font-semibold">Not saved — conflicts:</p>
            <ConflictList conflicts={pending} />
            <div className="flex gap-2">
              <Button
                size="sm"
                variant="danger"
                onClick={() => save(true)}
                disabled={assign.isPending}
              >
                Assign anyway
              </Button>
              <Button size="sm" variant="secondary" onClick={() => setPending(null)}>
                Change selection
              </Button>
            </div>
          </div>
        )}

        {editable && !pending && (
          <div className="flex justify-end">
            <Button onClick={() => save(false)} disabled={assign.isPending}>
              {assign.isPending ? "Checking..." : "Save assignment"}
            </Button>
          </div>
        )}
      </CardContent>
    </Card>
  )
}

function ScheduleCard({ job, canEdit }: { job: Job; canEdit: boolean }) {
  const toast = useToast()
  const utils = trpc.useUtils()
  const schedule = trpc.jobs.schedule.useMutation()
  const [form, setForm] = useState({
    scheduledDate: job.scheduledDate,
    startTime: job.startTime ?? "",
    durationHours: job.durationHours === null ? "" : String(job.durationHours),
    crewSizeRequired: job.crewSizeRequired === null ? "" : String(job.crewSizeRequired),
    specialInstructions: job.specialInstructions ?? "",
    internalNotes: job.internalNotes ?? "",
  })
  const editable = canEdit && job.status !== "completed" && job.status !== "cancelled"
  const set =
    (key: keyof typeof form) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) =>
      setForm((f) => ({ ...f, [key]: e.target.value }))

  async function save() {
    try {
      const result = await schedule.mutateAsync({
        id: job.id,
        scheduledDate: form.scheduledDate,
        startTime: form.startTime || null,
        durationHours: form.durationHours ? Number(form.durationHours.replace(",", ".")) : null,
        crewSizeRequired: form.crewSizeRequired ? Number(form.crewSizeRequired) : null,
        specialInstructions: form.specialInstructions,
        internalNotes: form.internalNotes,
      })
      await utils.jobs.invalidate()
      if (result.conflicts.length)
        toast.error("Saved — but the new time causes conflicts", "See the conflicts above.")
      else toast.success("Schedule saved")
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to save")
    }
  }

  return (
    <Card>
      <CardHeader>Schedule</CardHeader>
      <CardContent className="grid gap-3 sm:grid-cols-4">
        <div>
          <FieldLabel htmlFor="js-date">Date</FieldLabel>
          <Input
            id="js-date"
            type="date"
            disabled={!editable}
            value={form.scheduledDate}
            onChange={set("scheduledDate")}
          />
        </div>
        <div>
          <FieldLabel htmlFor="js-time">Start</FieldLabel>
          <Input
            id="js-time"
            type="time"
            disabled={!editable}
            value={form.startTime}
            onChange={set("startTime")}
          />
        </div>
        <div>
          <FieldLabel htmlFor="js-hours">Hours</FieldLabel>
          <Input
            id="js-hours"
            inputMode="decimal"
            disabled={!editable}
            value={form.durationHours}
            onChange={set("durationHours")}
          />
        </div>
        <div>
          <FieldLabel htmlFor="js-crew">Crew needed</FieldLabel>
          <Input
            id="js-crew"
            inputMode="numeric"
            disabled={!editable}
            value={form.crewSizeRequired}
            onChange={set("crewSizeRequired")}
          />
        </div>
        <div className="sm:col-span-2">
          <FieldLabel htmlFor="js-instructions">Instructions for the crew</FieldLabel>
          <Textarea
            id="js-instructions"
            rows={3}
            disabled={!editable}
            value={form.specialInstructions}
            onChange={set("specialInstructions")}
          />
        </div>
        <div className="sm:col-span-2">
          <FieldLabel htmlFor="js-notes">Internal notes</FieldLabel>
          <Textarea
            id="js-notes"
            rows={3}
            disabled={!editable}
            value={form.internalNotes}
            onChange={set("internalNotes")}
          />
        </div>
        {editable && (
          <div className="flex justify-end sm:col-span-4">
            <Button variant="secondary" onClick={save} disabled={schedule.isPending}>
              {schedule.isPending ? "Saving..." : "Save schedule"}
            </Button>
          </div>
        )}
      </CardContent>
    </Card>
  )
}

export default function JobPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params)
  const router = useRouter()
  const toast = useToast()
  const utils = trpc.useUtils()
  const query = trpc.jobs.get.useQuery({ id })
  const transition = trpc.jobs.transition.useMutation()
  const canEdit = useHasPermission("jobs.edit")
  const canAssign = useHasPermission("jobs.assign")
  const canComplete = useHasPermission("jobs.complete")
  const canCancel = useHasPermission("jobs.cancel")
  const [dialog, setDialog] = useState<null | "complete" | "cancel">(null)
  const [text, setText] = useState("")

  if (query.isLoading) return <Skeleton className="h-[480px] w-full rounded-[var(--radius-lg)]" />
  if (query.isError || !query.data) {
    return (
      <div>
        <Button variant="ghost" size="sm" onClick={() => router.push("/jobs")}>
          <ArrowLeft className="h-4 w-4" />
          Back to dispatch
        </Button>
        <div className="mt-8">
          <WrongCompanyNotice entity="job" id={id}>
            <ErrorState
              title="Job not found"
              message="It may have been removed or belong to another company."
            />
          </WrongCompanyNotice>
        </div>
      </div>
    )
  }

  const job = query.data
  async function move(
    to: Job["status"],
    extra: { reason?: string; completionNotes?: string } = {},
  ) {
    try {
      await transition.mutateAsync({ id: job.id, to, ...extra })
      await utils.jobs.invalidate()
      toast.success(`Job ${JOB_STATUS_LABELS[to]?.toLowerCase()}`)
      setDialog(null)
      setText("")
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Status change failed")
    }
  }

  return (
    <div>
      <Button variant="ghost" size="sm" onClick={() => router.push("/jobs")}>
        <ArrowLeft className="h-4 w-4" />
        Back to dispatch
      </Button>
      <div className="mt-2 mb-6 flex flex-wrap items-center gap-3">
        <h1 className="text-text-primary text-[length:var(--text-display-md)] font-semibold">
          {job.jobNumber}
        </h1>
        <Badge variant={JOB_STATUS_BADGE[job.status] ?? "neutral"}>
          {JOB_STATUS_LABELS[job.status]}
        </Badge>
        <Link
          href={`/customers/${job.customerId}`}
          className="text-signal-600 text-sm hover:underline"
        >
          {job.customerName}
        </Link>
        {job.quoteId && (
          <Link href={`/quotes/${job.quoteId}`} className="text-text-muted text-sm hover:underline">
            Quote {job.quoteNumber}
          </Link>
        )}
        <div className="ml-auto flex flex-wrap gap-2">
          {canEdit && job.status === "scheduled" && (
            <Button size="sm" onClick={() => move("confirmed")}>
              <ThumbsUp className="h-4 w-4" />
              Confirm
            </Button>
          )}
          {canEdit && job.status === "confirmed" && (
            <Button size="sm" onClick={() => move("in_progress")}>
              <PlayCircle className="h-4 w-4" />
              Start
            </Button>
          )}
          {canComplete && job.status === "in_progress" && (
            <Button size="sm" onClick={() => setDialog("complete")}>
              <CheckCircle2 className="h-4 w-4" />
              Complete
            </Button>
          )}
          {canEdit && ["scheduled", "confirmed", "in_progress"].includes(job.status) && (
            <Button size="sm" variant="secondary" onClick={() => move("on_hold")}>
              <PauseCircle className="h-4 w-4" />
              On hold
            </Button>
          )}
          {canEdit && job.status === "on_hold" && (
            <Button size="sm" variant="secondary" onClick={() => move("scheduled")}>
              Resume
            </Button>
          )}
          {canCancel && ["scheduled", "confirmed", "on_hold"].includes(job.status) && (
            <Button size="sm" variant="dangerGhost" onClick={() => setDialog("cancel")}>
              <XCircle className="h-4 w-4" />
              Cancel job
            </Button>
          )}
        </div>
      </div>

      {job.conflicts.length > 0 && (
        <Card className="border-danger-600/40 mb-6">
          <CardContent className="space-y-2 py-4">
            <p className="text-text-primary text-sm font-semibold">Conflicts</p>
            <ConflictList conflicts={job.conflicts} />
          </CardContent>
        </Card>
      )}

      <div className="grid gap-6 xl:grid-cols-[1fr_320px]">
        <div className="min-w-0 space-y-6">
          <AssignmentCard
            key={`${job.id}-${job.crew.length}-${job.vehicles.length}`}
            job={job}
            canAssign={canAssign}
          />
          <ScheduleCard
            key={`${job.id}-${job.scheduledDate}-${job.startTime}`}
            job={job}
            canEdit={canEdit}
          />
        </div>
        <div className="space-y-4">
          <Card>
            <CardHeader>Move</CardHeader>
            <CardContent className="space-y-3 text-sm">
              <div>
                <p className="text-text-muted text-xs font-medium uppercase">From</p>
                <p className="text-text-primary">
                  {job.originAddress}, {job.originPostalCode} {job.originCity}
                </p>
                <p className="text-text-muted text-xs">
                  {job.originFloor !== null ? `Floor ${job.originFloor}` : ""}
                  {job.originFloor ? (job.originHasElevator ? " · lift" : " · no lift") : ""}
                </p>
              </div>
              <div>
                <p className="text-text-muted text-xs font-medium uppercase">To</p>
                <p className="text-text-primary">
                  {job.destAddress}, {job.destPostalCode} {job.destCity}
                </p>
                <p className="text-text-muted text-xs">
                  {job.destFloor !== null ? `Floor ${job.destFloor}` : ""}
                  {job.destFloor ? (job.destHasElevator ? " · lift" : " · no lift") : ""}
                </p>
              </div>
              <div className="border-surface-divider space-y-1 border-t pt-3">
                <div className="flex justify-between">
                  <span className="text-text-muted">Date</span>
                  <span>{formatDate(job.scheduledDate)}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-text-muted">Quote total</span>
                  <span className="tabular-nums">{formatChf(job.totalAmountCents)}</span>
                </div>
                {job.depositAmountCents > 0 && (
                  <div className="flex justify-between">
                    <span className="text-text-muted">Deposit</span>
                    <span className="tabular-nums">{formatChf(job.depositAmountCents)}</span>
                  </div>
                )}
              </div>
              {job.completionNotes && (
                <div className="border-surface-divider border-t pt-3">
                  <p className="text-text-muted text-xs font-medium uppercase">Completion notes</p>
                  <p className="text-text-secondary whitespace-pre-wrap">{job.completionNotes}</p>
                </div>
              )}
              {job.cancellationReason && (
                <div className="border-surface-divider border-t pt-3">
                  <p className="text-text-muted text-xs font-medium uppercase">Cancelled because</p>
                  <p className="text-text-secondary">{job.cancellationReason}</p>
                </div>
              )}
            </CardContent>
          </Card>
        </div>
      </div>

      <Dialog open={dialog !== null} onOpenChange={(o) => !o && setDialog(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{dialog === "complete" ? "Complete job" : "Cancel job"}</DialogTitle>
          </DialogHeader>
          <div className="py-2">
            <FieldLabel htmlFor="job-dialog-text" required={dialog === "cancel"}>
              {dialog === "complete" ? "Notes (damage, extra work, remarks)" : "Reason"}
            </FieldLabel>
            <Textarea
              id="job-dialog-text"
              rows={3}
              value={text}
              onChange={(e) => setText(e.target.value)}
            />
          </div>
          <DialogFooter>
            <Button variant="secondary" onClick={() => setDialog(null)}>
              Back
            </Button>
            <Button
              variant={dialog === "cancel" ? "danger" : "primary"}
              disabled={transition.isPending || (dialog === "cancel" && !text.trim())}
              onClick={() =>
                dialog === "complete"
                  ? move("completed", { completionNotes: text })
                  : move("cancelled", { reason: text })
              }
            >
              {dialog === "complete" ? "Complete" : "Cancel job"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
