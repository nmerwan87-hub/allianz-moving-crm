"use client"

import Link from "next/link"
import { usePathname } from "next/navigation"
import { useMemo } from "react"
import { navSections, type NavItem } from "@/app/(dashboard)/_lib/nav-config"
import { cn } from "@/app/(dashboard)/_lib/cn"
import { CompanySwitcher, type SwitcherCompany } from "./company-switcher"

interface SidebarProps {
  permissionKeys: Set<string>
  isOwner: boolean
  activeCompany: SwitcherCompany
  companies: SwitcherCompany[]
  onNavigate?: () => void
}

function isItemVisible(item: NavItem, permissionKeys: Set<string>, isOwner: boolean): boolean {
  if (isOwner) return true
  if (!item.permission) return true
  return permissionKeys.has(item.permission)
}

export function Sidebar({
  permissionKeys,
  isOwner,
  activeCompany,
  companies,
  onNavigate,
}: SidebarProps) {
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
        <CompanySwitcher active={activeCompany} companies={companies} />
      </div>

      {/* Navigation */}
      <nav className="flex-1 overflow-y-auto px-3 py-4">
        {sections.map((section) => (
          <div key={section.label} className="mb-5">
            <p className="text-text-muted mb-2 px-2 text-[length:var(--text-caption)] font-medium tracking-wide uppercase">
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
        <p className="text-text-muted text-[length:var(--text-caption)]">&copy; 2026 Bivro</p>
      </div>
    </aside>
  )
}
