import { cva, type VariantProps } from "class-variance-authority"
import { forwardRef, type ButtonHTMLAttributes } from "react"
import { cn } from "@/app/(dashboard)/_lib/cn"

export const buttonVariants = cva(
  "inline-flex items-center justify-center gap-2 font-medium whitespace-nowrap transition-colors duration-[var(--duration-quick)] focus-visible:outline-none disabled:pointer-events-none disabled:opacity-50",
  {
    variants: {
      variant: {
        primary:
          "rounded-[var(--radius-md)] bg-ink-900 px-4 py-2 text-sm text-text-inverse hover:bg-ink-700",
        secondary:
          "rounded-[var(--radius-md)] border border-surface-divider bg-surface-raised px-4 py-2 text-sm text-text-primary hover:bg-surface-sunken",
        ghost:
          "rounded-[var(--radius-md)] px-3 py-2 text-sm text-text-secondary hover:bg-surface-sunken hover:text-text-primary",
        danger:
          "rounded-[var(--radius-md)] bg-danger-700 px-4 py-2 text-sm text-text-inverse hover:bg-danger-600",
        dangerGhost:
          "rounded-[var(--radius-md)] px-3 py-2 text-sm text-danger-700 hover:bg-danger-100",
        link: "text-sm text-signal-600 underline-offset-4 hover:underline",
      },
      size: {
        sm: "h-8 px-3 text-[var(--text-body-sm)]",
        md: "h-9 px-4 text-[var(--text-body)]",
        lg: "h-10 px-5 text-[var(--text-body)]",
        icon: "h-9 w-9",
      },
    },
    defaultVariants: {
      variant: "primary",
      size: "md",
    },
  },
)

export interface ButtonProps
  extends ButtonHTMLAttributes<HTMLButtonElement>, VariantProps<typeof buttonVariants> {}

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant, size, ...props }, ref) => (
    <button ref={ref} className={cn(buttonVariants({ variant, size }), className)} {...props} />
  ),
)
Button.displayName = "Button"
