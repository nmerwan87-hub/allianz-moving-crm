import { AlertTriangle, CheckCircle2, Info, XCircle } from "lucide-react"
import { cn } from "@/app/(dashboard)/_lib/cn"

/** Flat titled card used on detail pages (offer, invoice). */
export function DetailCard({
  title,
  action,
  className,
  children,
}: {
  title: string
  action?: React.ReactNode
  className?: string
  children: React.ReactNode
}) {
  return (
    <section
      className={cn(
        "border-surface-divider bg-surface-raised rounded-[var(--radius-lg)] border px-5 py-4",
        className,
      )}
    >
      <div className="mb-3 flex items-center justify-between gap-3">
        <h2 className="text-text-primary text-sm font-semibold">{title}</h2>
        {action}
      </div>
      {children}
    </section>
  )
}

/** Small label above a value; empty values show a dash. */
export function DetailField({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <dt className="text-text-muted text-xs">{label}</dt>
      <dd className="text-text-primary text-sm">{children || "—"}</dd>
    </div>
  )
}

/** Label and amount on one line, for totals. */
export function AmountRow({
  label,
  value,
  strong,
  muted,
}: {
  label: string
  value: string
  strong?: boolean
  muted?: boolean
}) {
  return (
    <div
      className={cn(
        "flex justify-between gap-4",
        strong
          ? "text-text-primary text-base font-semibold"
          : muted
            ? "text-text-muted"
            : "text-text-secondary",
      )}
    >
      <dt>{label}</dt>
      <dd className="tabular-nums">{value}</dd>
    </div>
  )
}

const TONES = {
  info: { box: "border-sky-200 bg-sky-50 text-sky-900", Icon: Info },
  success: { box: "border-emerald-200 bg-emerald-50 text-emerald-900", Icon: CheckCircle2 },
  warning: { box: "border-amber-200 bg-amber-50 text-amber-900", Icon: AlertTriangle },
  danger: { box: "border-red-200 bg-red-50 text-red-900", Icon: XCircle },
  neutral: { box: "border-surface-divider bg-surface-sunken text-text-primary", Icon: Info },
}

/** Where the record stands and what to do next — always the first thing on a detail page. */
export function StatusBanner({
  tone,
  title,
  children,
}: {
  tone: keyof typeof TONES
  title: string
  children?: React.ReactNode
}) {
  const { box, Icon } = TONES[tone]
  return (
    <div className={cn("flex gap-3 rounded-[var(--radius-lg)] border px-5 py-4", box)}>
      <Icon className="mt-0.5 h-4 w-4 shrink-0" />
      <div className="min-w-0 flex-1 text-sm">
        <p className="font-semibold">{title}</p>
        {children && <div className="mt-0.5">{children}</div>}
      </div>
    </div>
  )
}

/** "1.5" instead of "1.50", "7" instead of "7.00". */
export function formatQuantity(n: number): string {
  return Number(n)
    .toFixed(2)
    .replace(/\.?0+$/, "")
}
