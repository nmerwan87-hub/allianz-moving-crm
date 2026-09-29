import { PageHeader } from "@/app/(dashboard)/_components/ui/page-header"
import { LeadForm } from "../_components/lead-form"

export default function NewLeadPage() {
  return (
    <div>
      <PageHeader title="New Lead" description="Add a potential customer to your sales pipeline." />
      <LeadForm mode="create" />
    </div>
  )
}
