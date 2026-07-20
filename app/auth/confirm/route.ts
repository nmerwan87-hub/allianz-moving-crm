import { type NextRequest, NextResponse } from "next/server"
import { createElement } from "react"
import { createClient } from "@/lib/supabase/server"
import { createServiceRoleClient } from "@/lib/supabase/service-role"
import { sendPlatformEmail } from "@/lib/email/send"

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url)
  const appUrl = process.env["NEXT_PUBLIC_APP_URL"] ?? "http://localhost:3000"

  const code = searchParams.get("code")
  const tokenHash = searchParams.get("token_hash")
  const type = searchParams.get("type")

  const supabase = await createClient()

  let verifyError: string | null = null

  if (code) {
    const { error } = await supabase.auth.exchangeCodeForSession(code)
    if (error) verifyError = error.message
  } else if (tokenHash && type === "signup") {
    const { error } = await supabase.auth.verifyOtp({ type: "signup", token_hash: tokenHash })
    if (error) verifyError = error.message
  } else {
    return NextResponse.redirect(`${appUrl}/register/verify-expired`)
  }

  if (verifyError) {
    return NextResponse.redirect(`${appUrl}/register/verify-expired`)
  }

  // At this point the user is authenticated — update company_status
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) {
    return NextResponse.redirect(`${appUrl}/register/verify-expired`)
  }

  const svc = createServiceRoleClient()

  // Resolve company_id from profiles
  const { data: profile } = await svc
    .from("profiles")
    .select("company_id, first_name, last_name")
    .eq("id", user.id)
    .maybeSingle()

  if (!profile?.company_id) {
    return NextResponse.redirect(`${appUrl}/login`)
  }

  // Only transition from pending_email_verification → pending_review
  const { data: company } = await svc
    .from("companies")
    .select("id, name, legal_name, company_status")
    .eq("id", profile.company_id)
    .maybeSingle()

  if (!company) {
    return NextResponse.redirect(`${appUrl}/login`)
  }

  if ((company.company_status as string) === "pending_email_verification") {
    await svc.from("companies").update({ company_status: "pending_review" }).eq("id", company.id)

    // Write activity log
    await svc.from("activity_logs").insert({
      company_id: company.id,
      actor_id: user.id,
      actor_type: "user",
      action: "company.email_verified",
      entity_type: "company",
      entity_id: company.id,
    })

    const ownerName = profile.first_name as string | null
    const companyName = (company.legal_name ?? company.name) as string

    // Send "application received" email to owner
    try {
      const { PlatformRegistrationReceived } =
        await import("@/emails/platform/platform-registration-received")
      await sendPlatformEmail({
        to: user.email ?? "",
        subject: "We've received your Bivro application",
        react: createElement(PlatformRegistrationReceived, {
          companyName,
          ownerName: ownerName ?? "there",
        }),
      })
    } catch {
      console.error("[confirm] Failed to send registration-received email")
    }
  }

  return NextResponse.redirect(`${appUrl}/pending-approval`)
}
