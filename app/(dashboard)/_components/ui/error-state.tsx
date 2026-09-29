import { cn } from "@/app/(dashboard)/_lib/cn"

export function ErrorState({
  title = "Something went wrong",
  message,
  action,
  className,
}: {
  title?: string
  message?: string
  action?: React.ReactNode
  className?: string
}) {
  return (
    <div
      className={cn(
        "border-danger-100 bg-danger-100/50 flex flex-col items-center justify-center rounded-[var(--radius-lg)] border px-6 py-12 text-center",
        className,
      )}
    >
      <h3 className="text-danger-700 font-semibold text-[var(--text-display-md)]">{title}</h3>
      {message && <p className="text-danger-700/80 mt-1.5 max-w-sm text-sm">{message}</p>}
      {action && <div className="mt-4">{action}</div>}
    </div>
  )
}
