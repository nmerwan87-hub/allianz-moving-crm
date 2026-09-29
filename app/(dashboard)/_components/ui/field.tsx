import {
  forwardRef,
  type InputHTMLAttributes,
  type SelectHTMLAttributes,
  type TextareaHTMLAttributes,
} from "react"
import { cn } from "@/app/(dashboard)/_lib/cn"

const fieldBase = [
  "w-full rounded-[var(--radius-md)] border bg-surface-raised px-3 text-sm text-text-primary",
  "placeholder:text-text-muted",
  "focus:border-signal-600 focus:outline-none focus:ring-2 focus:ring-signal-100",
  "disabled:cursor-not-allowed disabled:opacity-50",
  "border-surface-divider",
].join(" ")

export interface InputProps extends InputHTMLAttributes<HTMLInputElement> {
  hasError?: boolean
}

export const Input = forwardRef<HTMLInputElement, InputProps>(
  ({ className, hasError, ...props }, ref) => (
    <input
      ref={ref}
      className={cn(
        fieldBase,
        "h-9",
        hasError && "border-danger-600 focus:border-danger-600 focus:ring-danger-100",
        className,
      )}
      {...props}
    />
  ),
)
Input.displayName = "Input"

export interface SelectProps extends SelectHTMLAttributes<HTMLSelectElement> {
  hasError?: boolean
}

export const Select = forwardRef<HTMLSelectElement, SelectProps>(
  ({ className, hasError, children, ...props }, ref) => (
    <select
      ref={ref}
      className={cn(
        fieldBase,
        "h-9 cursor-pointer",
        hasError && "border-danger-600 focus:border-danger-600 focus:ring-danger-100",
        className,
      )}
      {...props}
    >
      {children}
    </select>
  ),
)
Select.displayName = "Select"

export interface TextareaProps extends TextareaHTMLAttributes<HTMLTextAreaElement> {
  hasError?: boolean
}

export const Textarea = forwardRef<HTMLTextAreaElement, TextareaProps>(
  ({ className, hasError, ...props }, ref) => (
    <textarea
      ref={ref}
      className={cn(
        fieldBase,
        "min-h-20 py-2",
        hasError && "border-danger-600 focus:border-danger-600 focus:ring-danger-100",
        className,
      )}
      {...props}
    />
  ),
)
Textarea.displayName = "Textarea"

export interface FieldLabelProps extends React.LabelHTMLAttributes<HTMLLabelElement> {
  required?: boolean
}

export function FieldLabel({ className, required, children, ...props }: FieldLabelProps) {
  return (
    <label
      className={cn("text-text-primary mb-1.5 block text-sm font-medium", className)}
      {...props}
    >
      {children}
      {required && <span className="text-danger-700 ml-0.5">*</span>}
    </label>
  )
}

export function FieldError({ message }: { message?: string }) {
  if (!message) return null
  return <p className="text-danger-700 mt-1 text-xs">{message}</p>
}

export function FieldHint({ children }: { children: React.ReactNode }) {
  return <p className="text-text-muted mt-1 text-xs">{children}</p>
}
