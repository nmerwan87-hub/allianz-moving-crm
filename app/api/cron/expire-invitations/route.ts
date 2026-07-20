import { type NextRequest, NextResponse } from "next/server"
import { createServiceRoleClient } from "@/lib/supabase/service-role"

export async function GET(request: NextRequest) {
  const authHeader = request.headers.get("authorization")
  const secret = process.env["CRON_SECRET"]

  if (!secret || authHeader !== `Bearer ${secret}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  const svc = createServiceRoleClient()

  const { data, error } = await svc
    .from("user_invitations")
    .update({ status: "expired" })
    .eq("status", "pending")
    .lt("expires_at", new Date().toISOString())
    .select("id")

  if (error) {
    console.error("[cron:expire-invitations]", error)
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  const count = data?.length ?? 0
  console.warn(`[cron:expire-invitations] Expired ${count} invitation(s)`)

  return NextResponse.json({ success: true, expired: count })
}
