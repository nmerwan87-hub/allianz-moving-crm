"use client"

import { use } from "react"
import { trpc } from "@/lib/trpc/client"
import { PageHeader } from "@/app/(dashboard)/_components/ui/page-header"
import { Skeleton } from "@/app/(dashboard)/_components/ui/skeleton"
import { ErrorState } from "@/app/(dashboard)/_components/ui/error-state"
import { LeadForm } from "../../_components/lead-form"

export default function EditLeadPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params)
  const query = trpc.leads.getById.useQuery({ id })

  if (query.isLoading) {
    return (
      <div>
        <PageHeader title="Edit Lead" />
        <div className="space-y-4">
          <Skeleton className="h-64 w-full rounded-[var(--radius-lg)]" />
          <Skeleton className="h-48 w-full rounded-[var(--radius-lg)]" />
        </div>
      </div>
    )
  }

  if (query.isError || !query.data) {
    return (
      <div>
        <PageHeader title="Edit Lead" />
        <ErrorState
          title="Lead not found"
          message="This lead may have been archived or you may not have access to it."
        />
      </div>
    )
  }

  return (
    <div>
      <PageHeader
        title="Edit Lead"
        description={`Updating ${query.data.firstName} ${query.data.lastName}`}
      />
      <LeadForm mode="edit" lead={query.data} />
    </div>
  )
}
