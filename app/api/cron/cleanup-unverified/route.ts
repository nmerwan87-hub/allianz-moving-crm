import { type NextRequest, NextResponse } from "next/server"
import { createServiceRoleClient } from "@/lib/supabase/service-role"

/**
 * Auto-archives companies that remain in pending_email_verification
 * for more than 30 days. Runs nightly.
 */
export async function GET(request: NextRequest) {
  const authHeader = request.headers.get("authorization")
  const secret = process.env["CRON_SECRET"]

  if (!secret || authHeader !== `Bearer ${secret}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  const svc = createServiceRoleClient()

  const thirtyDaysAgo = new Date()
  thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30)

  const { data: staleCompanies } = await svc
    .from("companies")
    .select("id")
    .eq("company_status", "pending_email_verification")
    .lt("created_at", thirtyDaysAgo.toISOString())

  if (!staleCompanies || staleCompanies.length === 0) {
    return NextResponse.json({ success: true, archived: 0 })
  }

  const now = new Date().toISOString()
  const ids = staleCompanies.map((c) => c.id)

  const { error } = await svc
    .from("companies")
    .update({ company_status: "archived", deleted_at: now })
    .in("id", ids)

  if (error) {
    console.error("[cron:cleanup-unverified]", error)
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  console.warn(`[cron:cleanup-unverified] Archived ${ids.length} unverified company(s)`)

  return NextResponse.json({ success: true, archived: ids.length })
}
