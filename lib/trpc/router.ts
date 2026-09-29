import { createTRPCRouter } from "./init"
import { iamRouter } from "@/modules/iam/router"
import { dashboardRouter } from "@/modules/dashboard/router"

export const appRouter = createTRPCRouter({
  iam: iamRouter,
  dashboard: dashboardRouter,
})

export type AppRouter = typeof appRouter
