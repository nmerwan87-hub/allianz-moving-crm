import { type NextRequest, NextResponse } from "next/server"
import { createElement } from "react"
import { createServiceRoleClient } from "@/lib/supabase/service-role"
import { provisionCompany } from "@/modules/iam/lib/provisioning"
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

  let body: { reviewedBy?: string; reviewNotes?: string } = {}
  try {
    body = (await request.json()) as typeof body
  } catch {
    // body is optional
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

  if ((company.company_status as string) !== "pending_review") {
    return NextResponse.json(
      { error: `Company is not in pending_review status (current: ${company.company_status})` },
      { status: 400 },
    )
  }

  const now = new Date().toISOString()
  const trialEndsAt = new Date()
  trialEndsAt.setDate(trialEndsAt.getDate() + 14)

  // 1. Update company status
  await svc
    .from("companies")
    .update({
      company_status: "active",
      trial_ends_at: trialEndsAt.toISOString(),
      reviewed_at: now,
      reviewed_by: body.reviewedBy ?? null,
      review_notes: body.reviewNotes ?? null,
    })
    .eq("id", companyId)

  // 2. Provision all company defaults
  await provisionCompany(companyId)

  // 3. Find owner email for welcome email
  const { data: ownerProfile } = await svc
    .from("profiles")
    .select("id, first_name, last_name, email")
    .eq("company_id", companyId)
    .eq("role", "owner")
    .eq("is_active", true)
    .maybeSingle()

  // 4. Write platform_audit_log
  await svc.from("platform_audit_log").insert({
    action: "tenant.approved",
    target_company_id: companyId,
    actor_id: body.reviewedBy ?? null,
    actor_type: "platform_admin",
    metadata: { review_notes: body.reviewNotes ?? null },
  })

  // 5. Write activity_logs
  await svc.from("activity_logs").insert([
    {
      company_id: companyId,
      actor_type: "platform",
      action: "company.approved",
      entity_type: "company",
      entity_id: companyId,
    },
    {
      company_id: companyId,
      actor_type: "platform",
      action: "catalog.seeded",
      entity_type: "company",
      entity_id: companyId,
      metadata: { count: 19 },
    },
    {
      company_id: companyId,
      actor_type: "platform",
      action: "templates.seeded",
      entity_type: "company",
      entity_id: companyId,
      metadata: { count: 27 },
    },
  ])

  // 6. Write domain_events
  await svc.from("domain_events").insert({
    event_type: "tenant.created",
    aggregate_type: "company",
    aggregate_id: companyId,
    payload: { tier: "free", trial_ends_at: trialEndsAt.toISOString() },
  })

  // 7. Send welcome email
  if (ownerProfile?.email) {
    const appUrl = process.env["NEXT_PUBLIC_APP_URL"] ?? "http://localhost:3000"
    try {
      const { PlatformRegistrationApproved } =
        await import("@/emails/platform/platform-registration-approved")
      await sendPlatformEmail({
        to: ownerProfile.email as string,
        subject: "Your Bivro account is ready — welcome aboard",
        react: createElement(PlatformRegistrationApproved, {
          companyName: (company.legal_name ?? company.name) as string,
          ownerName: (ownerProfile.first_name ?? "there") as string,
          loginUrl: `${appUrl}/login`,
        }),
      })
    } catch {
      console.error("[approve] Failed to send approval email")
    }
  }

  return NextResponse.json({
    success: true,
    companyId,
    status: "active",
    trialEndsAt: trialEndsAt.toISOString(),
  })
}
