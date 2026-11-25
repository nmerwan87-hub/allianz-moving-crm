"use client"

import { use } from "react"
import { trpc } from "@/lib/trpc/client"
import { PageHeader } from "@/app/(dashboard)/_components/ui/page-header"
import { Skeleton } from "@/app/(dashboard)/_components/ui/skeleton"
import { ErrorState } from "@/app/(dashboard)/_components/ui/error-state"
import { WrongCompanyNotice } from "@/app/(dashboard)/_components/wrong-company-notice"
import { LeadForm } from "../../_components/lead-form"

export default function EditLeadPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params)
  const query = trpc.leads.getById.useQuery({ id })

  if (query.isLoading) {
    return (
      <div>
        <PageHeader title="Anfrage bearbeiten" />
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
        <PageHeader title="Anfrage bearbeiten" />
        <WrongCompanyNotice entity="lead" id={id}>
          <ErrorState
            title="Anfrage nicht gefunden"
            message="Sie wurde archiviert oder du hast keinen Zugriff."
          />
        </WrongCompanyNotice>
      </div>
    )
  }

  return (
    <div>
      <PageHeader
        title="Anfrage bearbeiten"
        description={`${query.data.firstName} ${query.data.lastName}`}
      />
      <LeadForm mode="edit" lead={query.data} />
    </div>
  )
}
