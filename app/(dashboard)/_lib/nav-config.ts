import type { LucideIcon } from "lucide-react"
import {
  House,
  List,
  User,
  CalendarDays,
  Tag,
  Truck,
  CreditCard,
  UserCog,
  Car,
  CircleUser,
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

/** Structure follows Bixin: the daily work first (no heading), then operations and account. */
export const navSections: NavSection[] = [
  {
    label: "",
    items: [
      { label: "Übersicht", href: "/dashboard", icon: House },
      { label: "Anfragen", href: "/leads", icon: List, permission: "leads.view" },
      { label: "Kunden", href: "/customers", icon: User, permission: "customers.view" },
      { label: "Kalender", href: "/calendar", icon: CalendarDays, permission: "leads.view" },
      { label: "Offerten", href: "/quotes", icon: Tag, permission: "quotes.view" },
      { label: "Aufträge", href: "/jobs", icon: Truck, permission: "jobs.view" },
      {
        label: "Zahlungsübersicht",
        href: "/invoices",
        icon: CreditCard,
        permission: "invoices.view",
      },
    ],
  },
  {
    label: "Betrieb",
    items: [
      { label: "Mitarbeitende", href: "/employees", icon: UserCog, permission: "employees.view" },
      { label: "Fahrzeuge", href: "/vehicles", icon: Car, permission: "vehicles.view" },
    ],
  },
  {
    label: "Account",
    items: [
      // Visible to everyone; the settings page lists only the sections the user may open
      { label: "Profil & Einstellungen", href: "/settings", icon: CircleUser },
      { label: "Team und Rechte", href: "/settings/team", icon: UsersRound },
    ],
  },
]

export type { NavItem as NavItemType }
