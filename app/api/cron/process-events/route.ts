import { type NextRequest, NextResponse } from "next/server"
import { processDomainEvents } from "@/lib/events/processor"

export async function GET(request: NextRequest) {
  const authHeader = request.headers.get("authorization")
  const secret = process.env["CRON_SECRET"]

  if (!secret || authHeader !== `Bearer ${secret}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  try {
    const result = await processDomainEvents()
    if (result.failed > 0) {
      console.warn(`[cron:process-events] ${result.failed} event(s) failed and will be retried`)
    }
    return NextResponse.json({ success: true, ...result })
  } catch (err) {
    console.error("[cron:process-events]", err)
    return NextResponse.json({ error: "Event processing failed" }, { status: 500 })
  }
}
