import { createTRPCRouter } from "./init"
import { iamRouter } from "@/modules/iam/router"
import { dashboardRouter } from "@/modules/dashboard/router"
import { leadsRouter } from "@/modules/leads/router"
import { workflowRouter } from "@/modules/workflow/router"

export const appRouter = createTRPCRouter({
  iam: iamRouter,
  dashboard: dashboardRouter,
  leads: leadsRouter,
  workflow: workflowRouter,
})

export type AppRouter = typeof appRouter
