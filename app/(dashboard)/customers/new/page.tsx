import { PageHeader } from "@/app/(dashboard)/_components/ui/page-header"
import { CustomerForm } from "../_components/customer-form"

export default function NewCustomerPage() {
  return (
    <div>
      <PageHeader title="New customer" description="Add a private or business customer." />
      <CustomerForm mode="create" />
    </div>
  )
}
