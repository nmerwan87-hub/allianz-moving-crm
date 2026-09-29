import { createTRPCRouter } from "./init"
import { iamRouter } from "@/modules/iam/router"
import { dashboardRouter } from "@/modules/dashboard/router"
import { leadsRouter } from "@/modules/leads/router"

export const appRouter = createTRPCRouter({
  iam: iamRouter,
  dashboard: dashboardRouter,
  leads: leadsRouter,
})

export type AppRouter = typeof appRouter
