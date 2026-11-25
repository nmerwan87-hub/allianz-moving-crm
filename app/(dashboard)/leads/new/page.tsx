import { PageHeader } from "@/app/(dashboard)/_components/ui/page-header"
import { LeadForm } from "../_components/lead-form"

export default function NewLeadPage() {
  return (
    <div>
      <PageHeader title="Neue Anfrage" description="Kontakt und Umzugswunsch erfassen." />
      <LeadForm mode="create" />
    </div>
  )
}
