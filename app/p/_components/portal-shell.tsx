import type { PortalCompany } from "@/lib/portal/service"
import { formatPhone } from "@/lib/format/phone"

/** Frame of every portal page, in the name of the moving company (not Bivro). */
export function PortalShell({
  company,
  children,
}: {
  company: PortalCompany | null
  children: React.ReactNode
}) {
  return (
    <div className="bg-surface-base min-h-full">
      <header className="border-surface-divider bg-surface-raised border-b">
        <div className="mx-auto flex max-w-3xl items-center gap-3 px-4 py-4">
          {company?.logoUrl ? (
            // eslint-disable-next-line @next/next/no-img-element -- tenant logo from storage
            <img src={company.logoUrl} alt={company.name} className="h-10 w-auto max-w-48" />
          ) : (
            <span
              className="text-lg font-semibold"
              style={{ color: company?.accentColor ?? "#2b80c5" }}
            >
              {company?.name ?? ""}
            </span>
          )}
        </div>
      </header>
      <main className="mx-auto max-w-3xl px-4 py-6 sm:py-8">{children}</main>
      {company && (
        <footer className="text-text-muted mx-auto max-w-3xl px-4 pb-10 text-xs leading-relaxed">
          <p className="text-text-secondary font-medium">{company.name}</p>
          {company.addressLines.length > 0 && <p>{company.addressLines.join(" · ")}</p>}
          <p>
            {[company.phone ? formatPhone(company.phone) : null, company.email, company.website]
              .filter(Boolean)
              .join(" · ")}
          </p>
        </footer>
      )}
    </div>
  )
}

export function PortalCard({ title, children }: { title?: string; children: React.ReactNode }) {
  return (
    <section className="border-surface-divider bg-surface-raised rounded-[var(--radius-lg)] border px-5 py-4">
      {title && <h2 className="text-text-primary mb-3 text-base font-semibold">{title}</h2>}
      {children}
    </section>
  )
}

export function LinkInvalid({ what }: { what: string }) {
  return (
    <PortalShell company={null}>
      <PortalCard>
        <h1 className="text-text-primary text-lg font-semibold">Link nicht gültig</h1>
        <p className="text-text-secondary mt-2 text-sm">
          {what} ist über diesen Link nicht mehr erreichbar. Der Link ist abgelaufen oder wurde
          ersetzt. Bitte wenden Sie sich an die Umzugsfirma, die Ihnen den Link geschickt hat.
        </p>
      </PortalCard>
    </PortalShell>
  )
}

/** "2026-11-26" or an ISO timestamp → "26.11.2026" (Swiss calendar day). */
export function swissDate(value: string | null): string {
  if (!value) return "—"
  const day =
    value.length === 10
      ? value
      : new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/Zurich" }).format(new Date(value))
  const [y, m, d] = day.split("-")
  return `${d}.${m}.${y}`
}

export function qty(n: number): string {
  return Number(n)
    .toFixed(2)
    .replace(/\.?0+$/, "")
}
