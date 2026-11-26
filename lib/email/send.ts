import { Resend } from "resend"
import type { ReactElement } from "react"

const FROM_ADDRESS = "Bivro <noreply@mail.bivro.io>"

function getResend(): Resend | null {
  const key = process.env["RESEND_API_KEY"]
  if (!key || key.startsWith("re_placeholder")) return null
  return new Resend(key)
}

export interface SendPlatformEmailOptions {
  to: string
  subject: string
  react: ReactElement
}

/** Returns false when no provider is configured (development); throws on provider errors. */
export async function sendPlatformEmail(options: SendPlatformEmailOptions): Promise<boolean> {
  const resend = getResend()

  if (!resend) {
    console.warn("[email:dev]", { to: options.to, subject: options.subject })
    return false
  }

  const { error } = await resend.emails.send({
    from: FROM_ADDRESS,
    to: options.to,
    subject: options.subject,
    react: options.react,
  })

  if (error) {
    console.error("[email:send] Resend error:", error)
    throw new Error(`Failed to send email: ${error.message}`)
  }
  return true
}
