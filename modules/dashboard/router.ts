import { createTRPCRouter, protectedProcedure } from "@/lib/trpc/init"
import { TRPCError } from "@trpc/server"

export const dashboardRouter = createTRPCRouter({
  /** Returns real counts from CRM tables for the current tenant. Uses RLS-scoped client. */
  metrics: protectedProcedure.query(async ({ ctx }) => {
    if (!ctx.companyId) throw new TRPCError({ code: "UNAUTHORIZED" })
    const sb = ctx.supabase

    const [leads, customers, quotes, jobs, invoices, tasks] = await Promise.all([
      sb.from("leads").select("id", { count: "exact", head: true }).is("deleted_at", null),
      sb.from("customers").select("id", { count: "exact", head: true }).is("deleted_at", null),
      sb
        .from("quotes")
        .select("id", { count: "exact", head: true })
        .is("deleted_at", null)
        .in("status", ["draft", "sent", "viewed"]),
      sb
        .from("jobs")
        .select("id", { count: "exact", head: true })
        .is("deleted_at", null)
        .in("status", ["scheduled", "confirmed", "in_progress"]),
      sb
        .from("invoices")
        .select("id", { count: "exact", head: true })
        .is("deleted_at", null)
        .in("status", ["sent", "viewed", "overdue", "partially_paid"]),
      sb
        .from("tasks")
        .select("id", { count: "exact", head: true })
        .is("deleted_at", null)
        .eq("status", "open"),
    ])

    return {
      activeLeads: leads.count ?? 0,
      totalCustomers: customers.count ?? 0,
      activeQuotes: quotes.count ?? 0,
      activeJobs: jobs.count ?? 0,
      outstandingInvoices: invoices.count ?? 0,
      openTasks: tasks.count ?? 0,
    }
  }),
})
