import { type NextRequest, NextResponse } from "next/server"
import { createServiceRoleClient } from "@/lib/supabase/service-role"
import { runAutomations } from "@/lib/automations/engine"

/** Automatic customer e-mails (lib/automations/engine.ts), every 15 minutes. */
export async function GET(request: NextRequest) {
  const secret = process.env["CRON_SECRET"]
  if (!secret || request.headers.get("authorization") !== `Bearer ${secret}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  try {
    const result = await runAutomations(createServiceRoleClient())
    if (result.failed > 0) console.warn(`[cron:automations] ${result.failed} e-mail(s) failed`)
    return NextResponse.json({ success: true, ...result })
  } catch (err) {
    console.error("[cron:automations]", err)
    return NextResponse.json({ error: "Automation run failed" }, { status: 500 })
  }
}
