import { TRPCError } from "@trpc/server"
import { createTRPCRouter, protectedProcedure } from "@/lib/trpc/init"
import { createServiceRoleClient } from "@/lib/supabase/service-role"

export const teamRouter = createTRPCRouter({
  list: protectedProcedure.query(async ({ ctx }) => {
    if (!ctx.companyId) throw new TRPCError({ code: "UNAUTHORIZED" })

    const svc = createServiceRoleClient()

    const { data: profiles, error } = await svc
      .from("profiles")
      .select("id, first_name, last_name, email, role, is_active, last_seen_at, created_at")
      .eq("company_id", ctx.companyId)
      .is("deleted_at", null)
      .order("created_at", { ascending: true })

    if (error) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" })

    const profileIds = (profiles ?? []).map((p) => p.id)
    if (profileIds.length === 0) return []

    // Load group memberships for all users in one query
    const { data: memberships } = await svc
      .from("user_permission_groups")
      .select("user_id, group_id")
      .eq("company_id", ctx.companyId)
      .in("user_id", profileIds)

    // Load the group names we need
    const groupIdSet = new Set((memberships ?? []).map((m) => m.group_id))
    const groupIds = [...groupIdSet]

    const { data: groupRows } = groupIds.length
      ? await svc
          .from("permission_groups")
          .select("id, name")
          .eq("company_id", ctx.companyId)
          .in("id", groupIds)
          .is("deleted_at", null)
      : { data: [] }

    const groupById = new Map((groupRows ?? []).map((g) => [g.id, g.name]))

    // Load override counts
    const { data: overrides } = await svc
      .from("user_permission_overrides")
      .select("user_id")
      .eq("company_id", ctx.companyId)
      .in("user_id", profileIds)

    // Build lookup structures
    const groupsByUser = new Map<string, Array<{ id: string; name: string }>>()
    for (const m of memberships ?? []) {
      const name = groupById.get(m.group_id)
      if (!name) continue
      if (!groupsByUser.has(m.user_id)) groupsByUser.set(m.user_id, [])
      groupsByUser.get(m.user_id)!.push({ id: m.group_id, name })
    }

    const overrideCountByUser = new Map<string, number>()
    for (const o of overrides ?? []) {
      overrideCountByUser.set(o.user_id, (overrideCountByUser.get(o.user_id) ?? 0) + 1)
    }

    return (profiles ?? []).map((p) => ({
      id: p.id,
      firstName: p.first_name,
      lastName: p.last_name,
      email: p.email,
      role: p.role as "owner" | "office",
      isActive: p.is_active,
      lastSeenAt: p.last_seen_at as string | null,
      createdAt: p.created_at as string,
      groups: groupsByUser.get(p.id) ?? [],
      overrideCount: overrideCountByUser.get(p.id) ?? 0,
    }))
  }),
})
