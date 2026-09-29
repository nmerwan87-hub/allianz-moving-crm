import type { LucideIcon } from "lucide-react"
import { cn } from "@/app/(dashboard)/_lib/cn"

export function EmptyState({
  icon: Icon,
  title,
  description,
  action,
  className,
}: {
  icon?: LucideIcon
  title: string
  description?: string
  action?: React.ReactNode
  className?: string
}) {
  return (
    <div
      className={cn(
        "border-surface-divider bg-surface-raised flex flex-col items-center justify-center rounded-[var(--radius-lg)] border border-dashed px-6 py-16 text-center",
        className,
      )}
    >
      {Icon && <Icon className="text-text-muted mb-4 h-8 w-8" strokeWidth={1.5} aria-hidden />}
      <h3 className="text-text-primary font-semibold text-[var(--text-display-md)]">{title}</h3>
      {description && <p className="text-text-secondary mt-1.5 max-w-sm text-sm">{description}</p>}
      {action && <div className="mt-5">{action}</div>}
    </div>
  )
}
