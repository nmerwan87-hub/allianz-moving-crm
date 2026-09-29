import { cn } from "@/app/(dashboard)/_lib/cn"

export function Skeleton({ className }: { className?: string }) {
  return (
    <div className={cn("bg-surface-sunken animate-pulse rounded-[var(--radius-sm)]", className)} />
  )
}

export function SkeletonRow({ columns = 5 }: { columns?: number }) {
  return (
    <div className="flex items-center gap-4 px-4 py-3">
      {Array.from({ length: columns }).map((_, i) => (
        <Skeleton
          key={i}
          className={i === 0 ? "h-4 w-8" : i === columns - 1 ? "h-4 w-20" : "h-4 flex-1"}
        />
      ))}
    </div>
  )
}

export function SkeletonCard() {
  return (
    <div className="border-surface-divider bg-surface-raised rounded-[var(--radius-lg)] border p-5">
      <Skeleton className="h-5 w-32" />
      <Skeleton className="mt-3 h-8 w-20" />
    </div>
  )
}
