"use client"

import Link from "next/link"
import { Building2, ChevronRight, Mail, Package, Tags, UsersRound } from "lucide-react"
import { trpc } from "@/lib/trpc/client"
import { PageHeader } from "@/app/(dashboard)/_components/ui/page-header"
import { Card } from "@/app/(dashboard)/_components/ui/card"
import { Skeleton } from "@/app/(dashboard)/_components/ui/skeleton"
import { EmptyState } from "@/app/(dashboard)/_components/ui/empty-state"

const SECTIONS = [
  {
    href: "/settings/company",
    icon: Building2,
    title: "Firmendaten",
    description: "Name, Adresse, UID/MWST-Nr., Bankverbindung, Logo und Farbe.",
    permission: "settings.company",
  },
  {
    href: "/settings/services",
    icon: Package,
    title: "Leistungen",
    description: "Euer Leistungskatalog: Preise, Einheiten und MWST für Offerten.",
    permission: "settings.services",
  },
  {
    href: "/settings/rates",
    icon: Tags,
    title: "Ansätze und Bedingungen",
    description: "Stundenansätze der Teams, Zuschläge, Anzahlung, Gültigkeit und Zahlungsfrist.",
    permission: "settings.services",
  },
  {
    href: "/settings/automations",
    icon: Mail,
    title: "E-Mail-Automatik",
    description: "Automatische E-Mails an Kunden: nachfassen, Erinnerungen, Dank — Texte anpassen.",
    permission: "communications.view",
  },
  {
    href: "/settings/team",
    icon: UsersRound,
    title: "Team und Rechte",
    description: "Büro-Mitarbeitende einladen und festlegen, was sie dürfen.",
    permission: "settings.users",
    ownerOnly: true,
  },
] as const

export default function SettingsPage() {
  const me = trpc.iam.session.me.useQuery()

  if (me.isLoading) {
    return (
      <div className="space-y-3">
        <Skeleton className="h-8 w-48" />
        {Array.from({ length: 4 }).map((_, i) => (
          <Skeleton key={i} className="h-20 w-full rounded-[var(--radius-lg)]" />
        ))}
      </div>
    )
  }

  const isOwner = me.data?.role === "owner"
  const keys = new Set(me.data?.permissionKeys ?? [])
  const visible = SECTIONS.filter((s) =>
    isOwner ? true : !("ownerOnly" in s && s.ownerOnly) && keys.has(s.permission),
  )

  return (
    <div>
      <PageHeader title="Einstellungen" description="Eure Firma in Bivro einrichten." />
      {visible.length === 0 ? (
        <EmptyState
          icon={Building2}
          title="Keine Einstellungen verfügbar"
          description="Frag den Inhaber nach Zugriff auf die Einstellungen."
        />
      ) : (
        <div className="grid gap-3 sm:grid-cols-2">
          {visible.map((section) => (
            <Link key={section.href} href={section.href}>
              <Card className="hover:border-signal-400 flex items-center gap-4 p-4 transition-colors">
                <div className="bg-surface-sunken flex h-10 w-10 shrink-0 items-center justify-center rounded-[var(--radius-md)]">
                  <section.icon className="text-text-secondary h-5 w-5" />
                </div>
                <div className="min-w-0 flex-1">
                  <p className="text-text-primary font-semibold">{section.title}</p>
                  <p className="text-text-muted text-sm">{section.description}</p>
                </div>
                <ChevronRight className="text-text-muted h-4 w-4 shrink-0" />
              </Card>
            </Link>
          ))}
        </div>
      )}
    </div>
  )
}
