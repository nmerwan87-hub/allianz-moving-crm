"use client"

import { useState } from "react"
import { useRouter } from "next/navigation"
import { Search, UserPlus } from "lucide-react"
import { trpc } from "@/lib/trpc/client"
import { formatPhone } from "@/lib/format/phone"
import { Button } from "@/app/(dashboard)/_components/ui/button"
import { Input, FieldError } from "@/app/(dashboard)/_components/ui/field"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/app/(dashboard)/_components/ui/dialog"
import { useToast } from "@/app/(dashboard)/_components/ui/toast"

/**
 * Step 1 of a quote: pick the customer — or enter a new one right here
 * (name, e-mail, phone) — then the quote form opens.
 */
export function NewQuoteDialog({
  open,
  onOpenChange,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
}) {
  const router = useRouter()
  const toast = useToast()
  const [search, setSearch] = useState("")
  const [mode, setMode] = useState<"pick" | "new">("pick")
  const [person, setPerson] = useState({ firstName: "", lastName: "", email: "", phone: "" })
  const [error, setError] = useState<string | null>(null)
  const customers = trpc.customers.list.useQuery(
    { ...(search ? { search } : {}), pageSize: 8 },
    { enabled: open && mode === "pick" },
  )
  const create = trpc.quotes.create.useMutation()
  const createCustomer = trpc.customers.create.useMutation()
  const pending = create.isPending || createCustomer.isPending

  async function start(customerId: string) {
    try {
      const { id } = await create.mutateAsync({ customerId })
      onOpenChange(false)
      router.push(`/quotes/${id}`)
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Offerte konnte nicht erstellt werden")
    }
  }

  async function createAndStart() {
    if (!person.firstName.trim() || !person.lastName.trim())
      return setError("Vor- und Nachname eingeben.")
    try {
      const { id } = await createCustomer.mutateAsync({
        firstName: person.firstName,
        lastName: person.lastName,
        email: person.email,
        phone: person.phone,
      })
      await start(id)
    } catch (err) {
      setError(err instanceof Error ? err.message : "Kunde konnte nicht erfasst werden")
    }
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(o) => {
        onOpenChange(o)
        if (!o) {
          setMode("pick")
          setError(null)
        }
      }}
    >
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Neue Offerte</DialogTitle>
          <DialogDescription>
            {mode === "pick" ? "Für welchen Kunden?" : "Neuen Kunden erfassen"}
          </DialogDescription>
        </DialogHeader>

        {mode === "pick" ? (
          <>
            <div className="relative">
              <Search className="text-text-muted absolute top-1/2 left-3 h-4 w-4 -translate-y-1/2" />
              <Input
                autoFocus
                className="pl-9"
                placeholder="Name, E-Mail oder Telefon"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
              />
            </div>
            <ul className="divide-surface-divider max-h-72 divide-y overflow-y-auto">
              {(customers.data?.items ?? []).map((c) => (
                <li key={c.id}>
                  <button
                    type="button"
                    disabled={pending}
                    onClick={() => start(c.id)}
                    className="hover:bg-surface-sunken w-full rounded-[var(--radius-md)] px-2 py-2.5 text-left"
                  >
                    <div className="text-text-primary text-sm font-medium">{c.displayName}</div>
                    <div className="text-text-muted text-xs">
                      {[c.email, formatPhone(c.phone), c.billingCity].filter(Boolean).join(" · ")}
                    </div>
                  </button>
                </li>
              ))}
              {customers.data && customers.data.items.length === 0 && (
                <li className="text-text-muted px-2 py-4 text-sm">Kein Kunde gefunden.</li>
              )}
            </ul>
            <DialogFooter>
              <Button
                variant="secondary"
                onClick={() => {
                  const [first, ...rest] = search.trim().split(/\s+/)
                  setPerson((p) => ({ ...p, firstName: first ?? "", lastName: rest.join(" ") }))
                  setMode("new")
                }}
              >
                <UserPlus className="h-4 w-4" />
                Neuer Kunde
              </Button>
            </DialogFooter>
          </>
        ) : (
          <>
            <div className="grid gap-3 sm:grid-cols-2">
              <Input
                autoFocus
                aria-label="Vorname"
                placeholder="Vorname"
                value={person.firstName}
                onChange={(e) => setPerson({ ...person, firstName: e.target.value })}
              />
              <Input
                aria-label="Nachname"
                placeholder="Nachname"
                value={person.lastName}
                onChange={(e) => setPerson({ ...person, lastName: e.target.value })}
              />
              <Input
                aria-label="E-Mail"
                type="email"
                placeholder="E-Mail"
                value={person.email}
                onChange={(e) => setPerson({ ...person, email: e.target.value })}
              />
              <Input
                aria-label="Telefon"
                placeholder="Telefon"
                value={person.phone}
                onChange={(e) => setPerson({ ...person, phone: e.target.value })}
              />
            </div>
            {error && <FieldError message={error} />}
            <DialogFooter>
              <Button variant="secondary" onClick={() => setMode("pick")} disabled={pending}>
                Zurück
              </Button>
              <Button onClick={createAndStart} disabled={pending}>
                {pending ? "Wird erstellt …" : "Weiter zur Offerte"}
              </Button>
            </DialogFooter>
          </>
        )}
      </DialogContent>
    </Dialog>
  )
}
