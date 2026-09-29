import { cn } from "@/app/(dashboard)/_lib/cn"

export function Card({ className, children, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      className={cn(
        "border-surface-divider bg-surface-raised rounded-[var(--radius-lg)] border shadow-[var(--shadow-elevation-1)]",
        className,
      )}
      {...props}
    >
      {children}
    </div>
  )
}

export function CardHeader({
  className,
  children,
  ...props
}: React.HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      className={cn(
        "border-surface-divider border-b px-5 py-4 font-semibold text-[var(--text-display-md)]",
        className,
      )}
      {...props}
    >
      {children}
    </div>
  )
}

export function CardContent({
  className,
  children,
  ...props
}: React.HTMLAttributes<HTMLDivElement>) {
  return (
    <div className={cn("px-5 py-4", className)} {...props}>
      {children}
    </div>
  )
}

export function CardFooter({
  className,
  children,
  ...props
}: React.HTMLAttributes<HTMLDivElement>) {
  return (
    <div className={cn("border-surface-divider border-t px-5 py-3", className)} {...props}>
      {children}
    </div>
  )
}
