import { initTRPC, TRPCError } from "@trpc/server"
import type { Context } from "./context"
import { getCachedPermissions, hasPermission } from "@/modules/iam/lib/permissions"

const t = initTRPC.context<Context>().create()

export const createTRPCRouter = t.router
export const createCallerFactory = t.createCallerFactory
export const publicProcedure = t.procedure

export const protectedProcedure = t.procedure.use(({ ctx, next }) => {
  if (!ctx.user) {
    throw new TRPCError({ code: "UNAUTHORIZED" })
  }
  return next({
    ctx: {
      ...ctx,
      user: ctx.user,
      companyId: ctx.companyId,
      role: ctx.role,
    },
  })
})

export const ownerProcedure = protectedProcedure.use(({ ctx, next }) => {
  if (ctx.role !== "owner") {
    throw new TRPCError({ code: "FORBIDDEN", message: "Owner access required" })
  }
  return next({ ctx })
})

/**
 * Factory that returns a procedure requiring a specific permission.
 *
 * Owner bypass is the outermost condition — owners are never blocked by any
 * permission check. For office users the resolved permission set is loaded
 * (with a 60-second in-memory cache) and the required key is checked.
 *
 * Usage (future module procedures):
 *   export const myProcedure = permissionProcedure("quotes.create")
 *     .input(...)
 *     .mutation(...)
 */
export const permissionProcedure = (key: string) =>
  protectedProcedure.use(async ({ ctx, next }) => {
    if (ctx.role === "owner") return next({ ctx })
    if (!ctx.user || !ctx.companyId) {
      throw new TRPCError({ code: "UNAUTHORIZED" })
    }
    const perms = await getCachedPermissions(ctx.user.id, ctx.companyId)
    if (!hasPermission(perms, key)) {
      throw new TRPCError({ code: "FORBIDDEN", message: `Missing permission: ${key}` })
    }
    return next({ ctx })
  })
