"use client"

import { ArrowLeftRight } from "lucide-react"
import { Button } from "./ui/button"
import { Card, CardContent } from "./ui/card"
import { useToast } from "./ui/toast"
import { trpc } from "@/lib/trpc/client"
import { completeCompanySwitch } from "@/app/(dashboard)/_lib/active-company"

const ENTITY_LABELS = {
  lead: "lead",
  customer: "customer",
  quote: "quote",
  job: "job",
  invoice: "invoice",
} as const

/**
 * Shown instead of a plain "not found" when the record exists in another of the
 * user's companies. Renders `children` (the regular not-found state) otherwise.
 */
export function WrongCompanyNotice({
  entity,
  id,
  children,
}: {
  entity: keyof typeof ENTITY_LABELS
  id: string
  children: React.ReactNode
}) {
  const toast = useToast()
  const locate = trpc.iam.session.locateRecord.useQuery({ entity, id }, { retry: false })
  const switchMutation = trpc.iam.session.switchCompany.useMutation({
    onSuccess: async ({ companyId }) => {
      await completeCompanySwitch(companyId, window.location.pathname)
    },
    onError: (err) => toast.error("Could not switch company", err.message),
  })

  if (locate.isLoading) return null
  if (!locate.data?.found) return <>{children}</>

  const { companyId, companyName } = locate.data

  return (
    <Card>
      <CardContent className="flex flex-col items-center gap-4 py-10 text-center">
        <div className="bg-surface-sunken flex h-10 w-10 items-center justify-center rounded-full">
          <ArrowLeftRight className="text-text-secondary h-5 w-5" />
        </div>
        <div>
          <p className="text-text-primary font-semibold">
            This {ENTITY_LABELS[entity]} belongs to {companyName}
          </p>
          <p className="text-text-muted mt-1 text-sm">
            Switch to {companyName} to open it. Other open tabs will switch as well.
          </p>
        </div>
        <Button
          onClick={() => switchMutation.mutate({ companyId })}
          disabled={switchMutation.isPending || switchMutation.isSuccess}
        >
          Switch to {companyName}
        </Button>
      </CardContent>
    </Card>
  )
}
