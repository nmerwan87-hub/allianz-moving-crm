"use client"

import { useMemo, useState } from "react"
import Link from "next/link"
import { AlertTriangle, ChevronLeft, ChevronRight, Plus, Truck, Users } from "lucide-react"
import { trpc } from "@/lib/trpc/client"
import { PageHeader } from "@/app/(dashboard)/_components/ui/page-header"
import { Button } from "@/app/(dashboard)/_components/ui/button"
import { Badge } from "@/app/(dashboard)/_components/ui/badge"
import { Card } from "@/app/(dashboard)/_components/ui/card"
import { Skeleton } from "@/app/(dashboard)/_components/ui/skeleton"
import { ErrorState } from "@/app/(dashboard)/_components/ui/error-state"
import { useHasPermission } from "@/app/(dashboard)/_lib/permissions"
import { cn } from "@/app/(dashboard)/_lib/cn"
import type { JobCard } from "@/modules/jobs/interface"
import { NewJobDialog } from "./_components/new-job-dialog"
import {
  JOB_STATUS_BADGE,
  JOB_STATUS_LABELS,
  addDays,
  dayHeading,
  isoDate,
  mondayOf,
} from "./_lib/labels"

function JobTile({ job }: { job: JobCard }) {
  const closed = job.status === "completed" || job.status === "cancelled"
  const missingCrew = job.crewSizeRequired !== null && job.crew.length < job.crewSizeRequired
  return (
    <Link href={`/jobs/${job.id}`}>
      <Card
        className={cn(
          "hover:border-signal-400 space-y-1.5 p-2.5 text-xs transition-colors",
          job.conflictCount > 0 && "border-danger-600/60",
          closed && "opacity-60",
        )}
      >
        <div className="flex flex-wrap items-center justify-between gap-1">
          <span className="text-text-primary font-semibold">{job.startTime ?? "—"}</span>
          <Badge variant={JOB_STATUS_BADGE[job.status] ?? "neutral"}>
            {JOB_STATUS_LABELS[job.status]}
          </Badge>
        </div>
        <div className="text-text-primary truncate font-medium">{job.customerName}</div>
        <div className="text-text-muted truncate">
          {job.originCity} → {job.destCity}
        </div>
        <div
          className={cn(
            "flex items-center gap-1",
            missingCrew ? "text-warning-700" : "text-text-secondary",
          )}
        >
          <Users className="h-3 w-3 shrink-0" />
          <span className="truncate">
            {job.crew.length ? job.crew.map((c) => c.name.split(" ")[0]).join(", ") : "No crew"}
            {job.crewSizeRequired ? ` (${job.crew.length}/${job.crewSizeRequired})` : ""}
          </span>
        </div>
        {job.vehicles.length > 0 && (
          <div className="text-text-secondary flex items-center gap-1">
            <Truck className="h-3 w-3 shrink-0" />
            <span className="truncate">{job.vehicles.map((v) => v.name).join(", ")}</span>
          </div>
        )}
        {job.conflictCount > 0 && (
          <div className="text-danger-700 flex items-center gap-1 font-medium">
            <AlertTriangle className="h-3 w-3" />
            {job.conflictCount} conflict{job.conflictCount > 1 ? "s" : ""}
          </div>
        )}
      </Card>
    </Link>
  )
}

export default function DispatchBoardPage() {
  const canCreate = useHasPermission("jobs.create")
  const [weekStart, setWeekStart] = useState(() => mondayOf(new Date()))
  const [newOpen, setNewOpen] = useState(false)
  const days = useMemo(
    () => Array.from({ length: 7 }, (_, i) => addDays(weekStart, i)),
    [weekStart],
  )
  const from = isoDate(days[0]!)
  const to = isoDate(days[6]!)
  const today = isoDate(new Date())

  const jobs = trpc.jobs.list.useQuery({ from, to })
  const absences = trpc.crew.absences.list.useQuery({ from, to })

  const byDay = useMemo(() => {
    const map = new Map<string, JobCard[]>()
    for (const job of jobs.data ?? []) {
      if (!map.has(job.scheduledDate)) map.set(job.scheduledDate, [])
      map.get(job.scheduledDate)!.push(job)
    }
    return map
  }, [jobs.data])

  const weekLabel = `${dayHeading(days[0]!)} – ${dayHeading(days[6]!)}${days[6]!.getFullYear()}`

  return (
    <div>
      <PageHeader
        title="Jobs & dispatch"
        description="Plan crews and vehicles. Conflicts are checked automatically."
        actions={
          canCreate ? (
            <Button onClick={() => setNewOpen(true)}>
              <Plus className="h-4 w-4" />
              New job
            </Button>
          ) : undefined
        }
      />

      <div className="mb-4 flex flex-wrap items-center gap-2">
        <Button
          variant="secondary"
          size="sm"
          aria-label="Previous week"
          onClick={() => setWeekStart((w) => addDays(w, -7))}
        >
          <ChevronLeft className="h-4 w-4" />
        </Button>
        <Button variant="secondary" size="sm" onClick={() => setWeekStart(mondayOf(new Date()))}>
          This week
        </Button>
        <Button
          variant="secondary"
          size="sm"
          aria-label="Next week"
          onClick={() => setWeekStart((w) => addDays(w, 7))}
        >
          <ChevronRight className="h-4 w-4" />
        </Button>
        <span className="text-text-primary ml-2 text-sm font-semibold">{weekLabel}</span>
      </div>

      {jobs.isError ? (
        <ErrorState title="Couldn't load jobs" message="Please try again." />
      ) : (
        <div className="grid grid-cols-1 gap-3 overflow-x-auto pb-2 md:grid-cols-[repeat(7,minmax(168px,1fr))]">
          {days.map((date) => {
            const key = isoDate(date)
            const dayJobs = byDay.get(key) ?? []
            const away = (absences.data ?? []).filter((a) => a.startsOn <= key && a.endsOn >= key)
            return (
              <div
                key={key}
                className={cn(
                  "bg-surface-sunken min-h-40 rounded-[var(--radius-lg)] p-2",
                  key === today && "ring-signal-400 ring-2",
                )}
              >
                <div className="mb-2 flex items-center justify-between">
                  <span
                    className={cn(
                      "text-sm font-semibold",
                      key === today ? "text-signal-600" : "text-text-primary",
                    )}
                  >
                    {dayHeading(date)}
                  </span>
                  {dayJobs.length > 0 && (
                    <span className="text-text-muted text-xs">{dayJobs.length}</span>
                  )}
                </div>
                <div className="space-y-2">
                  {jobs.isLoading ? (
                    <Skeleton className="h-20 w-full" />
                  ) : (
                    dayJobs.map((job) => <JobTile key={job.id} job={job} />)
                  )}
                </div>
                {away.length > 0 && (
                  <p className="text-text-muted mt-2 text-[11px]" title="Absent">
                    Away: {away.map((a) => a.employeeName.split(" ")[0]).join(", ")}
                  </p>
                )}
              </div>
            )
          })}
        </div>
      )}

      <NewJobDialog open={newOpen} onOpenChange={setNewOpen} defaultDate={today} />
    </div>
  )
}
