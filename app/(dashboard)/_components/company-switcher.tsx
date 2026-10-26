"use client"

import { useState } from "react"
import { Check, ChevronsUpDown, Loader2 } from "lucide-react"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuTrigger,
} from "./ui/dropdown-menu"
import { ConfirmDialog } from "./ui/confirm-dialog"
import { useToast } from "./ui/toast"
import { trpc } from "@/lib/trpc/client"
import { cn } from "@/app/(dashboard)/_lib/cn"
import {
  companyColour,
  companyInitials,
  completeCompanySwitch,
  hasUnsavedChanges,
} from "@/app/(dashboard)/_lib/active-company"

export interface SwitcherCompany {
  id: string
  name: string
  logoUrl: string | null
  role: "owner" | "office"
}

function CompanyMark({ company, className }: { company: SwitcherCompany; className?: string }) {
  if (company.logoUrl) {
    return (
      // eslint-disable-next-line @next/next/no-img-element -- tenant logos come from storage URLs of unknown size
      <img
        src={company.logoUrl}
        alt=""
        className={cn("h-7 w-7 shrink-0 rounded-[var(--radius-sm)] object-cover", className)}
      />
    )
  }
  return (
    <span
      className={cn(
        "text-text-inverse flex h-7 w-7 shrink-0 items-center justify-center rounded-[var(--radius-sm)] text-xs font-bold",
        companyColour(company.id),
        className,
      )}
      aria-hidden
    >
      {companyInitials(company.name)}
    </span>
  )
}

/**
 * Company identity in the sidebar header. With more than one membership it
 * becomes the switcher; with one it is a plain label.
 */
export function CompanySwitcher({
  active,
  companies,
}: {
  active: SwitcherCompany
  companies: SwitcherCompany[]
}) {
  const toast = useToast()
  const [pending, setPending] = useState<SwitcherCompany | null>(null)
  const [switchingTo, setSwitchingTo] = useState<string | null>(null)

  const switchMutation = trpc.iam.session.switchCompany.useMutation({
    onSuccess: async ({ companyId }) => {
      await completeCompanySwitch(companyId)
    },
    onError: (err) => {
      setSwitchingTo(null)
      toast.error("Could not switch company", err.message)
    },
  })

  function startSwitch(target: SwitcherCompany) {
    setPending(null)
    setSwitchingTo(target.id)
    switchMutation.mutate({ companyId: target.id })
  }

  function requestSwitch(target: SwitcherCompany) {
    if (target.id === active.id) return
    if (hasUnsavedChanges()) {
      setPending(target)
      return
    }
    startSwitch(target)
  }

  const label = (
    <>
      <CompanyMark company={active} />
      <span className="text-text-primary min-w-0 flex-1 truncate text-left text-sm font-semibold">
        {active.name || "Bivro"}
      </span>
    </>
  )

  if (companies.length <= 1) {
    return <div className="flex min-w-0 flex-1 items-center gap-2">{label}</div>
  }

  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <button
            className="hover:bg-surface-sunken -mx-2 flex min-w-0 flex-1 items-center gap-2 rounded-[var(--radius-md)] px-2 py-1.5 transition-colors"
            aria-label={`Active company: ${active.name}. Switch company`}
            disabled={switchingTo !== null}
          >
            {label}
            {switchingTo ? (
              <Loader2 className="text-text-muted h-4 w-4 shrink-0 animate-spin" />
            ) : (
              <ChevronsUpDown className="text-text-muted h-4 w-4 shrink-0" />
            )}
          </button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="start" className="w-64">
          <DropdownMenuLabel>Switch company</DropdownMenuLabel>
          {companies.map((company) => (
            <DropdownMenuItem key={company.id} onSelect={() => requestSwitch(company)}>
              <CompanyMark company={company} className="h-6 w-6 text-[10px]" />
              <span className="min-w-0 flex-1">
                <span className="block truncate">{company.name}</span>
                <span className="text-text-muted block text-xs">
                  {company.role === "owner" ? "Owner" : "Office"}
                </span>
              </span>
              {company.id === active.id ? (
                <Check className="text-signal-600 h-4 w-4 shrink-0" aria-label="Active" />
              ) : null}
            </DropdownMenuItem>
          ))}
        </DropdownMenuContent>
      </DropdownMenu>

      <ConfirmDialog
        open={pending !== null}
        onOpenChange={(open) => {
          if (!open) setPending(null)
        }}
        title="Discard unsaved changes?"
        description={`You have unsaved changes in ${active.name}. Switching to ${pending?.name ?? "another company"} will discard them.`}
        confirmLabel="Discard and switch"
        variant="danger"
        onConfirm={() => {
          if (pending) startSwitch(pending)
        }}
      />
    </>
  )
}
