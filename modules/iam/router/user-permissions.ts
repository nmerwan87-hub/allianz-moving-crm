import { z } from "zod"
import { TRPCError } from "@trpc/server"
import { createTRPCRouter, ownerProcedure } from "@/lib/trpc/init"
import { createServiceRoleClient } from "@/lib/supabase/service-role"
import { writeActivityLog } from "@/lib/audit/activity"
import { invalidatePermissionCache } from "../lib/permissions"

export const userPermissionsRouter = createTRPCRouter({
  // List permission groups assigned to a specific user
  listGroups: ownerProcedure
    .input(z.object({ userId: z.string().uuid() }))
    .query(async ({ input, ctx }) => {
      if (!ctx.companyId) throw new TRPCError({ code: "UNAUTHORIZED" })
      const svc = createServiceRoleClient()

      const { data: memberships, error } = await svc
        .from("user_permission_groups")
        .select("group_id")
        .eq("user_id", input.userId)
        .eq("company_id", ctx.companyId)

      if (error) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" })

      const groupIds = (memberships ?? []).map((m) => m.group_id)
      if (groupIds.length === 0) return []

      const { data: groups } = await svc
        .from("permission_groups")
        .select("id, name, description, color, is_default")
        .eq("company_id", ctx.companyId)
        .in("id", groupIds)
        .is("deleted_at", null)

      return (groups ?? []).map((g) => ({
        id: g.id,
        name: g.name,
        description: g.description,
        color: g.color,
        isDefault: g.is_default,
      }))
    }),

  // Assign a user to a permission group
  assignGroup: ownerProcedure
    .input(
      z.object({
        userId: z.string().uuid(),
        groupId: z.string().uuid(),
      }),
    )
    .mutation(async ({ input, ctx }) => {
      if (!ctx.companyId) throw new TRPCError({ code: "UNAUTHORIZED" })
      const svc = createServiceRoleClient()

      // Verify user and group both belong to this company
      const [{ data: profile }, { data: group }] = await Promise.all([
        svc
          .from("profiles")
          .select("id, first_name, last_name, role")
          .eq("id", input.userId)
          .eq("company_id", ctx.companyId)
          .is("deleted_at", null)
          .maybeSingle(),
        svc
          .from("permission_groups")
          .select("id, name")
          .eq("id", input.groupId)
          .eq("company_id", ctx.companyId)
          .is("deleted_at", null)
          .maybeSingle(),
      ])

      if (!profile) throw new TRPCError({ code: "NOT_FOUND", message: "User not found." })
      if (!group) throw new TRPCError({ code: "NOT_FOUND", message: "Permission group not found." })
      if (profile.role === "owner") {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "Cannot assign permission groups to owner.",
        })
      }

      const { error } = await svc.from("user_permission_groups").insert({
        user_id: input.userId,
        group_id: input.groupId,
        company_id: ctx.companyId,
        assigned_by: ctx.user.id,
      })

      if (error) {
        if (error.code === "23505") {
          throw new TRPCError({
            code: "CONFLICT",
            message: "User is already a member of this group.",
          })
        }
        throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" })
      }

      invalidatePermissionCache(input.userId, ctx.companyId)

      await writeActivityLog(ctx, {
        action: "user.group_assigned",
        entityType: "profile",
        entityId: input.userId,
        entityLabel: `${profile.first_name} ${profile.last_name}`,
        afterState: { groupId: input.groupId, groupName: group.name },
      })

      return { success: true }
    }),

  // Remove a user from a permission group
  removeGroup: ownerProcedure
    .input(
      z.object({
        userId: z.string().uuid(),
        groupId: z.string().uuid(),
      }),
    )
    .mutation(async ({ input, ctx }) => {
      if (!ctx.companyId) throw new TRPCError({ code: "UNAUTHORIZED" })
      const svc = createServiceRoleClient()

      const [{ data: profile }, { data: group }] = await Promise.all([
        svc
          .from("profiles")
          .select("id, first_name, last_name")
          .eq("id", input.userId)
          .eq("company_id", ctx.companyId)
          .is("deleted_at", null)
          .maybeSingle(),
        svc
          .from("permission_groups")
          .select("id, name")
          .eq("id", input.groupId)
          .eq("company_id", ctx.companyId)
          .maybeSingle(),
      ])

      if (!profile) throw new TRPCError({ code: "NOT_FOUND", message: "User not found." })
      if (!group) throw new TRPCError({ code: "NOT_FOUND", message: "Permission group not found." })

      const { error } = await svc
        .from("user_permission_groups")
        .delete()
        .eq("user_id", input.userId)
        .eq("group_id", input.groupId)
        .eq("company_id", ctx.companyId)

      if (error) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" })

      invalidatePermissionCache(input.userId, ctx.companyId)

      await writeActivityLog(ctx, {
        action: "user.group_removed",
        entityType: "profile",
        entityId: input.userId,
        entityLabel: `${profile.first_name} ${profile.last_name}`,
        beforeState: { groupId: input.groupId, groupName: group.name },
      })

      return { success: true }
    }),

  // List individual permission overrides for a user
  listOverrides: ownerProcedure
    .input(z.object({ userId: z.string().uuid() }))
    .query(async ({ input, ctx }) => {
      if (!ctx.companyId) throw new TRPCError({ code: "UNAUTHORIZED" })
      const svc = createServiceRoleClient()

      const { data, error } = await svc
        .from("user_permission_overrides")
        .select("id, permission_key, override_type, created_at")
        .eq("user_id", input.userId)
        .eq("company_id", ctx.companyId)
        .order("permission_key", { ascending: true })

      if (error) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" })

      return (data ?? []).map((o) => ({
        id: o.id,
        permissionKey: o.permission_key,
        overrideType: o.override_type as "grant" | "deny",
        createdAt: o.created_at as string,
      }))
    }),

  // Set (upsert) a single permission override for a user
  setOverride: ownerProcedure
    .input(
      z.object({
        userId: z.string().uuid(),
        permissionKey: z.string().min(1),
        overrideType: z.enum(["grant", "deny"]),
      }),
    )
    .mutation(async ({ input, ctx }) => {
      if (!ctx.companyId) throw new TRPCError({ code: "UNAUTHORIZED" })
      const svc = createServiceRoleClient()

      const { data: profile } = await svc
        .from("profiles")
        .select("id, first_name, last_name, role")
        .eq("id", input.userId)
        .eq("company_id", ctx.companyId)
        .is("deleted_at", null)
        .maybeSingle()

      if (!profile) throw new TRPCError({ code: "NOT_FOUND", message: "User not found." })
      if (profile.role === "owner") {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "Cannot set permission overrides for owner.",
        })
      }

      // Capture existing override for audit log
      const { data: existing } = await svc
        .from("user_permission_overrides")
        .select("override_type")
        .eq("user_id", input.userId)
        .eq("permission_key", input.permissionKey)
        .eq("company_id", ctx.companyId)
        .maybeSingle()

      const { error } = await svc.from("user_permission_overrides").upsert(
        {
          user_id: input.userId,
          permission_key: input.permissionKey,
          override_type: input.overrideType,
          company_id: ctx.companyId,
          set_by: ctx.user.id,
        },
        { onConflict: "user_id,permission_key" },
      )

      if (error) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" })

      invalidatePermissionCache(input.userId, ctx.companyId)

      await writeActivityLog(ctx, {
        action: "user.permission_override_set",
        entityType: "profile",
        entityId: input.userId,
        entityLabel: `${profile.first_name} ${profile.last_name}`,
        ...(existing
          ? {
              beforeState: {
                permissionKey: input.permissionKey,
                overrideType: existing.override_type,
              },
            }
          : {}),
        afterState: { permissionKey: input.permissionKey, overrideType: input.overrideType },
      })

      return { success: true }
    }),

  // Remove a single permission override for a user
  removeOverride: ownerProcedure
    .input(
      z.object({
        userId: z.string().uuid(),
        permissionKey: z.string().min(1),
      }),
    )
    .mutation(async ({ input, ctx }) => {
      if (!ctx.companyId) throw new TRPCError({ code: "UNAUTHORIZED" })
      const svc = createServiceRoleClient()

      const { data: profile } = await svc
        .from("profiles")
        .select("id, first_name, last_name")
        .eq("id", input.userId)
        .eq("company_id", ctx.companyId)
        .is("deleted_at", null)
        .maybeSingle()

      if (!profile) throw new TRPCError({ code: "NOT_FOUND", message: "User not found." })

      const { data: existing } = await svc
        .from("user_permission_overrides")
        .select("override_type")
        .eq("user_id", input.userId)
        .eq("permission_key", input.permissionKey)
        .eq("company_id", ctx.companyId)
        .maybeSingle()

      if (!existing) throw new TRPCError({ code: "NOT_FOUND", message: "Override not found." })

      const { error } = await svc
        .from("user_permission_overrides")
        .delete()
        .eq("user_id", input.userId)
        .eq("permission_key", input.permissionKey)
        .eq("company_id", ctx.companyId)

      if (error) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" })

      invalidatePermissionCache(input.userId, ctx.companyId)

      await writeActivityLog(ctx, {
        action: "user.permission_override_removed",
        entityType: "profile",
        entityId: input.userId,
        entityLabel: `${profile.first_name} ${profile.last_name}`,
        beforeState: { permissionKey: input.permissionKey, overrideType: existing.override_type },
      })

      return { success: true }
    }),
})
