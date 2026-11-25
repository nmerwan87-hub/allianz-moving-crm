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
  if (score <= 1) return { score, label: "Schwach", color: "bg-red-500" }
  if (score === 2) return { score, label: "Mittel", color: "bg-yellow-500" }
  if (score === 3) return { score, label: "Stark", color: "bg-green-500" }
  return { score, label: "Sehr stark", color: "bg-emerald-600" }
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
        setError("Dieser Link ist ungültig oder abgelaufen. Fordere einen neuen an.")
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
      setError("Das Passwort braucht mindestens 12 Zeichen, eine Zahl und ein Sonderzeichen.")
      return
    }
    if (password !== confirm) {
      setError("Die Passwörter stimmen nicht überein.")
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
          Ungültiger Link.{" "}
          <a href="/forgot-password" className="font-medium underline">
            Neuen anfordern
          </a>
        </p>
      </div>
    )
  }

  if (success) {
    return (
      <div className="rounded-lg border border-green-200 bg-green-50 p-6 text-center">
        <p className="text-sm font-medium text-green-800">Passwort geändert</p>
        <p className="mt-1 text-sm text-green-700">Du wirst angemeldet …</p>
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
        <label className="mb-1 block text-sm font-medium text-slate-700">Neues Passwort</label>
        <input
          type="password"
          required
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          placeholder="Mindestens 12 Zeichen"
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
        <label className="mb-1 block text-sm font-medium text-slate-700">Passwort bestätigen</label>
        <input
          type="password"
          required
          value={confirm}
          onChange={(e) => setConfirm(e.target.value)}
          placeholder="Neues Passwort wiederholen"
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
        {loading ? "Wird gespeichert …" : "Passwort speichern"}
      </button>
    </form>
  )
}

export default function ResetPasswordPage() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-slate-50 px-6 py-12">
      <div className="w-full max-w-sm">
        <div className="mb-8">
          <h1 className="text-2xl font-bold text-slate-900">Neues Passwort</h1>
          <p className="mt-1 text-sm text-slate-500">Wähle ein sicheres Passwort.</p>
        </div>
        <Suspense fallback={<p className="text-sm text-slate-500">Wird geladen …</p>}>
          <ResetPasswordForm />
        </Suspense>
      </div>
    </div>
  )
}
