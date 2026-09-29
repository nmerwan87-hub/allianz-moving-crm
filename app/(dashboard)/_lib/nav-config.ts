import type { LucideIcon } from "lucide-react"
import {
  LayoutDashboard,
  Funnel,
  Users,
  Calendar,
  FileText,
  Truck,
  UserCog,
  Car,
  Receipt,
  FileStack,
  CheckSquare,
  Mail,
  Settings,
  UsersRound,
} from "lucide-react"

export interface NavItem {
  label: string
  href: string
  icon: LucideIcon
  /** Permission key required for office users. Owner always sees all items. */
  permission?: string
  /** Marks items that don't have a real page yet (future modules). */
  future?: boolean
}

export interface NavSection {
  label: string
  items: NavItem[]
}

export const navSections: NavSection[] = [
  {
    label: "Main",
    items: [
      { label: "Dashboard", href: "/dashboard", icon: LayoutDashboard },
      { label: "Leads", href: "/leads", icon: Funnel, permission: "leads.view", future: true },
      {
        label: "Customers",
        href: "/customers",
        icon: Users,
        permission: "customers.view",
        future: true,
      },
      { label: "Calendar", href: "/calendar", icon: Calendar, future: true },
      { label: "Quotes", href: "/quotes", icon: FileText, permission: "quotes.view", future: true },
      { label: "Jobs", href: "/jobs", icon: Truck, permission: "jobs.view", future: true },
    ],
  },
  {
    label: "Operations",
    items: [
      {
        label: "Employees",
        href: "/employees",
        icon: UserCog,
        permission: "employees.view",
        future: true,
      },
      {
        label: "Vehicles",
        href: "/vehicles",
        icon: Car,
        permission: "vehicles.view",
        future: true,
      },
    ],
  },
  {
    label: "Finance",
    items: [
      {
        label: "Invoices",
        href: "/invoices",
        icon: Receipt,
        permission: "invoices.view",
        future: true,
      },
    ],
  },
  {
    label: "Workspace",
    items: [
      {
        label: "Documents",
        href: "/documents",
        icon: FileStack,
        permission: "documents.view",
        future: true,
      },
      { label: "Tasks", href: "/tasks", icon: CheckSquare, future: true },
      { label: "Communications", href: "/communications", icon: Mail, future: true },
    ],
  },
  {
    label: "Settings",
    items: [
      {
        label: "Settings",
        href: "/settings",
        icon: Settings,
        permission: "settings.view",
        future: true,
      },
      { label: "Team & Permissions", href: "/settings/team", icon: UsersRound },
    ],
  },
]

export type { NavItem as NavItemType }
