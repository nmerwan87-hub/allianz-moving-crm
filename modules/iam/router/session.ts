import { z } from "zod"
import { TRPCError } from "@trpc/server"
import { createTRPCRouter, protectedProcedure } from "@/lib/trpc/init"
import { createServiceRoleClient } from "@/lib/supabase/service-role"
import { getCachedPermissions } from "@/modules/iam/lib/permissions"
import { listUserCompanies } from "@/modules/iam/lib/membership"

const LOCATABLE_TABLES = {
  lead: "leads",
} as const

export const sessionRouter = createTRPCRouter({
  /** Returns the current user's profile, company identity, and resolved permission keys for shell navigation. */
  me: protectedProcedure.query(async ({ ctx }) => {
    if (!ctx.companyId) throw new TRPCError({ code: "UNAUTHORIZED" })

    const svc = createServiceRoleClient()

    const { data: profile, error: profileError } = await svc
      .from("profiles")
      .select("id, first_name, last_name, email, company_id")
      .eq("id", ctx.user!.id)
      .maybeSingle()

    if (profileError || !profile) {
      throw new TRPCError({ code: "NOT_FOUND", message: "Profile not found" })
    }

    const { data: company, error: companyError } = await svc
      .from("companies")
      .select("name, legal_name, slug, logo_url")
      .eq("id", ctx.companyId)
      .maybeSingle()

    if (companyError) {
      throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" })
    }

    // The token hook falls back to another membership when the stored active
    // company is no longer accessible. Persist that choice so profiles.company_id
    // and the JWT agree again (profile self-updates depend on it).
    if (profile.company_id !== ctx.companyId) {
      await ctx.supabase.rpc("switch_active_company", { p_company_id: ctx.companyId })
    }

    const companies = await listUserCompanies(svc, ctx.user!.id)

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
      },
      company: {
        id: ctx.companyId,
        name: company?.name ?? company?.legal_name ?? "",
        slug: company?.slug ?? "",
        logoUrl: (company?.logo_url as string | null | undefined) ?? null,
      },
      companies,
      role: ctx.role as "owner" | "office",
      permissionKeys,
    }
  }),

  /**
   * Makes another of the caller's companies the active one.
   *
   * The database function verifies the membership; the browser only requests
   * the switch. The client must refresh its session afterwards so the token
   * hook issues a JWT for the new company — until then RLS still uses the old one.
   */
  switchCompany: protectedProcedure
    .input(z.object({ companyId: z.string().uuid() }))
    .mutation(async ({ ctx, input }) => {
      if (input.companyId === ctx.companyId) return { companyId: input.companyId }

      const { error } = await ctx.supabase.rpc("switch_active_company", {
        p_company_id: input.companyId,
      })

      if (error) {
        throw new TRPCError({
          code: "FORBIDDEN",
          message: "You do not have access to this company.",
        })
      }

      return { companyId: input.companyId }
    }),

  /**
   * For a record that is not visible in the active company: if it belongs to
   * another company the caller is an active member of, say which one, so the UI
   * can offer a switch instead of a dead end. Reveals nothing about companies
   * the caller does not belong to.
   */
  locateRecord: protectedProcedure
    .input(z.object({ entity: z.enum(["lead"]), id: z.string().uuid() }))
    .query(async ({ ctx, input }) => {
      const svc = createServiceRoleClient()
      const table = LOCATABLE_TABLES[input.entity]

      const { data: record } = await svc
        .from(table)
        .select("company_id")
        .eq("id", input.id)
        .is("deleted_at", null)
        .maybeSingle()

      const recordCompanyId = record?.company_id as string | undefined
      if (!recordCompanyId || recordCompanyId === ctx.companyId) return { found: false as const }

      const companies = await listUserCompanies(svc, ctx.user.id)
      const company = companies.find((c) => c.id === recordCompanyId)
      if (!company) return { found: false as const }

      return { found: true as const, companyId: company.id, companyName: company.name }
    }),
})
