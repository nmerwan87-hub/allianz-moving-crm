"use client"

import { useState } from "react"
import { CalendarOff, Pencil, Plus, Trash2, UserCog } from "lucide-react"
import { trpc } from "@/lib/trpc/client"
import { formatPhone } from "@/lib/format/phone"
import { formatCents, parseToCents } from "@/lib/format/money"
import { PageHeader } from "@/app/(dashboard)/_components/ui/page-header"
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
import { createEmployeeInput, employeeRoleEnum, type Employee } from "@/modules/crew/interface"
import { EMPLOYEE_ROLE_LABELS, formatDate, isoDate, addDays } from "../jobs/_lib/labels"

const ABSENCE_LABELS: Record<string, string> = {
  vacation: "Vacation",
  sick: "Sick",
  other: "Other",
}

function EmployeeDialog({
  employee,
  isOwner,
  onClose,
}: {
  employee?: Employee
  isOwner: boolean
  onClose: () => void
}) {
  const toast = useToast()
  const utils = trpc.useUtils()
  const create = trpc.crew.employees.create.useMutation()
  const update = trpc.crew.employees.update.useMutation()
  const [form, setForm] = useState({
    firstName: employee?.firstName ?? "",
    lastName: employee?.lastName ?? "",
    role: employee?.role ?? "mover",
    status: employee?.status ?? "active",
    phone: formatPhone(employee?.phone) ?? "",
    email: employee?.email ?? "",
    hourlyCost: employee?.hourlyCostCents ? formatCents(employee.hourlyCostCents) : "",
    driverLicenseClass: employee?.driverLicenseClass ?? "",
    driverLicenseExpiry: employee?.driverLicenseExpiry ?? "",
    notes: employee?.notes ?? "",
  })
  const [error, setError] = useState<string | null>(null)
  const set =
    (key: keyof typeof form) =>
    (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) =>
      setForm((f) => ({ ...f, [key]: e.target.value }))

  async function save() {
    const parsed = createEmployeeInput.safeParse({
      ...form,
      hourlyCostCents: form.hourlyCost ? parseToCents(form.hourlyCost) : null,
      driverLicenseExpiry: form.driverLicenseExpiry || null,
      skills: employee?.skills ?? [],
    })
    if (!parsed.success) return setError(parsed.error.issues[0]?.message ?? "Check the form")
    try {
      if (employee) await update.mutateAsync({ id: employee.id, ...parsed.data })
      else await create.mutateAsync(parsed.data)
      await utils.crew.employees.list.invalidate()
      toast.success("Employee saved")
      onClose()
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to save")
    }
  }

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{employee ? "Edit employee" : "Add employee"}</DialogTitle>
        </DialogHeader>
        <div className="grid max-h-[65vh] gap-3 overflow-y-auto py-1 sm:grid-cols-2">
          <div>
            <FieldLabel htmlFor="em-first" required>
              First name
            </FieldLabel>
            <Input id="em-first" value={form.firstName} onChange={set("firstName")} />
          </div>
          <div>
            <FieldLabel htmlFor="em-last" required>
              Last name
            </FieldLabel>
            <Input id="em-last" value={form.lastName} onChange={set("lastName")} />
          </div>
          <div>
            <FieldLabel htmlFor="em-role">Role</FieldLabel>
            <Select id="em-role" value={form.role} onChange={set("role")}>
              {employeeRoleEnum.options.map((r) => (
                <option key={r} value={r}>
                  {EMPLOYEE_ROLE_LABELS[r]}
                </option>
              ))}
            </Select>
          </div>
          <div>
            <FieldLabel htmlFor="em-status">Status</FieldLabel>
            <Select id="em-status" value={form.status} onChange={set("status")}>
              <option value="active">Active</option>
              <option value="inactive">Inactive</option>
            </Select>
          </div>
          <div>
            <FieldLabel htmlFor="em-phone">Mobile</FieldLabel>
            <Input id="em-phone" type="tel" value={form.phone} onChange={set("phone")} />
          </div>
          <div>
            <FieldLabel htmlFor="em-email">E-mail</FieldLabel>
            <Input id="em-email" type="email" value={form.email} onChange={set("email")} />
          </div>
          <div>
            <FieldLabel htmlFor="em-licence">Driving licence class</FieldLabel>
            <Input
              id="em-licence"
              placeholder="B, C1, C"
              value={form.driverLicenseClass}
              onChange={set("driverLicenseClass")}
            />
          </div>
          <div>
            <FieldLabel htmlFor="em-licence-exp">Licence valid until</FieldLabel>
            <Input
              id="em-licence-exp"
              type="date"
              value={form.driverLicenseExpiry}
              onChange={set("driverLicenseExpiry")}
            />
          </div>
          {isOwner && (
            <div>
              <FieldLabel htmlFor="em-cost">Hourly cost (CHF)</FieldLabel>
              <Input
                id="em-cost"
                inputMode="decimal"
                value={form.hourlyCost}
                onChange={set("hourlyCost")}
              />
            </div>
          )}
          <div className="sm:col-span-2">
            <FieldLabel htmlFor="em-notes">Notes</FieldLabel>
            <Textarea id="em-notes" rows={2} value={form.notes} onChange={set("notes")} />
          </div>
          {error && (
            <div className="sm:col-span-2">
              <FieldError message={error} />
            </div>
          )}
        </div>
        <DialogFooter>
          <Button variant="secondary" onClick={onClose}>
            Cancel
          </Button>
          <Button onClick={save} disabled={create.isPending || update.isPending}>
            Save
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

function AbsenceDialog({ employees, onClose }: { employees: Employee[]; onClose: () => void }) {
  const toast = useToast()
  const utils = trpc.useUtils()
  const create = trpc.crew.absences.create.useMutation()
  const today = isoDate(new Date())
  const [form, setForm] = useState({
    employeeId: employees[0]?.id ?? "",
    kind: "vacation",
    startsOn: today,
    endsOn: today,
    note: "",
  })
  const set =
    (key: keyof typeof form) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) =>
      setForm((f) => ({ ...f, [key]: e.target.value }))

  async function save() {
    try {
      await create.mutateAsync({ ...form, kind: form.kind as "vacation" | "sick" | "other" })
      await Promise.all([utils.crew.absences.invalidate(), utils.jobs.invalidate()])
      toast.success("Absence saved")
      onClose()
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to save")
    }
  }

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Add absence</DialogTitle>
        </DialogHeader>
        <div className="grid gap-3 py-1 sm:grid-cols-2">
          <div className="sm:col-span-2">
            <FieldLabel htmlFor="ab-emp">Employee</FieldLabel>
            <Select id="ab-emp" value={form.employeeId} onChange={set("employeeId")}>
              {employees.map((e) => (
                <option key={e.id} value={e.id}>
                  {e.name}
                </option>
              ))}
            </Select>
          </div>
          <div className="sm:col-span-2">
            <FieldLabel htmlFor="ab-kind">Type</FieldLabel>
            <Select id="ab-kind" value={form.kind} onChange={set("kind")}>
              {Object.entries(ABSENCE_LABELS).map(([v, l]) => (
                <option key={v} value={v}>
                  {l}
                </option>
              ))}
            </Select>
          </div>
          <div>
            <FieldLabel htmlFor="ab-from">From</FieldLabel>
            <Input id="ab-from" type="date" value={form.startsOn} onChange={set("startsOn")} />
          </div>
          <div>
            <FieldLabel htmlFor="ab-to">To</FieldLabel>
            <Input id="ab-to" type="date" value={form.endsOn} onChange={set("endsOn")} />
          </div>
          <div className="sm:col-span-2">
            <FieldLabel htmlFor="ab-note">Note</FieldLabel>
            <Input id="ab-note" value={form.note} onChange={set("note")} />
          </div>
        </div>
        <DialogFooter>
          <Button variant="secondary" onClick={onClose}>
            Cancel
          </Button>
          <Button onClick={save} disabled={create.isPending || !form.employeeId}>
            Save
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

export default function EmployeesPage() {
  const toast = useToast()
  const utils = trpc.useUtils()
  const me = trpc.iam.session.me.useQuery()
  const employees = trpc.crew.employees.list.useQuery()
  const today = isoDate(new Date())
  const absences = trpc.crew.absences.list.useQuery({
    from: today,
    to: isoDate(addDays(new Date(), 60)),
  })
  const removeAbsence = trpc.crew.absences.remove.useMutation()
  const canCreate = useHasPermission("employees.create")
  const canEdit = useHasPermission("employees.edit")
  const [editing, setEditing] = useState<Employee | "new" | null>(null)
  const [absenceOpen, setAbsenceOpen] = useState(false)
  const active = (employees.data ?? []).filter((e) => e.status === "active")

  return (
    <div className="space-y-6">
      <PageHeader
        title="Employees"
        description="Your crew for planning. Employees do not need a login."
        actions={
          <div className="flex gap-2">
            {canEdit && active.length > 0 && (
              <Button variant="secondary" onClick={() => setAbsenceOpen(true)}>
                <CalendarOff className="h-4 w-4" />
                Add absence
              </Button>
            )}
            {canCreate && (
              <Button onClick={() => setEditing("new")}>
                <Plus className="h-4 w-4" />
                Add employee
              </Button>
            )}
          </div>
        }
      />

      {employees.isLoading ? (
        <Skeleton className="h-64 w-full rounded-[var(--radius-lg)]" />
      ) : (employees.data ?? []).length === 0 ? (
        <EmptyState
          icon={UserCog}
          title="No employees yet"
          description="Add your crew to plan jobs and see conflicts."
        />
      ) : (
        <Card className="overflow-hidden p-0">
          <table className="w-full border-collapse text-sm">
            <thead>
              <tr className="border-surface-divider text-text-muted border-b text-left text-xs font-semibold tracking-wide uppercase">
                <th className="px-4 py-2.5">Name</th>
                <th className="px-4 py-2.5">Role</th>
                <th className="hidden px-4 py-2.5 md:table-cell">Mobile</th>
                <th className="hidden px-4 py-2.5 lg:table-cell">Licence</th>
                <th className="px-4 py-2.5">Status</th>
                {canEdit && <th className="px-4 py-2.5" />}
              </tr>
            </thead>
            <tbody>
              {(employees.data ?? []).map((e) => (
                <tr key={e.id} className="border-surface-divider border-b last:border-0">
                  <td className="text-text-primary px-4 py-3 font-medium">{e.name}</td>
                  <td className="text-text-secondary px-4 py-3">{EMPLOYEE_ROLE_LABELS[e.role]}</td>
                  <td className="text-text-secondary hidden px-4 py-3 md:table-cell">
                    {formatPhone(e.phone) || "—"}
                  </td>
                  <td className="text-text-secondary hidden px-4 py-3 lg:table-cell">
                    {e.driverLicenseClass ?? "—"}
                    {e.driverLicenseExpiry ? ` · until ${formatDate(e.driverLicenseExpiry)}` : ""}
                  </td>
                  <td className="px-4 py-3">
                    <Badge variant={e.status === "active" ? "success" : "neutral"}>
                      {e.status === "active" ? "Active" : "Inactive"}
                    </Badge>
                  </td>
                  {canEdit && (
                    <td className="px-2 py-3 text-right">
                      <Button
                        variant="ghost"
                        size="icon"
                        aria-label={`Edit ${e.name}`}
                        onClick={() => setEditing(e)}
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

      <Card>
        <CardHeader>Absences (next 60 days)</CardHeader>
        <CardContent>
          {(absences.data ?? []).length === 0 ? (
            <p className="text-text-muted text-sm">No absences planned.</p>
          ) : (
            <ul className="divide-surface-divider divide-y">
              {(absences.data ?? []).map((a) => (
                <li key={a.id} className="flex items-center justify-between gap-3 py-2 text-sm">
                  <span className="text-text-primary">
                    {a.employeeName} — {ABSENCE_LABELS[a.kind]} {formatDate(a.startsOn)}
                    {a.endsOn !== a.startsOn ? ` – ${formatDate(a.endsOn)}` : ""}
                    {a.note ? <span className="text-text-muted"> · {a.note}</span> : null}
                  </span>
                  {canEdit && (
                    <Button
                      variant="dangerGhost"
                      size="icon"
                      aria-label="Remove absence"
                      onClick={async () => {
                        await removeAbsence.mutateAsync({ id: a.id })
                        await Promise.all([
                          utils.crew.absences.invalidate(),
                          utils.jobs.invalidate(),
                        ])
                        toast.success("Absence removed")
                      }}
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  )}
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>

      {editing && (
        <EmployeeDialog
          {...(editing === "new" ? {} : { employee: editing })}
          isOwner={me.data?.role === "owner"}
          onClose={() => setEditing(null)}
        />
      )}
      {absenceOpen && <AbsenceDialog employees={active} onClose={() => setAbsenceOpen(false)} />}
    </div>
  )
}
