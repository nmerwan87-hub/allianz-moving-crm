"use client"

import { Funnel, Users, FileText, Truck, Receipt, CheckSquare } from "lucide-react"
import { trpc } from "@/lib/trpc/client"
import { PageHeader } from "@/app/(dashboard)/_components/ui/page-header"
import { Card, CardContent, CardHeader } from "@/app/(dashboard)/_components/ui/card"
import { Skeleton, SkeletonCard } from "@/app/(dashboard)/_components/ui/skeleton"
import { ErrorState } from "@/app/(dashboard)/_components/ui/error-state"
import { EmptyState } from "@/app/(dashboard)/_components/ui/empty-state"

interface MetricCardProps {
  label: string
  value: number | undefined
  icon: typeof Funnel
  loading: boolean
}

function MetricCard({ label, value, icon: Icon, loading }: MetricCardProps) {
  return (
    <Card>
      <CardContent className="flex items-center gap-4 py-4">
        <div className="bg-surface-sunken flex h-10 w-10 items-center justify-center rounded-[var(--radius-md)]">
          <Icon className="text-text-secondary h-5 w-5" strokeWidth={2} />
        </div>
        <div>
          <p className="text-text-muted text-xs font-medium tracking-wide uppercase">{label}</p>
          {loading ? (
            <Skeleton className="mt-1 h-7 w-16" />
          ) : (
            <p className="text-text-primary font-bold text-[var(--text-display-lg)]">
              {value ?? 0}
            </p>
          )}
        </div>
      </CardContent>
    </Card>
  )
}

export default function DashboardPage() {
  const metricsQuery = trpc.dashboard.metrics.useQuery()
  const sessionQuery = trpc.iam.session.me.useQuery()

  const firstName = sessionQuery.data?.profile.firstName ?? "there"
  const loading = metricsQuery.isLoading
  const metrics = metricsQuery.data
  const allZero =
    metrics &&
    metrics.activeLeads === 0 &&
    metrics.totalCustomers === 0 &&
    metrics.activeQuotes === 0 &&
    metrics.activeJobs === 0 &&
    metrics.outstandingInvoices === 0 &&
    metrics.openTasks === 0

  return (
    <div>
      <PageHeader
        title={`Welcome back, ${firstName}`}
        description="Here's what's happening with your moving company today."
      />

      {metricsQuery.isError ? (
        <ErrorState
          title="Couldn't load dashboard data"
          message="There was a problem fetching your metrics. Please refresh the page."
        />
      ) : (
        <>
          {/* Metric cards — real data from the database */}
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            <MetricCard
              label="Active Leads"
              value={metrics?.activeLeads}
              icon={Funnel}
              loading={loading}
            />
            <MetricCard
              label="Customers"
              value={metrics?.totalCustomers}
              icon={Users}
              loading={loading}
            />
            <MetricCard
              label="Active Quotes"
              value={metrics?.activeQuotes}
              icon={FileText}
              loading={loading}
            />
            <MetricCard
              label="Active Jobs"
              value={metrics?.activeJobs}
              icon={Truck}
              loading={loading}
            />
            <MetricCard
              label="Outstanding Invoices"
              value={metrics?.outstandingInvoices}
              icon={Receipt}
              loading={loading}
            />
            <MetricCard
              label="Open Tasks"
              value={metrics?.openTasks}
              icon={CheckSquare}
              loading={loading}
            />
          </div>

          {/* Operational areas — structured but using real data where possible */}
          <div className="mt-8 grid gap-4 lg:grid-cols-2">
            {/* Upcoming work area */}
            <Card>
              <CardHeader>Upcoming Work</CardHeader>
              <CardContent>
                {loading ? (
                  <div className="space-y-3">
                    <Skeleton className="h-16 w-full" />
                    <Skeleton className="h-16 w-full" />
                  </div>
                ) : (metrics?.activeJobs ?? 0) === 0 ? (
                  <EmptyState
                    icon={Truck}
                    title="No upcoming jobs"
                    description="Scheduled jobs will appear here once you start booking work."
                  />
                ) : (
                  <p className="text-text-secondary text-sm">
                    {metrics?.activeJobs} active job(s) scheduled.
                  </p>
                )}
              </CardContent>
            </Card>

            {/* Recent activity / tasks area */}
            <Card>
              <CardHeader>Tasks &amp; Actions</CardHeader>
              <CardContent>
                {loading ? (
                  <SkeletonCard />
                ) : (metrics?.openTasks ?? 0) === 0 ? (
                  <EmptyState
                    icon={CheckSquare}
                    title="No open tasks"
                    description="Tasks you create will show up here so nothing falls through the cracks."
                  />
                ) : (
                  <p className="text-text-secondary text-sm">
                    {metrics?.openTasks} task(s) need attention.
                  </p>
                )}
              </CardContent>
            </Card>
          </div>

          {/* All-zero onboarding empty state */}
          {allZero && !loading && (
            <div className="mt-8">
              <EmptyState
                icon={Funnel}
                title="Your workspace is ready"
                description="Start by creating your first lead or customer. The CRM pipeline flows from leads to quotes to jobs to invoices."
              />
            </div>
          )}
        </>
      )}
    </div>
  )
}
