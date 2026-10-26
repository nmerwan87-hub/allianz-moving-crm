"use client"

import { useState } from "react"
import { useRouter } from "next/navigation"
import { Search } from "lucide-react"
import { trpc } from "@/lib/trpc/client"
import { formatPhone } from "@/lib/format/phone"
import { Button } from "@/app/(dashboard)/_components/ui/button"
import { Input } from "@/app/(dashboard)/_components/ui/field"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/app/(dashboard)/_components/ui/dialog"
import { useToast } from "@/app/(dashboard)/_components/ui/toast"

/** Pick a customer, create the draft and open the editor. */
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
  const customers = trpc.customers.list.useQuery(
    { ...(search ? { search } : {}), pageSize: 8 },
    { enabled: open },
  )
  const create = trpc.quotes.create.useMutation()

  async function start(customerId: string) {
    try {
      const { id } = await create.mutateAsync({ customerId })
      onOpenChange(false)
      router.push(`/quotes/${id}`)
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to create quote")
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>New quote</DialogTitle>
          <DialogDescription>Who is the quote for?</DialogDescription>
        </DialogHeader>
        <div className="relative">
          <Search className="text-text-muted absolute top-1/2 left-3 h-4 w-4 -translate-y-1/2" />
          <Input
            autoFocus
            className="pl-9"
            placeholder="Search customers..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>
        <ul className="divide-surface-divider max-h-72 divide-y overflow-y-auto">
          {(customers.data?.items ?? []).map((c) => (
            <li key={c.id}>
              <button
                type="button"
                disabled={create.isPending}
                onClick={() => start(c.id)}
                className="hover:bg-surface-sunken w-full px-2 py-2.5 text-left"
              >
                <div className="text-text-primary text-sm font-medium">{c.displayName}</div>
                <div className="text-text-muted text-xs">
                  {[c.email, formatPhone(c.phone), c.billingCity].filter(Boolean).join(" · ")}
                </div>
              </button>
            </li>
          ))}
          {customers.data && customers.data.items.length === 0 && (
            <li className="text-text-muted px-2 py-4 text-sm">No customers found.</li>
          )}
        </ul>
        <DialogFooter>
          <Button variant="secondary" onClick={() => router.push("/customers/new")}>
            New customer
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
