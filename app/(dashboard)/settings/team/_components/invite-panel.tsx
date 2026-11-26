"use client"

import { useState } from "react"
import { Copy, MailPlus, X } from "lucide-react"
import { trpc } from "@/lib/trpc/client"
import { Button } from "@/app/(dashboard)/_components/ui/button"
import { Input, FieldLabel, FieldError } from "@/app/(dashboard)/_components/ui/field"
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/app/(dashboard)/_components/ui/dialog"
import { useToast } from "@/app/(dashboard)/_components/ui/toast"
import { formatDate } from "../../../quotes/_lib/labels"

interface Group {
  id: string
  name: string
}

/** "Mitarbeitende einladen" and the open invitations of the company (owner only). */
export function InvitePanel({ groups }: { groups: Group[] }) {
  const toast = useToast()
  const utils = trpc.useUtils()
  const invitations = trpc.iam.listInvitations.useQuery()
  const revoke = trpc.iam.revokeInvitation.useMutation()
  const [open, setOpen] = useState(false)

  return (
    <div className="mb-6">
      <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
        <p className="text-text-secondary text-sm">
          Büro-Mitarbeitende bekommen eine Einladung per E-Mail und legen ihr Passwort selbst fest.
        </p>
        <Button onClick={() => setOpen(true)}>
          <MailPlus className="h-4 w-4" />
          Mitarbeitende einladen
        </Button>
      </div>

      {(invitations.data ?? []).length > 0 && (
        <div className="border-surface-divider bg-surface-raised rounded-[var(--radius-lg)] border px-5 py-3">
          <p className="text-text-primary mb-1 text-sm font-semibold">Offene Einladungen</p>
          <ul className="divide-surface-divider divide-y text-sm">
            {invitations.data!.map((i) => (
              <li key={i.id} className="flex items-center gap-3 py-2">
                <span className="text-text-primary min-w-0 flex-1 truncate">{i.email}</span>
                <span className="text-text-muted text-xs">
                  gültig bis {formatDate(i.expiresAt)}
                </span>
                <Button
                  variant="ghost"
                  size="sm"
                  disabled={revoke.isPending}
                  onClick={async () => {
                    try {
                      await revoke.mutateAsync({ invitationId: i.id })
                      await utils.iam.listInvitations.invalidate()
                      toast.success("Einladung zurückgezogen")
                    } catch (err) {
                      toast.error(err instanceof Error ? err.message : "Fehlgeschlagen")
                    }
                  }}
                >
                  <X className="h-4 w-4" />
                  Zurückziehen
                </Button>
              </li>
            ))}
          </ul>
        </div>
      )}

      {open && <InviteDialog groups={groups} onClose={() => setOpen(false)} />}
    </div>
  )
}

function InviteDialog({ groups, onClose }: { groups: Group[]; onClose: () => void }) {
  const toast = useToast()
  const utils = trpc.useUtils()
  const invite = trpc.iam.inviteUser.useMutation()
  const [email, setEmail] = useState("")
  const [selected, setSelected] = useState<Set<string>>(new Set())
  const [error, setError] = useState<string | null>(null)
  const [result, setResult] = useState<{ url: string; emailSent: boolean } | null>(null)

  async function submit() {
    setError(null)
    if (!/^\S+@\S+\.\S+$/.test(email.trim())) return setError("Gültige E-Mail-Adresse eingeben.")
    try {
      const r = await invite.mutateAsync({
        email: email.trim(),
        permissionGroupIds: [...selected],
      })
      await utils.iam.listInvitations.invalidate()
      setResult({ url: r.inviteUrl, emailSent: r.emailSent })
    } catch (err) {
      setError(err instanceof Error ? err.message : "Einladen fehlgeschlagen")
    }
  }

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Mitarbeitende einladen</DialogTitle>
        </DialogHeader>
        {result ? (
          <div className="space-y-3 py-1 text-sm">
            <p className="text-text-primary">
              {result.emailSent
                ? `Die Einladung ist per E-Mail an ${email} unterwegs.`
                : "Die E-Mail konnte nicht gesendet werden (kein E-Mail-Versand eingerichtet). Schicken Sie den Link selbst, z. B. per WhatsApp:"}
            </p>
            <div className="flex gap-2">
              <Input readOnly value={result.url} onFocus={(e) => e.target.select()} />
              <Button
                variant="secondary"
                onClick={async () => {
                  await navigator.clipboard.writeText(result.url)
                  toast.success("Link kopiert")
                }}
              >
                <Copy className="h-4 w-4" />
                Kopieren
              </Button>
            </div>
            <p className="text-text-muted text-xs">
              Der Link gilt 7 Tage und nur für diese E-Mail-Adresse.
            </p>
          </div>
        ) : (
          <div className="space-y-4 py-1">
            <div>
              <FieldLabel htmlFor="invite-email" required>
                E-Mail
              </FieldLabel>
              <Input
                id="invite-email"
                type="email"
                autoFocus
                value={email}
                onChange={(e) => setEmail(e.target.value)}
              />
            </div>
            {groups.length > 0 && (
              <div>
                <p className="text-text-secondary mb-1 text-sm">Rechtegruppen</p>
                <div className="space-y-1">
                  {groups.map((g) => (
                    <label key={g.id} className="text-text-primary flex items-center gap-2 text-sm">
                      <input
                        type="checkbox"
                        checked={selected.has(g.id)}
                        onChange={(e) =>
                          setSelected((prev) => {
                            const next = new Set(prev)
                            if (e.target.checked) next.add(g.id)
                            else next.delete(g.id)
                            return next
                          })
                        }
                      />
                      {g.name}
                    </label>
                  ))}
                </div>
                <p className="text-text-muted mt-1 text-xs">
                  Rechte lassen sich später jederzeit anpassen.
                </p>
              </div>
            )}
            {error && <FieldError message={error} />}
          </div>
        )}
        <DialogFooter>
          <Button variant="secondary" onClick={onClose}>
            {result ? "Fertig" : "Abbrechen"}
          </Button>
          {!result && (
            <Button disabled={invite.isPending} onClick={submit}>
              Einladen
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
