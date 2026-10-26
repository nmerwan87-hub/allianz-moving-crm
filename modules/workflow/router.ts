import { z } from "zod"
import { TRPCError } from "@trpc/server"
import { createTRPCRouter, protectedProcedure } from "@/lib/trpc/init"
import { WORKFLOW_ENTITIES } from "./transitions"

const entityInput = z.enum(WORKFLOW_ENTITIES)

export const workflowRouter = createTRPCRouter({
  /**
   * Statuses a user may move an entity to from its current status. System-only
   * transitions (set automatically) are excluded, so the UI never offers them.
   */
  allowedTransitions: protectedProcedure
    .input(z.object({ entity: entityInput, fromStatus: z.string().min(1) }))
    .query(async ({ ctx, input }) => {
      const { data, error } = await ctx.supabase
        .from("workflow_transitions")
        .select("to_status, reason_column")
        .eq("entity_type", input.entity)
        .eq("from_status", input.fromStatus)
        .eq("system_only", false)

      if (error) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" })

      return (data ?? []).map((row) => ({
        toStatus: row.to_status as string,
        requiresReason: row.reason_column !== null,
      }))
    }),

  /** Status timeline of one record, newest first. RLS limits it to the active company. */
  history: protectedProcedure
    .input(z.object({ entity: entityInput, id: z.string().uuid() }))
    .query(async ({ ctx, input }) => {
      const { data, error } = await ctx.supabase
        .from("status_history")
        .select("id, from_status, to_status, actor_id, actor_type, reason, created_at")
        .eq("entity_type", input.entity)
        .eq("entity_id", input.id)
        .order("created_at", { ascending: false })

      if (error) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" })

      return (data ?? []).map((row) => ({
        id: row.id as string,
        fromStatus: row.from_status as string | null,
        toStatus: row.to_status as string,
        actorId: row.actor_id as string | null,
        actorType: row.actor_type as "user" | "system",
        reason: row.reason as string | null,
        createdAt: row.created_at as string,
      }))
    }),
})
