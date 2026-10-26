import { type NextRequest, NextResponse } from "next/server"
import { createServiceRoleClient } from "@/lib/supabase/service-role"

/**
 * Time-based transitions (quote expiry, invoice overdue) followed by a full
 * re-evaluation of system tasks for all companies. Status changes made here
 * emit domain events like any other change.
 */
export async function GET(request: NextRequest) {
  const authHeader = request.headers.get("authorization")
  const secret = process.env["CRON_SECRET"]

  if (!secret || authHeader !== `Bearer ${secret}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  const svc = createServiceRoleClient()

  const { data: transitions, error: transitionError } = await svc.rpc(
    "apply_time_based_transitions",
  )
  if (transitionError) {
    console.error("[cron:sync-tasks] apply_time_based_transitions", transitionError)
    return NextResponse.json({ error: transitionError.message }, { status: 500 })
  }

  const { data: tasks, error: syncError } = await svc.rpc("sync_system_tasks", {
    p_company_id: null,
  })
  if (syncError) {
    console.error("[cron:sync-tasks] sync_system_tasks", syncError)
    return NextResponse.json({ error: syncError.message }, { status: 500 })
  }

  return NextResponse.json({ success: true, transitions, tasks })
}
