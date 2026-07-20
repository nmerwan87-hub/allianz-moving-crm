import { initTRPC, TRPCError } from "@trpc/server"
import type { Context } from "./context"

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
