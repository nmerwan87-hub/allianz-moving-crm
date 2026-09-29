import { TRPCError } from "@trpc/server"
import { createTRPCRouter, protectedProcedure } from "@/lib/trpc/init"
import { createServiceRoleClient } from "@/lib/supabase/service-role"
import { getCachedPermissions } from "@/modules/iam/lib/permissions"

export const sessionRouter = createTRPCRouter({
  /** Returns the current user's profile, company identity, and resolved permission keys for shell navigation. */
  me: protectedProcedure.query(async ({ ctx }) => {
    if (!ctx.companyId) throw new TRPCError({ code: "UNAUTHORIZED" })

    const svc = createServiceRoleClient()

    const { data: profile, error: profileError } = await svc
      .from("profiles")
      .select("id, first_name, last_name, email, role, company_id")
      .eq("id", ctx.user!.id)
      .maybeSingle()

    if (profileError || !profile) {
      throw new TRPCError({ code: "NOT_FOUND", message: "Profile not found" })
    }

    const { data: company, error: companyError } = await svc
      .from("companies")
      .select("name, legal_name, slug")
      .eq("id", ctx.companyId)
      .maybeSingle()

    if (companyError) {
      throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" })
    }

    let permissionKeys: string[] = []
    if (ctx.role !== "owner") {
      const perms = await getCachedPermissions(ctx.user!.id, ctx.companyId)
      permissionKeys = [...perms.keys]
    }

    return {
      profile: {
        id: profile.id,
        firstName: profile.first_name,
        lastName: profile.last_name,
        email: profile.email,
        role: profile.role as "owner" | "office",
      },
      company: {
        name: company?.name ?? company?.legal_name ?? "",
        slug: company?.slug ?? "",
      },
      role: ctx.role as "owner" | "office",
      permissionKeys,
    }
  }),
})
