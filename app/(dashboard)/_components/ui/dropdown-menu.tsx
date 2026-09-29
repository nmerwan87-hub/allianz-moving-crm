"use client"

import * as DropdownMenuPrimitive from "@radix-ui/react-dropdown-menu"
import { cn } from "@/app/(dashboard)/_lib/cn"

export function DropdownMenu({ children }: { children: React.ReactNode }) {
  return <DropdownMenuPrimitive.Root>{children}</DropdownMenuPrimitive.Root>
}

export function DropdownMenuTrigger({
  children,
  asChild,
}: {
  children: React.ReactElement
  asChild?: boolean
}) {
  const props: { asChild?: boolean } = {}
  if (asChild) props.asChild = asChild
  return <DropdownMenuPrimitive.Trigger {...props}>{children}</DropdownMenuPrimitive.Trigger>
}

export function DropdownMenuContent({
  className,
  children,
  align = "end",
}: {
  className?: string
  children: React.ReactNode
  align?: "start" | "center" | "end"
}) {
  return (
    <DropdownMenuPrimitive.Portal>
      <DropdownMenuPrimitive.Content
        align={align}
        sideOffset={4}
        className={cn(
          "border-surface-divider bg-surface-overlay z-50 min-w-48 overflow-hidden rounded-[var(--radius-md)] border p-1 shadow-[var(--shadow-elevation-2)]",
          "data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0 data-[state=closed]:zoom-out-95 data-[state=open]:zoom-in-95",
          className,
        )}
      >
        {children}
      </DropdownMenuPrimitive.Content>
    </DropdownMenuPrimitive.Portal>
  )
}

export function DropdownMenuItem({
  className,
  children,
  ...props
}: React.ComponentProps<typeof DropdownMenuPrimitive.Item>) {
  return (
    <DropdownMenuPrimitive.Item
      className={cn(
        "text-text-primary flex cursor-pointer items-center gap-2 rounded-[var(--radius-sm)] px-2.5 py-2 text-sm outline-none",
        "focus:bg-surface-sunken data-[disabled]:pointer-events-none data-[disabled]:opacity-50",
        className,
      )}
      {...props}
    >
      {children}
    </DropdownMenuPrimitive.Item>
  )
}

export function DropdownMenuSeparator() {
  return <DropdownMenuPrimitive.Separator className="bg-surface-divider my-1 h-px" />
}

export function DropdownMenuLabel({ children }: { children: React.ReactNode }) {
  return (
    <DropdownMenuPrimitive.Label className="text-text-muted px-2.5 py-1.5 text-xs">
      {children}
    </DropdownMenuPrimitive.Label>
  )
}
