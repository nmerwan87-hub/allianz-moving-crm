import * as AvatarPrimitive from "@radix-ui/react-avatar"
import { cn } from "@/app/(dashboard)/_lib/cn"

export function Avatar({ fallback, className }: { fallback: string; className?: string }) {
  return (
    <AvatarPrimitive.Root
      className={cn(
        "bg-ink-100 text-ink-700 flex h-8 w-8 shrink-0 items-center justify-center overflow-hidden rounded-full text-xs font-medium",
        className,
      )}
    >
      <AvatarPrimitive.Fallback className="flex h-full w-full items-center justify-center">
        {fallback}
      </AvatarPrimitive.Fallback>
    </AvatarPrimitive.Root>
  )
}
