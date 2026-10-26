"use client"

import { useState } from "react"
import { Button } from "@/app/(dashboard)/_components/ui/button"
import { Textarea, FieldLabel } from "@/app/(dashboard)/_components/ui/field"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/app/(dashboard)/_components/ui/dialog"

/** Confirmation that needs a written reason (void, write-off, payment cancellation). */
export function ReasonDialog({
  title,
  description,
  confirmLabel,
  pending,
  onConfirm,
  onClose,
}: {
  title: string
  description: string
  confirmLabel: string
  pending: boolean
  onConfirm: (reason: string) => void
  onClose: () => void
}) {
  const [reason, setReason] = useState("")
  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          <DialogDescription>{description}</DialogDescription>
        </DialogHeader>
        <div className="py-2">
          <FieldLabel htmlFor="reason-text" required>
            Reason
          </FieldLabel>
          <Textarea
            id="reason-text"
            rows={3}
            value={reason}
            onChange={(e) => setReason(e.target.value)}
          />
        </div>
        <DialogFooter>
          <Button variant="secondary" onClick={onClose} disabled={pending}>
            Back
          </Button>
          <Button
            variant="danger"
            disabled={pending || !reason.trim()}
            onClick={() => onConfirm(reason.trim())}
          >
            {confirmLabel}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
