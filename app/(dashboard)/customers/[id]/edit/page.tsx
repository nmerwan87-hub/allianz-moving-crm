"use client"

import { use } from "react"
import { trpc } from "@/lib/trpc/client"
import { PageHeader } from "@/app/(dashboard)/_components/ui/page-header"
import { Skeleton } from "@/app/(dashboard)/_components/ui/skeleton"
import { ErrorState } from "@/app/(dashboard)/_components/ui/error-state"
import { WrongCompanyNotice } from "@/app/(dashboard)/_components/wrong-company-notice"
import { CustomerForm } from "../../_components/customer-form"

export default function EditCustomerPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params)
  const query = trpc.customers.getById.useQuery({ id })

  if (query.isLoading) {
    return (
      <div>
        <PageHeader title="Edit customer" />
        <Skeleton className="h-96 w-full rounded-[var(--radius-lg)]" />
      </div>
    )
  }

  if (query.isError || !query.data) {
    return (
      <div>
        <PageHeader title="Edit customer" />
        <WrongCompanyNotice entity="customer" id={id}>
          <ErrorState
            title="Customer not found"
            message="This customer may have been removed or you may not have access to it."
          />
        </WrongCompanyNotice>
      </div>
    )
  }

  return (
    <div>
      <PageHeader title="Edit customer" description={query.data.customer.displayName} />
      <CustomerForm mode="edit" customer={query.data.customer} />
    </div>
  )
}
