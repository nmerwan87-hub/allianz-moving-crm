import { createTRPCRouter } from "./init"
import { iamRouter } from "@/modules/iam/router"
import { dashboardRouter } from "@/modules/dashboard/router"
import { leadsRouter } from "@/modules/leads/router"
import { customersRouter } from "@/modules/customers/router"
import { catalogRouter } from "@/modules/catalog/router"
import { companyRouter } from "@/modules/company/router"
import { workflowRouter } from "@/modules/workflow/router"

export const appRouter = createTRPCRouter({
  iam: iamRouter,
  dashboard: dashboardRouter,
  leads: leadsRouter,
  customers: customersRouter,
  catalog: catalogRouter,
  company: companyRouter,
  workflow: workflowRouter,
})

export type AppRouter = typeof appRouter
