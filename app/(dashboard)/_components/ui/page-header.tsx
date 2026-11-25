import { cn } from "@/app/(dashboard)/_lib/cn"

export function PageHeader({
  title,
  description,
  actions,
  className,
}: {
  title: string
  description?: string
  actions?: React.ReactNode
  className?: string
}) {
  return (
    <div
      className={cn(
        "flex flex-col gap-3 pb-5 sm:flex-row sm:items-end sm:justify-between",
        className,
      )}
    >
      <div>
        <h1 className="text-text-primary text-[length:var(--text-display-md)] font-semibold tracking-tight">
          {title}
        </h1>
        {description && <p className="text-text-secondary mt-1 text-sm">{description}</p>}
      </div>
      {actions && <div className="flex items-center gap-2">{actions}</div>}
    </div>
  )
}
