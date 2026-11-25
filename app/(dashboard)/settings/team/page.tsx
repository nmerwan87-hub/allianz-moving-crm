import { redirect } from "next/navigation"
import { createClient } from "@/lib/supabase/server"
import { getJwtAppMetadata } from "@/lib/supabase/jwt"
import { createServerCaller } from "@/lib/trpc/server"
import { PageHeader } from "@/app/(dashboard)/_components/ui/page-header"
import TeamManagement from "./_components/TeamManagement"

export const metadata = { title: "Team und Rechte — Bivro" }

export default async function TeamSettingsPage() {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) redirect("/login")

  const {
    data: { session },
  } = await supabase.auth.getSession()
  const jwtMeta = getJwtAppMetadata(session?.access_token)
  const companyStatus = jwtMeta["company_status"] as string | undefined
  const role = jwtMeta["role"] as string | undefined

  if (companyStatus !== "active") redirect("/pending-approval")
  if (role !== "owner") redirect("/dashboard")

  const caller = await createServerCaller()
  const [members, groups, definitions] = await Promise.all([
    caller.iam.team.list(),
    caller.iam.permissionGroups.list(),
    caller.iam.permissionDefinitions.list(),
  ])

  return (
    <div>
      <PageHeader
        title="Team und Rechte"
        description="Rechtegruppen verwalten und festlegen, was Büro-Mitarbeitende dürfen."
      />
      <TeamManagement initialMembers={members} initialGroups={groups} definitions={definitions} />
    </div>
  )
}
