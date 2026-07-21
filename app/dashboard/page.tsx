import { redirect } from "next/navigation"
import { createClient } from "@/lib/supabase/server"
import { getJwtAppMetadata } from "@/lib/supabase/jwt"

export default async function DashboardPage() {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) redirect("/login")

  // Decode the JWT from the access_token to read hook-injected claims.
  // session.user.app_metadata is the GoTrue response body (no hook injections).
  // The hook claims (company_status, role, company_id) live in the JWT payload only.
  const {
    data: { session },
  } = await supabase.auth.getSession()
  const jwtMeta = getJwtAppMetadata(session?.access_token)
  const companyStatus = jwtMeta["company_status"] as string | undefined
  if (companyStatus !== "active") redirect("/pending-approval")

  const { data: profile } = await supabase
    .from("profiles")
    .select("first_name, role, company_id")
    .eq("id", user.id)
    .maybeSingle()

  const { data: company } = await supabase
    .from("companies")
    .select("name, legal_name")
    .eq("id", profile?.company_id ?? "")
    .maybeSingle()

  const displayName = company?.name ?? company?.legal_name ?? "your company"
  const firstName = profile?.first_name ?? "there"

  return (
    <div className="flex min-h-screen flex-col bg-slate-50">
      <header className="border-b border-slate-200 bg-white px-6 py-4">
        <div className="mx-auto flex max-w-7xl items-center justify-between">
          <span className="text-lg font-semibold text-slate-900">Bivro</span>
          <span className="text-sm text-slate-500">{displayName}</span>
        </div>
      </header>

      <main className="mx-auto w-full max-w-7xl flex-1 px-6 py-12">
        <h1 className="text-2xl font-bold text-slate-900">Welcome back, {firstName}</h1>
        <p className="mt-2 text-sm text-slate-500">
          Role: <strong className="text-slate-700">{profile?.role ?? "—"}</strong> · Company status:{" "}
          <strong className="text-slate-700">active</strong>
        </p>

        <div className="mt-10 rounded-lg border border-dashed border-slate-300 bg-white p-12 text-center">
          <p className="text-sm font-medium text-slate-600">Dashboard shell — Sprint 4</p>
          <p className="mt-1 text-xs text-slate-400">
            Authentication, IAM, and company provisioning verified. Tenant dashboard coming next.
          </p>
        </div>
      </main>
    </div>
  )
}
