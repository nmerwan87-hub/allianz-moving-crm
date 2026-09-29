"use client"

import { Bell, Menu, Search } from "lucide-react"
import { UserMenu } from "./user-menu"

interface TopBarProps {
  firstName: string
  lastName: string
  email: string
  role: "owner" | "office"
  onMobileMenuToggle: () => void
}

export function TopBar({ firstName, lastName, email, role, onMobileMenuToggle }: TopBarProps) {
  return (
    <header className="border-surface-divider bg-surface-raised sticky top-0 z-30 flex h-14 items-center gap-3 border-b px-4">
      {/* Mobile menu button */}
      <button
        onClick={onMobileMenuToggle}
        className="text-text-secondary hover:bg-surface-sunken rounded-[var(--radius-md)] p-1.5 lg:hidden"
        aria-label="Toggle navigation menu"
      >
        <Menu className="h-5 w-5" />
      </button>

      {/* Global search placeholder */}
      <div className="relative max-w-md flex-1">
        <Search
          className="text-text-muted pointer-events-none absolute top-1/2 left-3 h-4 w-4 -translate-y-1/2"
          aria-hidden
        />
        <input
          type="search"
          placeholder="Search..."
          disabled
          className="border-surface-divider bg-surface-sunken text-text-muted placeholder:text-text-muted h-9 w-full rounded-[var(--radius-md)] border pr-3 pl-9 text-sm"
          aria-label="Global search (coming soon)"
        />
      </div>

      <div className="flex flex-1 items-center justify-end gap-2">
        {/* Notifications placeholder */}
        <button
          className="text-text-secondary hover:bg-surface-sunken relative rounded-[var(--radius-md)] p-2"
          aria-label="Notifications"
        >
          <Bell className="h-4 w-4" />
          <span className="sr-only">Notifications</span>
        </button>

        {/* User menu */}
        <UserMenu firstName={firstName} lastName={lastName} email={email} role={role} />
      </div>
    </header>
  )
}
