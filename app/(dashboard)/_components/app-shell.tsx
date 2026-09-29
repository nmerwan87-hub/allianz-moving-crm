"use client"

import { useState } from "react"
import { createPortal } from "react-dom"
import { Sidebar } from "./sidebar"
import { TopBar } from "./topbar"
import { trpc } from "@/lib/trpc/client"
import { Skeleton } from "./ui/skeleton"
import { ErrorState } from "./ui/error-state"
import { ToastProvider } from "./ui/toast"

export function AppShell({ children }: { children: React.ReactNode }) {
  const [mobileNavOpen, setMobileNavOpen] = useState(false)

  const sessionQuery = trpc.iam.session.me.useQuery()

  // Loading state
  if (sessionQuery.isLoading) {
    return (
      <div className="flex h-screen">
        <div className="border-surface-divider bg-surface-raised hidden w-60 shrink-0 border-r lg:block">
          <div className="border-surface-divider flex h-14 items-center gap-2 border-b px-4">
            <Skeleton className="h-7 w-7 rounded-[var(--radius-sm)]" />
            <Skeleton className="h-4 w-24" />
          </div>
          <div className="space-y-3 p-3">
            {Array.from({ length: 8 }).map((_, i) => (
              <Skeleton key={i} className="h-8 w-full rounded-[var(--radius-md)]" />
            ))}
          </div>
        </div>
        <div className="flex flex-1 flex-col">
          <div className="border-surface-divider bg-surface-raised flex h-14 items-center gap-3 border-b px-4">
            <Skeleton className="h-8 w-64 rounded-[var(--radius-md)]" />
            <div className="flex-1" />
            <Skeleton className="h-8 w-8 rounded-full" />
            <Skeleton className="h-8 w-8 rounded-full" />
          </div>
          <div className="flex-1 p-6">
            <Skeleton className="h-8 w-64" />
            <div className="mt-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {Array.from({ length: 6 }).map((_, i) => (
                <Skeleton key={i} className="h-32 rounded-[var(--radius-lg)]" />
              ))}
            </div>
          </div>
        </div>
      </div>
    )
  }

  // Error state
  if (sessionQuery.isError || !sessionQuery.data) {
    return (
      <div className="flex min-h-screen items-center justify-center p-6">
        <ErrorState
          title="Unable to load your workspace"
          message="There was a problem loading your session. Please try signing in again."
        />
      </div>
    )
  }

  const { profile, company, role, permissionKeys } = sessionQuery.data
  const permSet = new Set(permissionKeys)

  function closeMobileNav() {
    setMobileNavOpen(false)
  }

  return (
    <ToastProvider>
      <div className="flex h-screen overflow-hidden">
        {/* Desktop sidebar — persistent */}
        <div className="hidden shrink-0 lg:block">
          <Sidebar permissionKeys={permSet} isOwner={role === "owner"} companyName={company.name} />
        </div>

        {/* Mobile sidebar — drawer overlay */}
        {mobileNavOpen && typeof document !== "undefined" && (
          <>
            {createPortal(
              <div
                className="fixed inset-0 z-50 bg-black/40 lg:hidden"
                onClick={closeMobileNav}
                aria-hidden
              />,
              document.body,
            )}
            {createPortal(
              <div className="fixed top-0 left-0 z-50 h-full lg:hidden">
                <Sidebar
                  permissionKeys={permSet}
                  isOwner={role === "owner"}
                  companyName={company.name}
                  onNavigate={closeMobileNav}
                />
              </div>,
              document.body,
            )}
          </>
        )}

        {/* Main content area */}
        <div className="flex flex-1 flex-col overflow-hidden">
          <TopBar
            firstName={profile.firstName}
            lastName={profile.lastName}
            email={profile.email}
            role={role}
            onMobileMenuToggle={() => setMobileNavOpen(true)}
          />
          <main className="bg-surface-base flex-1 overflow-y-auto">
            <div className="mx-auto w-full max-w-7xl px-4 py-6 sm:px-6 lg:px-8">{children}</div>
          </main>
        </div>
      </div>
    </ToastProvider>
  )
}
