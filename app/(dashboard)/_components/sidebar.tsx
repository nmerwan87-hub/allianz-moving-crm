"use client"

import Link from "next/link"
import { usePathname } from "next/navigation"
import { useMemo } from "react"
import { navSections, type NavItem } from "@/app/(dashboard)/_lib/nav-config"
import { cn } from "@/app/(dashboard)/_lib/cn"

interface SidebarProps {
  permissionKeys: Set<string>
  isOwner: boolean
  companyName: string
  onNavigate?: () => void
}

function isItemVisible(item: NavItem, permissionKeys: Set<string>, isOwner: boolean): boolean {
  if (isOwner) return true
  if (!item.permission) return true
  return permissionKeys.has(item.permission)
}

export function Sidebar({ permissionKeys, isOwner, companyName, onNavigate }: SidebarProps) {
  const pathname = usePathname()

  const sections = useMemo(
    () =>
      navSections
        .map((section) => ({
          ...section,
          items: section.items.filter((item) => isItemVisible(item, permissionKeys, isOwner)),
        }))
        .filter((section) => section.items.length > 0),
    [permissionKeys, isOwner],
  )

  const linkProps = onNavigate
    ? { onClick: onNavigate as React.MouseEventHandler<HTMLAnchorElement> }
    : {}

  return (
    <aside className="border-surface-divider bg-surface-raised flex h-full w-60 flex-col border-r">
      {/* Company identity */}
      <div className="border-surface-divider flex h-14 items-center gap-2 border-b px-4">
        <span className="bg-ink-900 text-text-inverse flex h-7 w-7 items-center justify-center rounded-[var(--radius-sm)] text-xs font-bold">
          B
        </span>
        <span className="text-text-primary truncate text-sm font-semibold">
          {companyName || "Bivro"}
        </span>
      </div>

      {/* Navigation */}
      <nav className="flex-1 overflow-y-auto px-3 py-4">
        {sections.map((section) => (
          <div key={section.label} className="mb-5">
            <p className="text-text-muted mb-2 px-2 font-medium tracking-wide text-[var(--text-caption)] uppercase">
              {section.label}
            </p>
            <ul className="space-y-0.5">
              {section.items.map((item) => {
                const isActive =
                  pathname === item.href ||
                  (item.href !== "/dashboard" && pathname.startsWith(item.href))
                const Icon = item.icon
                return (
                  <li key={item.href}>
                    <Link
                      href={item.href}
                      {...linkProps}
                      className={cn(
                        "flex items-center gap-2.5 rounded-[var(--radius-md)] px-2.5 py-2 text-sm transition-colors duration-[var(--duration-quick)]",
                        isActive
                          ? "bg-ink-100 text-ink-900 font-medium"
                          : "text-text-secondary hover:bg-surface-sunken hover:text-text-primary",
                      )}
                    >
                      <Icon
                        className={cn(
                          "h-4 w-4 shrink-0",
                          isActive ? "text-ink-900" : "text-text-muted",
                        )}
                        strokeWidth={2}
                      />
                      <span className="truncate">{item.label}</span>
                    </Link>
                  </li>
                )
              })}
            </ul>
          </div>
        ))}
      </nav>

      {/* Footer */}
      <div className="border-surface-divider border-t px-4 py-3">
        <p className="text-text-muted text-[var(--text-caption)]">&copy; 2026 Bivro</p>
      </div>
    </aside>
  )
}
