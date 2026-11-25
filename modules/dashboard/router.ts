import { createTRPCRouter, protectedProcedure } from "@/lib/trpc/init"
import { TRPCError } from "@trpc/server"
import { z } from "zod"
import { zurichToIso } from "@/lib/format/zurich-time"

const day = z.string().regex(/^\d{4}-\d{2}-\d{2}$/)
const statsInput = z
  .object({ from: day, to: day })
  .refine((r) => r.from <= r.to, { message: "«Von» liegt nach «Bis»." })

function nextDay(date: string): string {
  const d = new Date(`${date}T12:00:00Z`)
  d.setUTCDate(d.getUTCDate() + 1)
  return d.toISOString().slice(0, 10)
}

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

  /**
   * The start page: what needs doing now. Upcoming jobs (7 days), open system
   * tasks, quotes waiting for an answer and the money still outstanding.
   * Sections the user may not see are returned empty.
   */
  overview: protectedProcedure.query(async ({ ctx }) => {
    if (!ctx.companyId) throw new TRPCError({ code: "UNAUTHORIZED" })
    const sb = ctx.supabase
    const today = new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/Zurich" }).format(new Date())
    const inAWeek = new Date(Date.now() + 7 * 86_400_000).toISOString().slice(0, 10)

    const [jobs, tasks, quotes, invoices] = await Promise.all([
      sb
        .from("jobs")
        .select(
          "id, job_number, status, scheduled_date, scheduled_start_time, crew_size_required, origin_city, dest_city, customers(first_name, last_name, company_name, customer_type), job_assignments(id)",
        )
        .is("deleted_at", null)
        .in("status", ["scheduled", "confirmed", "in_progress"])
        .gte("scheduled_date", today)
        .lte("scheduled_date", inAWeek)
        .order("scheduled_date")
        .order("scheduled_start_time")
        .limit(8),
      sb
        .from("tasks")
        .select("id, title, priority, due_at, entity_type, entity_id")
        .is("deleted_at", null)
        .in("status", ["open", "in_progress"])
        .order("due_at", { ascending: true, nullsFirst: false })
        .limit(8),
      sb
        .from("quotes")
        .select(
          "id, quote_number, status, title, total_amount_cents, sent_at, customers(first_name, last_name, company_name, customer_type)",
        )
        .is("deleted_at", null)
        .in("status", ["draft", "sent", "viewed"])
        .order("created_at", { ascending: false })
        .limit(6),
      sb
        .from("invoices")
        .select("status, balance_due_cents")
        .is("deleted_at", null)
        .in("status", ["sent", "viewed", "partially_paid", "overdue"]),
    ])

    const name = (c: Record<string, unknown> | null) =>
      !c
        ? ""
        : c["customer_type"] === "business" && c["company_name"]
          ? (c["company_name"] as string)
          : `${c["first_name"] as string} ${c["last_name"] as string}`

    const open = invoices.data ?? []
    return {
      today,
      jobs: (jobs.data ?? []).map((j) => ({
        id: j.id as string,
        jobNumber: j.job_number as string,
        status: j.status as string,
        date: j.scheduled_date as string,
        startTime: (j.scheduled_start_time as string | null)?.slice(0, 5) ?? null,
        customer: name(j.customers as unknown as Record<string, unknown> | null),
        route: [j.origin_city, j.dest_city].filter(Boolean).join(" → "),
        crewAssigned: ((j.job_assignments as unknown[]) ?? []).length,
        crewNeeded: j.crew_size_required as number,
      })),
      tasks: (tasks.data ?? []).map((t) => ({
        id: t.id as string,
        title: t.title as string,
        priority: t.priority as string,
        dueAt: t.due_at as string | null,
        entityType: t.entity_type as string | null,
        entityId: t.entity_id as string | null,
      })),
      quotes: (quotes.data ?? []).map((q) => ({
        id: q.id as string,
        quoteNumber: q.quote_number as string,
        status: q.status as string,
        title: q.title as string | null,
        totalCents: q.total_amount_cents as number,
        customer: name(q.customers as unknown as Record<string, unknown> | null),
      })),
      money: {
        openCents: open.reduce((sum, i) => sum + (i.balance_due_cents as number), 0),
        overdueCents: open
          .filter((i) => i.status === "overdue")
          .reduce((sum, i) => sum + (i.balance_due_cents as number), 0),
        overdueCount: open.filter((i) => i.status === "overdue").length,
      },
    }
  }),

  /**
   * Statistics for a period (Bixin: "Statistiken"): new inquiries, quotes
   * sent and booked, booking volume and payments received. Counts the user
   * may not see (RLS) come back as zero.
   */
  stats: protectedProcedure.input(statsInput).query(async ({ ctx, input }) => {
    if (!ctx.companyId) throw new TRPCError({ code: "UNAUTHORIZED" })
    const sb = ctx.supabase
    const from = zurichToIso(input.from, "00:00")
    const until = zurichToIso(nextDay(input.to), "00:00")

    const [leads, sent, accepted, open, payments] = await Promise.all([
      sb
        .from("leads")
        .select("id", { count: "exact", head: true })
        .is("deleted_at", null)
        .gte("created_at", from)
        .lt("created_at", until),
      sb
        .from("quotes")
        .select("id", { count: "exact", head: true })
        .is("deleted_at", null)
        .gte("sent_at", from)
        .lt("sent_at", until),
      sb
        .from("quotes")
        .select("total_amount_cents")
        .is("deleted_at", null)
        .eq("status", "accepted")
        .gte("accepted_at", from)
        .lt("accepted_at", until),
      sb
        .from("quotes")
        .select("id", { count: "exact", head: true })
        .is("deleted_at", null)
        .in("status", ["sent", "viewed"]),
      sb
        .from("payments")
        .select("amount_cents")
        .eq("status", "completed")
        .gte("paid_at", from)
        .lt("paid_at", until),
    ])

    const booked = accepted.data ?? []
    return {
      inquiries: leads.count ?? 0,
      quotesSent: sent.count ?? 0,
      quotesOpen: open.count ?? 0,
      quotesBooked: booked.length,
      bookingVolumeCents: booked.reduce((sum, q) => sum + (q.total_amount_cents as number), 0),
      paymentsCents: (payments.data ?? []).reduce((sum, p) => sum + (p.amount_cents as number), 0),
    }
  }),
})
