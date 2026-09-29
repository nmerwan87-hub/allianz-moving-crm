"use client"

import * as ToastPrimitive from "@radix-ui/react-toast"
import { createPortal } from "react-dom"
import {
  createContext,
  useCallback,
  useContext,
  useSyncExternalStore,
  useState,
  type ReactNode,
} from "react"
import { CheckCircle2, AlertCircle, Info, X } from "lucide-react"
import { cn } from "@/app/(dashboard)/_lib/cn"

type ToastVariant = "success" | "error" | "info"

interface ToastRecord {
  id: string
  title: string
  description?: string | undefined
  variant: ToastVariant
}

// ─── Toast context ──────────────────────────────────────────────

interface ToastApi {
  toast: (t: Omit<ToastRecord, "id">) => void
  success: (title: string, description?: string) => void
  error: (title: string, description?: string) => void
  info: (title: string, description?: string) => void
}

const ToastContext = createContext<ToastApi | null>(null)

export function useToast() {
  const ctx = useContext(ToastContext)
  if (!ctx) throw new Error("useToast must be used within ToastProvider")
  return ctx
}

// ─── Toast provider ─────────────────────────────────────────────

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<ToastRecord[]>([])
  const mounted = useSyncExternalStore(
    () => () => {},
    () => true,
    () => false,
  )

  const toast = useCallback((t: Omit<ToastRecord, "id">) => {
    const id = `toast-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
    setToasts((prev) => [...prev, { ...t, id }])
  }, [])

  const success = useCallback(
    (title: string, description?: string) => {
      const t: Omit<ToastRecord, "id"> = { title, variant: "success" }
      if (description) t.description = description
      toast(t)
    },
    [toast],
  )
  const error = useCallback(
    (title: string, description?: string) => {
      const t: Omit<ToastRecord, "id"> = { title, variant: "error" }
      if (description) t.description = description
      toast(t)
    },
    [toast],
  )
  const info = useCallback(
    (title: string, description?: string) => {
      const t: Omit<ToastRecord, "id"> = { title, variant: "info" }
      if (description) t.description = description
      toast(t)
    },
    [toast],
  )

  const dismiss = useCallback((id: string) => {
    setToasts((prev) => prev.filter((t) => t.id !== id))
  }, [])

  return (
    <ToastContext value={{ toast, success, error, info }}>
      <ToastPrimitive.Provider swipeDirection="right">
        {children}
        {mounted &&
          createPortal(
            <ToastPrimitive.Viewport className="fixed right-4 bottom-4 z-[100] flex flex-col gap-2 outline-none" />,
            document.body,
          )}
        {toasts.map((t) => (
          <ToastItem key={t.id} toast={t} onDismiss={dismiss} />
        ))}
      </ToastPrimitive.Provider>
    </ToastContext>
  )
}

// ─── Single toast ───────────────────────────────────────────────

const icons: Record<ToastVariant, typeof CheckCircle2> = {
  success: CheckCircle2,
  error: AlertCircle,
  info: Info,
}

const variantStyles: Record<ToastVariant, string> = {
  success: "border-success-100 text-success-700",
  error: "border-danger-100 text-danger-700",
  info: "border-info-100 text-info-600",
}

function ToastItem({ toast, onDismiss }: { toast: ToastRecord; onDismiss: (id: string) => void }) {
  const Icon = icons[toast.variant]
  return (
    <ToastPrimitive.Root
      duration={4000}
      onOpenChange={(open) => {
        if (!open) onDismiss(toast.id)
      }}
      className={cn(
        "bg-surface-overlay flex items-start gap-3 rounded-[var(--radius-lg)] border px-4 py-3 shadow-[var(--shadow-elevation-3)]",
        "data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-80 data-[state=open]:fade-in-0 data-[swipe=end]:animate-out data-[state=closed]:slide-out-to-right-full",
        variantStyles[toast.variant],
      )}
    >
      <Icon className="mt-0.5 h-4 w-4 shrink-0" />
      <div className="flex-1">
        <p className="text-text-primary text-sm font-medium">{toast.title}</p>
        {toast.description && (
          <p className="text-text-secondary mt-0.5 text-xs">{toast.description}</p>
        )}
      </div>
      <ToastPrimitive.Close className="text-text-muted hover:text-text-primary rounded-[var(--radius-sm)] p-0.5">
        <X className="h-3.5 w-3.5" />
      </ToastPrimitive.Close>
    </ToastPrimitive.Root>
  )
}
