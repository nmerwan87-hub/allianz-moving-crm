"use client"

import { use, useState } from "react"
import { useRouter } from "next/navigation"
import { ArrowLeft, Edit, Trash2, Mail, Phone, MapPin, Calendar, Tag, User } from "lucide-react"
import { trpc } from "@/lib/trpc/client"
import { PageHeader } from "@/app/(dashboard)/_components/ui/page-header"
import { Button } from "@/app/(dashboard)/_components/ui/button"
import { Badge } from "@/app/(dashboard)/_components/ui/badge"
import { Card, CardContent, CardHeader } from "@/app/(dashboard)/_components/ui/card"
import { Skeleton } from "@/app/(dashboard)/_components/ui/skeleton"
import { ErrorState } from "@/app/(dashboard)/_components/ui/error-state"
import { Select, Textarea, FieldLabel } from "@/app/(dashboard)/_components/ui/field"
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/app/(dashboard)/_components/ui/dialog"
import { useToast } from "@/app/(dashboard)/_components/ui/toast"
import { leadStatusEnum } from "@/modules/leads/interface"

const STATUS_BADGE: Record<
  string,
  "default" | "success" | "warning" | "danger" | "info" | "neutral"
> = {
  new: "info",
  contacted: "default",
  surveyed: "default",
  quoted: "warning",
  booked: "success",
  lost: "danger",
  duplicate: "neutral",
}

function formatLabel(s: string | null): string {
  if (!s) return "—"
  return s.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase())
}

function formatDate(dateStr: string | null): string {
  if (!dateStr) return "—"
  const d = new Date(dateStr)
  return d.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })
}

function formatDateTime(dateStr: string | null): string {
  if (!dateStr) return "—"
  const d = new Date(dateStr)
  return d.toLocaleString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  })
}

interface DetailRowProps {
  label: string
  value: string | null | undefined
}

function DetailRow({ label, value }: DetailRowProps) {
  return (
    <div className="flex flex-col gap-0.5">
      <dt className="text-text-muted text-xs font-medium tracking-wide uppercase">{label}</dt>
      <dd className="text-text-primary text-sm whitespace-pre-line">{value || "—"}</dd>
    </div>
  )
}

