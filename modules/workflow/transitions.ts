import { TRPCError } from "@trpc/server"
import type { SupabaseClient } from "@supabase/supabase-js"

export const WORKFLOW_ENTITIES = [
  "lead",
  "appointment",
  "quote",
  "job",
  "invoice",
  "payment",
] as const
export type WorkflowEntity = (typeof WORKFLOW_ENTITIES)[number]

/**
 * Error prefixes raised by the database (migration 025). The database is the
 * single source of truth for allowed transitions; this only translates its
 * errors into API errors with readable messages.
 */
const ERROR_MAP: Array<{
  prefix: string
  code: TRPCError["code"]
  message: (detail: string) => string
}> = [
  {
    prefix: "invalid_transition:",
    code: "BAD_REQUEST",
    message: (d) => `This status change is not allowed (${d}).`,
  },
  {
    prefix: "system_only_transition:",
    code: "FORBIDDEN",
    message: (d) => `This status is set automatically by the system (${d}).`,
  },
  {
    prefix: "reason_required:",
    code: "BAD_REQUEST",
    message: () => "Please provide a reason for this status change.",
  },
  { prefix: "guard_failed:", code: "PRECONDITION_FAILED", message: (d) => capitalise(d) + "." },
  { prefix: "not_found:", code: "NOT_FOUND", message: () => "Record not found." },
]

function capitalise(text: string): string {
  return text.charAt(0).toUpperCase() + text.slice(1)
}

export function toWorkflowError(error: { message?: string } | null | undefined): TRPCError {
  const message = error?.message ?? ""
  for (const entry of ERROR_MAP) {
    const index = message.indexOf(entry.prefix)
    if (index !== -1) {
      const detail = message.slice(index + entry.prefix.length).trim()
      return new TRPCError({ code: entry.code, message: entry.message(detail) })
    }
  }
  return new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Failed to change status." })
}

/**
 * Change the status of a workflow entity through the database function
 * `transition_status`. With a user client, RLS and the user's role apply; with
 * the service-role client the change counts as a system change.
 */
export async function transitionStatus(
  client: SupabaseClient,
  entity: WorkflowEntity,
  id: string,
  toStatus: string,
  reason?: string | null,
): Promise<void> {
  const { error } = await client.rpc("transition_status", {
    p_entity: entity,
    p_id: id,
    p_to_status: toStatus,
    p_reason: reason?.trim() ? reason.trim() : null,
  })
  if (error) throw toWorkflowError(error)
}
