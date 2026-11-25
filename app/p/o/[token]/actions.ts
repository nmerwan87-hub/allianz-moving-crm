"use server"

import { headers } from "next/headers"
import { createServiceRoleClient } from "@/lib/supabase/service-role"
import { acceptPortalQuote, declinePortalQuote, type PortalResult } from "@/lib/portal/service"

async function requestInfo() {
  const h = await headers()
  return {
    ip: h.get("x-forwarded-for")?.split(",")[0]?.trim() ?? h.get("x-real-ip") ?? null,
    userAgent: h.get("user-agent"),
  }
}

export async function acceptQuote(
  token: string,
  name: string,
  termsAccepted: boolean,
): Promise<PortalResult> {
  return acceptPortalQuote(createServiceRoleClient(), String(token), {
    name: String(name ?? ""),
    termsAccepted: termsAccepted === true,
    ...(await requestInfo()),
  })
}

export async function declineQuote(token: string, reason: string): Promise<PortalResult> {
  return declinePortalQuote(createServiceRoleClient(), String(token), {
    reason: String(reason ?? ""),
    ...(await requestInfo()),
  })
}