export default function LeadDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params)
  const router = useRouter()
  const toast = useToast()

  const query = trpc.leads.getById.useQuery({ id })
  const updateStatusMutation = trpc.leads.updateStatus.useMutation()
  const deleteMutation = trpc.leads.delete.useMutation()

  const [statusDialogOpen, setStatusDialogOpen] = useState(false)
  const [newStatus, setNewStatus] = useState("")
  const [lostReason, setLostReason] = useState("")
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false)

  const lead = query.data

  const handleStatusChange = async () => {
    if (!newStatus) return
    try {
      await updateStatusMutation.mutateAsync({
        id,
        status: newStatus as (typeof leadStatusEnum)["options"][number],
        lostReason: newStatus === "lost" ? lostReason : undefined,
      })
      toast.success("Status updated")
      setStatusDialogOpen(false)
      setNewStatus("")
      setLostReason("")
      query.refetch()
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to update status")
    }
  }

  const handleDelete = async () => {
    try {
      await deleteMutation.mutateAsync({ id })
      toast.success("Lead archived")
      router.push("/leads")
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to archive lead")
    }
  }

  if (query.isLoading) {
    return (
      <div>
        <PageHeader title="Loading lead..." />
        <div className="grid gap-4 lg:grid-cols-3">
          <div className="space-y-4 lg:col-span-2">
            <Skeleton className="h-64 w-full rounded-[var(--radius-lg)]" />
            <Skeleton className="h-48 w-full rounded-[var(--radius-lg)]" />
          </div>
          <Skeleton className="h-64 w-full rounded-[var(--radius-lg)]" />
        </div>
      </div>
    )
  }

  if (query.isError || !lead) {
    return (
      <div>
        <Button variant="ghost" size="sm" onClick={() => router.push("/leads")}>
          <ArrowLeft className="h-4 w-4" />
          Back to leads
        </Button>
        <div className="mt-8">
          <ErrorState
            title="Lead not found"
            message="This lead may have been archived or you may not have access to it."
          />
        </div>
      </div>
    )
  }

  return (
    <div>
      <div className="mb-4 flex items-center justify-between">
        <Button variant="ghost" size="sm" onClick={() => router.push("/leads")}>
          <ArrowLeft className="h-4 w-4" />
          Back to leads
        </Button>
        <div className="flex gap-2">
          <Button variant="secondary" size="sm" onClick={() => router.push(`/leads/${id}/edit`)}>
            <Edit className="h-4 w-4" />
            Edit
          </Button>
          <Button variant="dangerGhost" size="sm" onClick={() => setDeleteDialogOpen(true)}>
            <Trash2 className="h-4 w-4" />
            Archive
          </Button>
        </div>
      </div>

      <PageHeader
        title={`${lead.firstName} ${lead.lastName}`}
        description={`Lead created ${formatDate(lead.createdAt)}`}
        actions={
          <Badge variant={STATUS_BADGE[lead.status] ?? "neutral"}>{formatLabel(lead.status)}</Badge>
        }
      />

      <div className="grid gap-4 lg:grid-cols-3">
        {/* Left column — main info */}
        <div className="space-y-4 lg:col-span-2">
          {/* Contact */}
          <Card>
            <CardHeader>Contact Information</CardHeader>
            <CardContent className="grid gap-4 sm:grid-cols-2">
              <div className="text-text-primary flex items-center gap-2 text-sm">
                <Mail className="text-text-muted h-4 w-4" />
                {lead.email ?? "—"}
              </div>
              <div className="text-text-primary flex items-center gap-2 text-sm">
                <Phone className="text-text-muted h-4 w-4" />
                {lead.phone ?? "—"}
              </div>
            </CardContent>
          </Card>

          {/* Move details */}
          <Card>
            <CardHeader>Move Details</CardHeader>
            <CardContent className="grid gap-4 sm:grid-cols-2">
              <DetailRow label="Move type" value={formatLabel(lead.moveType)} />
              <DetailRow label="Property size" value={formatLabel(lead.propertySize)} />
              <DetailRow
                label="Requested date"
                value={lead.requestedDate ? formatDate(lead.requestedDate) : "—"}
              />
              <DetailRow label="Date flexible" value={lead.dateFlexible ? "Yes" : "No"} />
              <DetailRow
                label="Estimated volume"
                value={lead.estimatedVolumeCuft ? `${lead.estimatedVolumeCuft} cu ft` : null}
              />
              <DetailRow
                label="Estimated distance"
                value={lead.estimatedDistanceMiles ? `${lead.estimatedDistanceMiles} miles` : null}
              />
            </CardContent>
          </Card>

          {/* Origin address */}
          <Card>
            <CardHeader>
              <span className="flex items-center gap-2">
                <MapPin className="text-text-muted h-4 w-4" />
                Origin Address
              </span>
            </CardHeader>
            <CardContent className="grid gap-4 sm:grid-cols-2">
              <DetailRow label="Street" value={lead.originAddress} />
              <DetailRow label="City" value={lead.originCity} />
              <DetailRow label="State / Province" value={lead.originState} />
              <DetailRow label="Postal code" value={lead.originPostalCode} />
              <DetailRow label="Country" value={lead.originCountry} />
              <DetailRow label="Floor" value={lead.originFloor?.toString() ?? null} />
              <DetailRow label="Elevator" value={lead.originHasElevator ? "Yes" : "No"} />
              <DetailRow label="Stairs" value={lead.originHasStairs ? "Yes" : "No"} />
              <div className="sm:col-span-2">
                <DetailRow label="Parking notes" value={lead.originParkingNotes} />
              </div>
            </CardContent>
          </Card>

          {/* Destination address */}
          <Card>
            <CardHeader>
              <span className="flex items-center gap-2">
                <MapPin className="text-text-muted h-4 w-4" />
                Destination Address
              </span>
            </CardHeader>
            <CardContent className="grid gap-4 sm:grid-cols-2">
              <DetailRow label="Street" value={lead.destAddress} />
              <DetailRow label="City" value={lead.destCity} />
              <DetailRow label="State / Province" value={lead.destState} />
              <DetailRow label="Postal code" value={lead.destPostalCode} />
              <DetailRow label="Country" value={lead.destCountry} />
              <DetailRow label="Floor" value={lead.destFloor?.toString() ?? null} />
              <DetailRow label="Elevator" value={lead.destHasElevator ? "Yes" : "No"} />
              <DetailRow label="Stairs" value={lead.destHasStairs ? "Yes" : "No"} />
              <div className="sm:col-span-2">
                <DetailRow label="Parking notes" value={lead.destParkingNotes} />
              </div>
            </CardContent>
          </Card>

          {/* Notes */}
          {lead.internalNotes && (
            <Card>
              <CardHeader>Internal Notes</CardHeader>
              <CardContent>
                <p className="text-text-secondary text-sm whitespace-pre-line">
                  {lead.internalNotes}
                </p>
              </CardContent>
            </Card>
          )}
        </div>

        {/* Right column — sidebar info */}
        <div className="space-y-4">
          {/* Status control */}
          <Card>
            <CardHeader>
              <span className="flex items-center gap-2">
                <Tag className="text-text-muted h-4 w-4" />
                Lead Status
              </span>
            </CardHeader>
            <CardContent className="space-y-3">
              <div className="flex items-center justify-between">
                <Badge variant={STATUS_BADGE[lead.status] ?? "neutral"}>
                  {formatLabel(lead.status)}
                </Badge>
                <Button
                  variant="secondary"
                  size="sm"
                  onClick={() => {
                    setNewStatus(lead.status)
                    setStatusDialogOpen(true)
                  }}
                >
                  Change
                </Button>
              </div>
              {lead.lostReason && (
                <div>
                  <p className="text-text-muted text-xs font-medium tracking-wide uppercase">
                    Lost reason
                  </p>
                  <p className="text-text-secondary mt-1 text-sm">{lead.lostReason}</p>
                </div>
              )}
              {lead.convertedAt && (
                <div>
                  <p className="text-text-muted text-xs font-medium tracking-wide uppercase">
                    Converted at
                  </p>
                  <p className="text-text-secondary mt-1 text-sm">
                    {formatDateTime(lead.convertedAt)}
                  </p>
                </div>
              )}
            </CardContent>
          </Card>

          {/* Acquisition */}
          <Card>
            <CardHeader>
              <span className="flex items-center gap-2">
                <Tag className="text-text-muted h-4 w-4" />
                Acquisition
              </span>
            </CardHeader>
            <CardContent className="space-y-3">
              <DetailRow label="Source" value={formatLabel(lead.source)} />
              <DetailRow label="UTM source" value={lead.utmSource} />
              <DetailRow label="UTM medium" value={lead.utmMedium} />
              <DetailRow label="UTM campaign" value={lead.utmCampaign} />
              <DetailRow label="Referrer URL" value={lead.referrerUrl} />
            </CardContent>
          </Card>

          {/* Assignment */}
          <Card>
            <CardHeader>
              <span className="flex items-center gap-2">
                <User className="text-text-muted h-4 w-4" />
                Assignment
              </span>
            </CardHeader>
            <CardContent>
              <DetailRow label="Assigned to" value={lead.assignedToName} />
            </CardContent>
          </Card>

          {/* Timestamps */}
          <Card>
            <CardHeader>
              <span className="flex items-center gap-2">
                <Calendar className="text-text-muted h-4 w-4" />
                Timestamps
              </span>
            </CardHeader>
            <CardContent className="space-y-3">
              <DetailRow label="Created" value={formatDateTime(lead.createdAt)} />
              <DetailRow label="Updated" value={formatDateTime(lead.updatedAt)} />
            </CardContent>
          </Card>
        </div>
      </div>

      {/* Status change dialog */}
      <Dialog open={statusDialogOpen} onOpenChange={setStatusDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Change lead status</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div>
              <FieldLabel htmlFor="newStatus">New status</FieldLabel>
              <Select
                id="newStatus"
                value={newStatus}
                onChange={(e) => setNewStatus(e.target.value)}
              >
                {leadStatusEnum.options.map((s) => (
                  <option key={s} value={s}>
                    {formatLabel(s)}
                  </option>
                ))}
              </Select>
            </div>
            {newStatus === "lost" && (
              <div>
                <FieldLabel htmlFor="lostReason">Lost reason (optional)</FieldLabel>
                <Textarea
                  id="lostReason"
                  rows={3}
                  value={lostReason}
                  onChange={(e) => setLostReason(e.target.value)}
                  placeholder="Why was this lead lost?"
                />
              </div>
            )}
          </div>
          <DialogFooter>
            <Button variant="secondary" onClick={() => setStatusDialogOpen(false)}>
              Cancel
            </Button>
            <Button
              onClick={handleStatusChange}
              disabled={!newStatus || updateStatusMutation.isPending}
            >
              {updateStatusMutation.isPending ? "Saving..." : "Update Status"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete confirmation dialog */}
      <Dialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Archive this lead?</DialogTitle>
          </DialogHeader>
          <p className="text-text-secondary py-2 text-sm">
            Are you sure you want to archive the lead for {lead.firstName} {lead.lastName}? This
            will remove it from your active pipeline. The data is preserved and can be restored
            later.
          </p>
          <DialogFooter>
            <Button variant="secondary" onClick={() => setDeleteDialogOpen(false)}>
              Cancel
            </Button>
            <Button variant="danger" onClick={handleDelete} disabled={deleteMutation.isPending}>
              {deleteMutation.isPending ? "Archiving..." : "Archive Lead"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
