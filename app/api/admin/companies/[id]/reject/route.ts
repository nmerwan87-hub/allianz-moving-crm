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

  let body: {
    rejectedBy?: string
    rejectionReason?: string
    rejectionCategory?: string
  } = {}
  try {
    body = (await request.json()) as typeof body
  } catch {
    // proceed without body
  }

  if (!body.rejectionReason && !body.rejectionCategory) {
    return NextResponse.json(
      { error: "rejectionReason or rejectionCategory is required" },
      { status: 400 },
    )
  }

  const svc = createServiceRoleClient()

  const { data: company } = await svc
    .from("companies")
    .select("id, name, legal_name, company_status")
    .eq("id", companyId)
    .maybeSingle()

  if (!company) {
    return NextResponse.json({ error: "Company not found" }, { status: 404 })
  }

  if (
    !["pending_review", "pending_email_verification"].includes(company.company_status as string)
  ) {
    return NextResponse.json(
      { error: `Company cannot be rejected from status: ${company.company_status}` },
      { status: 400 },
    )
  }

  const internalReason = body.rejectionReason ?? body.rejectionCategory ?? "Not specified"
  const now = new Date().toISOString()

  // 1. Update company
  await svc
    .from("companies")
    .update({
      company_status: "rejected",
      rejection_reason: internalReason,
      rejected_at: now,
      reviewed_at: now,
      reviewed_by: body.rejectedBy ?? null,
    })
    .eq("id", companyId)

  // 2. Find owner
  const { data: ownerProfile } = await svc
    .from("profiles")
    .select("id, first_name, email")
    .eq("company_id", companyId)
    .eq("role", "owner")
    .maybeSingle()

  // 3. Ban the owner's auth account
  if (ownerProfile?.id) {
    await svc.auth.admin.updateUserById(ownerProfile.id as string, { ban_duration: "876600h" })
  }

  // 4. Write platform_audit_log
  await svc.from("platform_audit_log").insert({
    action: "tenant.rejected",
    target_company_id: companyId,
    actor_id: body.rejectedBy ?? null,
    actor_type: "platform_admin",
    metadata: { reason: internalReason },
  })

  // 5. Write activity_log
  await svc.from("activity_logs").insert({
    company_id: companyId,
    actor_type: "platform",
    action: "company.rejected",
    entity_type: "company",
    entity_id: companyId,
    metadata: { reason: internalReason },
  })

  // 6. Send rejection email with customer-facing reason
  if (ownerProfile?.email) {
    try {
      const { PlatformRegistrationRejected, getCustomerFacingRejectionReason } =
        await import("@/emails/platform/platform-registration-rejected")
      const customerFacingReason = getCustomerFacingRejectionReason(internalReason)
      await sendPlatformEmail({
        to: ownerProfile.email as string,
        subject: "Update on your Bivro application",
        react: createElement(PlatformRegistrationRejected, {
          companyName: (company.legal_name ?? company.name) as string,
          ownerName: (ownerProfile.first_name ?? "there") as string,
          customerFacingReason,
        }),
      })
    } catch {
      console.error("[reject] Failed to send rejection email")
    }
  }

  return NextResponse.json({ success: true, companyId, status: "rejected" })
}
