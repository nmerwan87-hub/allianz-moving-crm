import { createServiceRoleClient } from "@/lib/supabase/service-role"

export interface EffectivePermissions {
  keys: Set<string>
}

// ─── Per-request 60-second in-memory cache ───────────────────────────────────
// Cache is per server process. Vercel serverless: each invocation may miss the
// cache — that is safe; the fallback is a DB read. 60-second TTL per
// ARCHITECTURE.md permission loading spec.

const permCache = new Map<string, { perms: EffectivePermissions; expiresAt: number }>()

export async function getCachedPermissions(
  userId: string,
  companyId: string,
): Promise<EffectivePermissions> {
  const key = `${userId}:${companyId}`
  const cached = permCache.get(key)
  if (cached && cached.expiresAt > Date.now()) return cached.perms
  const perms = await loadOfficePermissions(userId, companyId)
  permCache.set(key, { perms, expiresAt: Date.now() + 60_000 })
  return perms
}

export function invalidatePermissionCache(userId: string, companyId: string): void {
  permCache.delete(`${userId}:${companyId}`)
}

// ─── Permission resolution ────────────────────────────────────────────────────

/**
 * Loads the effective permission set for an office user.
 * Owner role always has full access — do not call this for owners.
 * Returns a set of permission keys the user is allowed to use.
 *
 * Resolution algorithm (DATABASE_ARCHITECTURE.md §6.24):
 *   1. Collect all groups for user → union all permission_group_assignments.permission_key
 *   2. Apply user_permission_overrides:
 *      - 'grant' override: add permission_key to resolved set
 *      - 'deny'  override: remove permission_key from resolved set (even if group grants it)
 *   3. Result: resolved permission set
 */
export async function loadOfficePermissions(
  userId: string,
  companyId: string,
): Promise<EffectivePermissions> {
  const svc = createServiceRoleClient()

  const { data: groups } = await svc
    .from("user_permission_groups")
    .select("group_id")
    .eq("user_id", userId)
    .eq("company_id", companyId)

  if (!groups || groups.length === 0) {
    const { data: overrides } = await svc
      .from("user_permission_overrides")
      .select("permission_key, override_type")
      .eq("user_id", userId)
      .eq("company_id", companyId)

    const keys = new Set<string>()
    for (const o of overrides ?? []) {
      if (o.override_type === "grant") keys.add(o.permission_key)
    }
    return { keys }
  }

  const groupIds = groups.map((g) => g.group_id)

  const { data: assignments } = await svc
    .from("permission_group_assignments")
    .select("permission_key")
    .in("group_id", groupIds)
    .eq("company_id", companyId)

  const baseKeys = new Set((assignments ?? []).map((a) => a.permission_key))

  const { data: overrides } = await svc
    .from("user_permission_overrides")
    .select("permission_key, override_type")
    .eq("user_id", userId)
    .eq("company_id", companyId)

  for (const override of overrides ?? []) {
    if (override.override_type === "grant") {
      baseKeys.add(override.permission_key)
    } else if (override.override_type === "deny") {
      baseKeys.delete(override.permission_key)
    }
  }

  return { keys: baseKeys }
}

export function hasPermission(perms: EffectivePermissions, key: string): boolean {
  return perms.keys.has(key)
}
