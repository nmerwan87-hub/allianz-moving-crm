import { Resend } from "resend"
import type { ReactElement } from "react"
import { createServiceRoleClient } from "@/lib/supabase/service-role"

/**
 * E-mail in the name of a moving company (quotes, invoices, confirmations).
 * Every attempt is written to email_logs, delivered or not. Without a Resend
 * key (local development) nothing leaves the machine and the result says so.
 */

export interface TenantEmail {
  companyId: string
  companyName: string
  replyTo: string | null
  to: string
  toName: string | null
  subject: string
  react: ReactElement
  language: string
  triggerEvent: string
  entityType: string
  entityId: string
  attachment?: { fileName: string; content: Buffer; documentId: string }
}

export interface TenantEmailResult {
  delivered: boolean
  emailLogId: string
  reason?: string
}

function senderAddress(companyName: string): { address: string; name: string } {
  const domain = process.env["EMAIL_SENDER_DOMAIN"] ?? "mail.bivro.io"
  // Display names must not break the From header
  const name = companyName.replace(/["<>\r\n]/g, "").slice(0, 70) || "Bivro"
  return { address: `offerten@${domain}`, name }
}

export async function sendTenantEmail(email: TenantEmail): Promise<TenantEmailResult> {
  const svc = createServiceRoleClient()
  const from = senderAddress(email.companyName)

  const { data: log, error: logError } = await svc
    .from("email_logs")
    .insert({
      company_id: email.companyId,
      trigger_event: email.triggerEvent,
      entity_type: email.entityType,
      entity_id: email.entityId,
      to_email: email.to,
      to_name: email.toName,
      from_email: from.address,
      from_name: from.name,
      reply_to: email.replyTo,
      subject: email.subject,
      status: "queued",
      language: email.language,
      attached_document_id: email.attachment?.documentId ?? null,
    })
    .select("id")
    .single()
  if (logError || !log) throw new Error(`email_logs: ${logError?.message}`)
  const emailLogId = log.id as string

  const key = process.env["RESEND_API_KEY"]
  if (!key || key.startsWith("re_placeholder")) {
    const reason = "No e-mail provider configured (RESEND_API_KEY)"
    await svc
      .from("email_logs")
      .update({ status: "failed", error_code: "not_configured", error_message: reason })
      .eq("id", emailLogId)
    console.warn("[email:dev] not delivered", { to: email.to, subject: email.subject })
    return { delivered: false, emailLogId, reason }
  }

  const { data, error } = await new Resend(key).emails.send({
    from: `${from.name} <${from.address}>`,
    to: email.to,
    subject: email.subject,
    react: email.react,
    ...(email.replyTo ? { replyTo: email.replyTo } : {}),
    ...(email.attachment
      ? {
          attachments: [{ filename: email.attachment.fileName, content: email.attachment.content }],
        }
      : {}),
  })

  if (error || !data) {
    const reason = error?.message ?? "Unknown error"
    await svc
      .from("email_logs")
      .update({ status: "failed", error_code: error?.name ?? "send_failed", error_message: reason })
      .eq("id", emailLogId)
    return { delivered: false, emailLogId, reason }
  }

  await svc
    .from("email_logs")
    .update({ status: "sent", resend_id: data.id, sent_at: new Date().toISOString() })
    .eq("id", emailLogId)
  return { delivered: true, emailLogId }
}
