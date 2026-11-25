import { z } from "zod"

export const automationIdInput = z.object({ id: z.string().uuid() })
export const runIdInput = z.object({ id: z.string().uuid() })

export const updateAutomationInput = z.object({
  id: z.string().uuid(),
  enabled: z.boolean(),
  /** Days after the trigger, or before the move / expiry for those automations */
  delayDays: z.number().int().min(0).max(60),
  mode: z.enum(["auto_send", "approval"]),
  subject: z.string().trim().min(3, "Betreff fehlt").max(200),
  body: z.string().trim().min(10, "Text fehlt").max(5000),
})

export const listRunsInput = z.object({
  status: z.enum(["approval_pending", "sent", "failed", "skipped"]).optional(),
})

export type UpdateAutomationInput = z.infer<typeof updateAutomationInput>

export interface AutomationItem {
  id: string
  slug: string
  name: string
  description: string | null
  enabled: boolean
  delayDays: number
  /** "after": days after the trigger; "before": days before move/expiry; "now": immediately */
  timing: "after" | "before" | "now"
  mode: "auto_send" | "approval"
  subject: string
  body: string
  customText: boolean
  placeholders: string[]
  activatedAt: string | null
}

export interface AutomationRun {
  id: string
  automationName: string
  status: string
  toEmail: string
  toName: string | null
  entityType: string | null
  entityId: string | null
  reason: string | null
  createdAt: string
}
