import { type NextRequest, NextResponse } from "next/server"
import { createElement } from "react"
import { createServiceRoleClient } from "@/lib/supabase/service-role"
import { sendPlatformEmail } from "@/lib/email/send"

function verifyAdminAuth(req: NextRequest): boolean {
  const authHeader = req.headers.get("authorization")
  const secret = process.env["CRON_SECRET"]
  if (!secret || !authHeader) return false
  return authHeader === `Bearer ${secret}`
}

export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  if (!verifyAdminAuth(request)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  const { id: companyId } = await params

  let body: { requestedBy?: string; message?: string } = {}
  try {
    body = (await request.json()) as typeof body
  } catch {
    // proceed
  }

  if (!body.message || body.message.trim().length < 30) {
    return NextResponse.json(
      { error: "message is required and must be at least 30 characters" },
      { status: 400 },
    )
  }

  const svc = createServiceRoleClient()

  const { data: company } = await svc
    .from("companies")
    .select("id, name, legal_name, company_status, review_notes")
    .eq("id", companyId)
    .maybeSingle()

  if (!company) {
    return NextResponse.json({ error: "Company not found" }, { status: 404 })
  }

  if ((company.company_status as string) !== "pending_review") {
    return NextResponse.json(
      { error: `Company is not in pending_review status (current: ${company.company_status})` },
      { status: 400 },
    )
  }

  const now = new Date().toISOString()
  const noteEntry = `[${now}] Admin ${body.requestedBy ?? "unknown"}: ${body.message}`
  const existingNotes = (company.review_notes as string | null) ?? ""
  const updatedNotes = existingNotes ? `${existingNotes}\n\n${noteEntry}` : noteEntry

  // 1. Append notes; status stays 'pending_review'
  await svc
    .from("companies")
    .update({
      review_notes: updatedNotes,
      more_info_requested_at: now,
    })
    .eq("id", companyId)

  // 2. Find owner
  const { data: ownerProfile } = await svc
    .from("profiles")
    .select("first_name, email")
    .eq("company_id", companyId)
    .eq("role", "owner")
    .maybeSingle()

  // 3. Write platform_audit_log
  await svc.from("platform_audit_log").insert({
    action: "tenant.info_requested",
    target_company_id: companyId,
    actor_id: body.requestedBy ?? null,
    actor_type: "platform_admin",
    metadata: { message: body.message },
  })

  // 4. Send email
  if (ownerProfile?.email) {
    try {
      const { PlatformRegistrationMoreInfoNeeded } =
        await import("@/emails/platform/platform-registration-more-info-needed")
      await sendPlatformEmail({
        to: ownerProfile.email as string,
        subject: "Action required: additional information needed for your Bivro application",
        react: createElement(PlatformRegistrationMoreInfoNeeded, {
          companyName: (company.legal_name ?? company.name) as string,
          ownerName: (ownerProfile.first_name ?? "there") as string,
          requestMessage: body.message,
        }),
      })
    } catch {
      console.error("[request-info] Failed to send more-info email")
    }
  }

  return NextResponse.json({ success: true, companyId, status: "pending_review" })
}
