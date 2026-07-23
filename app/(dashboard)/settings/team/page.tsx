import { redirect } from "next/navigation"
import { createClient } from "@/lib/supabase/server"
import { getJwtAppMetadata } from "@/lib/supabase/jwt"
import { createServerCaller } from "@/lib/trpc/server"
import TeamManagement from "./_components/TeamManagement"

export const metadata = { title: "Team & Permissions — Bivro" }

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
    <div className="flex min-h-screen flex-col bg-slate-50">
      <header className="border-b border-slate-200 bg-white px-6 py-4">
        <div className="mx-auto flex max-w-7xl items-center justify-between">
          <div className="flex items-center gap-4">
            <a href="/dashboard" className="text-lg font-semibold text-slate-900">
              Bivro
            </a>
            <span className="text-slate-300">/</span>
            <span className="text-sm text-slate-500">Settings</span>
            <span className="text-slate-300">/</span>
            <span className="text-sm font-medium text-slate-700">Team &amp; Permissions</span>
          </div>
        </div>
      </header>

      <main className="mx-auto w-full max-w-7xl flex-1 px-6 py-10">
        <div className="mb-8">
          <h1 className="text-2xl font-bold text-slate-900">Team &amp; Permissions</h1>
          <p className="mt-1 text-sm text-slate-500">
            Manage permission groups and control what each office user can access.
          </p>
        </div>

        <TeamManagement initialMembers={members} initialGroups={groups} definitions={definitions} />
      </main>
    </div>
  )
}
