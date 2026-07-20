import { createServiceRoleClient } from "@/lib/supabase/service-role"

export interface EffectivePermissions {
  keys: Set<string>
}

/**
 * Loads the effective permission set for an office user.
 * Owner role always has full access — do not call this for owners.
 * Returns a set of permission keys the user is allowed to use.
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
    return { keys: new Set() }
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
