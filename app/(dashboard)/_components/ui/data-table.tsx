import { cn } from "@/app/(dashboard)/_lib/cn"

export interface Column<T> {
  key: string
  header: string
  className?: string
  render: (row: T) => React.ReactNode
}

export function DataTable<T extends { id: string }>({
  columns,
  data,
  onRowClick,
  emptyState,
  className,
}: {
  columns: Column<T>[]
  data: T[]
  onRowClick?: (row: T) => void
  emptyState?: React.ReactNode
  className?: string
}) {
  if (data.length === 0 && emptyState) {
    return <div className="py-2">{emptyState}</div>
  }

  return (
    <div className={cn("overflow-x-auto", className)}>
      <table className="w-full border-collapse">
        <thead>
          <tr className="border-surface-divider border-b">
            {columns.map((col) => (
              <th
                key={col.key}
                className={cn(
                  "text-text-muted px-4 py-2.5 text-left text-xs font-semibold tracking-wide uppercase",
                  col.className,
                )}
              >
                {col.header}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {data.map((row) => (
            <tr
              key={row.id}
              onClick={() => onRowClick?.(row)}
              className={cn(
                "border-surface-divider border-b transition-colors duration-[var(--duration-quick)] last:border-0",
                onRowClick && "hover:bg-surface-sunken cursor-pointer",
              )}
            >
              {columns.map((col) => (
                <td
                  key={col.key}
                  className={cn("text-text-primary px-4 py-3 text-sm", col.className)}
                >
                  {col.render(row)}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}
