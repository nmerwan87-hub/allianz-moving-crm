"use client"

import { trpc } from "@/lib/trpc/client"

/**
 * Whether the current user holds a permission in the active company. Owners
 * hold every permission. Only decides what the UI offers — the server checks
 * every request again.
 */
export function useHasPermission(key: string): boolean {
  const me = trpc.iam.session.me.useQuery()
  if (!me.data) return false
  return me.data.role === "owner" || me.data.permissionKeys.includes(key)
}
