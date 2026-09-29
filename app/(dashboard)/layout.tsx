import { redirect } from "next/navigation"
import { createClient } from "@/lib/supabase/server"
import { getJwtAppMetadata } from "@/lib/supabase/jwt"
import { AppShell } from "./_components/app-shell"

export default async function DashboardLayout({
  children,
}: Readonly<{
  children: React.ReactNode
}>) {
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

  if (companyStatus !== "active") {
    const statusRedirects: Record<string, string> = {
      pending_email_verification: "/register/check-email",
      pending_review: "/pending-approval",
      suspended: "/suspended",
      rejected: "/rejected",
      archived: "/archived",
    }
    const target = statusRedirects[companyStatus ?? ""]
    if (target) redirect(target)
  }

  return (
    <div>
      <div style={{ background: "red", color: "white", padding: "8px 16px", fontSize: 20, fontWeight: 900, position: "fixed", top: 0, left: 0, right: 0, zIndex: 9999 }}>
        BIVRO APP SHELL ACTIVE
      </div>
      <AppShell>{children}</AppShell>
    </div>
  )
}
