import { PageHeader } from "@/app/(dashboard)/_components/ui/page-header"
import { CustomerForm } from "../_components/customer-form"

export default function NewCustomerPage() {
  return (
    <div>
      <PageHeader title="Neuer Kunde" description="Privatperson oder Firma erfassen." />
      <CustomerForm mode="create" />
    </div>
  )
}
