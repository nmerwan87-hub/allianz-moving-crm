import { TRPCError } from "@trpc/server"
import { createTRPCRouter, protectedProcedure } from "@/lib/trpc/init"
import { createServiceRoleClient } from "@/lib/supabase/service-role"
import { listCompanyMembers } from "@/modules/iam/lib/membership"

export const teamRouter = createTRPCRouter({
  list: protectedProcedure.query(async ({ ctx }) => {
    if (!ctx.companyId) throw new TRPCError({ code: "UNAUTHORIZED" })

    const svc = createServiceRoleClient()

    let members
    try {
      members = await listCompanyMembers(svc, ctx.companyId)
    } catch {
      throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" })
    }

    const profileIds = members.map((m) => m.id)
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

    return members.map((p) => ({
      id: p.id,
      firstName: p.firstName,
      lastName: p.lastName,
      email: p.email,
      role: p.role,
      isActive: p.isActive,
      lastSeenAt: p.lastSeenAt,
      createdAt: p.joinedAt,
      groups: groupsByUser.get(p.id) ?? [],
      overrideCount: overrideCountByUser.get(p.id) ?? 0,
    }))
  }),
})
