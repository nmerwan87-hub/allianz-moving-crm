"use client"

import { useState, useEffect, Suspense } from "react"
import { useRouter, useSearchParams } from "next/navigation"
import { createClient } from "@/lib/supabase/client"

function passwordStrength(pwd: string): { score: number; label: string; color: string } {
  let score = 0
  if (pwd.length >= 12) score++
  if (/\d/.test(pwd)) score++
  if (/[!@#$%^&*()_+\-=[\]{}|;':",.<>?/]/.test(pwd)) score++
  if (pwd.length >= 20) score++
  if (score <= 1) return { score, label: "Weak", color: "bg-red-500" }
  if (score === 2) return { score, label: "Fair", color: "bg-yellow-500" }
  if (score === 3) return { score, label: "Strong", color: "bg-green-500" }
  return { score, label: "Very Strong", color: "bg-emerald-600" }
}

const PASSWORD_REGEX = /^(?=.*\d)(?=.*[!@#$%^&*()_+\-=[\]{}|;':",.<>?/]).{12,128}$/

function ResetPasswordForm() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const [password, setPassword] = useState("")
  const [confirm, setConfirm] = useState("")
  const [error, setError] = useState<string | null>(null)
  const [success, setSuccess] = useState(false)
  const [loading, setLoading] = useState(false)
  const [sessionReady, setSessionReady] = useState(false)

  const supabase = createClient()
  const code = searchParams.get("code")

  useEffect(() => {
    if (!code) return
    let cancelled = false
    supabase.auth.exchangeCodeForSession(code).then(({ error }) => {
      if (cancelled) return
      if (error) {
        setError("This reset link is invalid or has expired. Please request a new one.")
      } else {
        setSessionReady(true)
      }
    })
    return () => {
      cancelled = true
    }
    // supabase.auth is stable — only re-run on code change
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [code])

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError(null)

    if (!PASSWORD_REGEX.test(password)) {
      setError(
        "Password must be at least 12 characters and contain at least one number and one special character.",
      )
      return
    }
    if (password !== confirm) {
      setError("Passwords do not match.")
      return
    }

    setLoading(true)
    const { error: updateError } = await supabase.auth.updateUser({ password })
    setLoading(false)

    if (updateError) {
      setError(updateError.message)
      return
    }

    setSuccess(true)
    setTimeout(() => router.push("/dashboard"), 2000)
  }

  if (!code) {
    return (
      <div className="rounded-lg border border-red-200 bg-red-50 p-6 text-center">
        <p className="text-sm text-red-700">
          Invalid reset link.{" "}
          <a href="/forgot-password" className="font-medium underline">
            Request a new one
          </a>
        </p>
      </div>
    )
  }

  if (success) {
    return (
      <div className="rounded-lg border border-green-200 bg-green-50 p-6 text-center">
        <p className="text-sm font-medium text-green-800">Password updated!</p>
        <p className="mt-1 text-sm text-green-700">Signing you in…</p>
      </div>
    )
  }

  const strength = passwordStrength(password)

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      {error ? (
        <div className="rounded-md border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          {error}
        </div>
      ) : null}

      <div>
        <label className="mb-1 block text-sm font-medium text-slate-700">New password</label>
        <input
          type="password"
          required
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          placeholder="Minimum 12 characters"
          autoComplete="new-password"
          disabled={!sessionReady}
          className="block w-full rounded-md border border-slate-300 bg-slate-50 px-3 py-2 text-sm placeholder:text-slate-400 focus:border-violet-600 focus:ring-2 focus:ring-violet-600/20 focus:outline-none disabled:opacity-50"
        />
        {password.length > 0 ? (
          <div className="mt-2">
            <div className="flex gap-1">
              {[1, 2, 3, 4].map((i) => (
                <div
                  key={i}
                  className={`h-1 flex-1 rounded-full ${i <= strength.score ? strength.color : "bg-slate-200"}`}
                />
              ))}
            </div>
            <p className="mt-1 text-xs text-slate-500">{strength.label}</p>
          </div>
        ) : null}
      </div>

      <div>
        <label className="mb-1 block text-sm font-medium text-slate-700">Confirm password</label>
        <input
          type="password"
          required
          value={confirm}
          onChange={(e) => setConfirm(e.target.value)}
          placeholder="Repeat your new password"
          autoComplete="new-password"
          disabled={!sessionReady}
          className="block w-full rounded-md border border-slate-300 bg-slate-50 px-3 py-2 text-sm placeholder:text-slate-400 focus:border-violet-600 focus:ring-2 focus:ring-violet-600/20 focus:outline-none disabled:opacity-50"
        />
      </div>

      <button
        type="submit"
        disabled={loading || !sessionReady}
        className="w-full rounded-md bg-slate-900 px-4 py-2.5 text-sm font-semibold text-white hover:bg-slate-800 focus:ring-2 focus:ring-violet-600/30 focus:ring-offset-2 focus:outline-none disabled:cursor-not-allowed disabled:opacity-50"
      >
        {loading ? "Updating…" : "Set new password"}
      </button>
    </form>
  )
}

export default function ResetPasswordPage() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-slate-50 px-6 py-12">
      <div className="w-full max-w-sm">
        <div className="mb-8">
          <h1 className="text-2xl font-bold text-slate-900">Set new password</h1>
          <p className="mt-1 text-sm text-slate-500">Choose a strong password for your account.</p>
        </div>
        <Suspense fallback={<p className="text-sm text-slate-500">Loading…</p>}>
          <ResetPasswordForm />
        </Suspense>
      </div>
    </div>
  )
}
