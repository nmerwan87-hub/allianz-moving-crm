"use client"

import { useState } from "react"
import { useRouter, useSearchParams } from "next/navigation"
import { Suspense } from "react"
import { createClient } from "@/lib/supabase/client"

function LoginForm() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const [email, setEmail] = useState("")
  const [password, setPassword] = useState("")
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)

  const next = searchParams.get("next") ?? "/dashboard"

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError(null)
    setLoading(true)

    const supabase = createClient()
    const { error: signInError } = await supabase.auth.signInWithPassword({ email, password })

    setLoading(false)

    if (signInError) {
      setError("E-Mail oder Passwort ist falsch.")
      return
    }

    // Middleware handles company_status-based routing on next navigation
    router.push(next)
    router.refresh()
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      {error ? (
        <div className="rounded-md border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          {error}
        </div>
      ) : null}

      <div>
        <label htmlFor="email" className="mb-1 block text-sm font-medium text-slate-700">
          E-Mail
        </label>
        <input
          id="email"
          type="email"
          autoComplete="email"
          required
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          placeholder="name@firma.ch"
          className="focus:border-signal-600 focus:ring-signal-600/20 block w-full rounded-md border border-slate-300 bg-slate-50 px-3 py-2 text-sm text-slate-900 placeholder:text-slate-400 focus:ring-2 focus:outline-none"
        />
      </div>

      <div>
        <div className="mb-1 flex items-center justify-between">
          <label htmlFor="password" className="block text-sm font-medium text-slate-700">
            Passwort
          </label>
          <a href="/forgot-password" className="text-signal-600 hover:text-signal-700 text-xs">
            Passwort vergessen?
          </a>
        </div>
        <input
          id="password"
          type="password"
          autoComplete="current-password"
          required
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          placeholder="••••••••"
          className="focus:border-signal-600 focus:ring-signal-600/20 block w-full rounded-md border border-slate-300 bg-slate-50 px-3 py-2 text-sm text-slate-900 placeholder:text-slate-400 focus:ring-2 focus:outline-none"
        />
      </div>

      <button
        type="submit"
        disabled={loading}
        className="bg-signal-600 hover:bg-signal-700 focus:ring-signal-600/30 mt-2 w-full rounded-md px-4 py-2.5 text-sm font-semibold text-white focus:ring-2 focus:ring-offset-2 focus:outline-none disabled:cursor-not-allowed disabled:opacity-50"
      >
        {loading ? "Anmelden …" : "Anmelden"}
      </button>
    </form>
  )
}

export default function LoginPage() {
  return (
    <div className="flex min-h-screen">
      {/* Left branding panel — lg+ only */}
      <div className="bg-signal-700 hidden flex-col justify-between p-12 text-white lg:flex lg:w-1/2">
        <span className="text-xl font-semibold tracking-tight">Bivro</span>
        <div>
          <p className="text-3xl leading-snug font-bold">
            Umzüge planen,
            <br />
            offerieren, abrechnen.
          </p>
          <p className="mt-4 text-sm text-slate-400">
            Das Arbeitswerkzeug für Schweizer Umzugsfirmen.
          </p>
        </div>
        <p className="text-xs text-slate-500">© 2026 Bivro</p>
      </div>

      {/* Right form panel */}
      <div className="flex flex-1 flex-col items-center justify-center bg-white px-6 py-12">
        <div className="mb-8 lg:hidden">
          <span className="text-xl font-semibold tracking-tight text-slate-900">Bivro</span>
        </div>

        <div className="w-full max-w-sm">
          <div className="mb-8">
            <h1 className="text-2xl font-bold text-slate-900">Anmelden</h1>
            <p className="mt-1 text-sm text-slate-500">
              Bei <span className="font-medium text-slate-700">deinem Arbeitsbereich</span>
            </p>
          </div>

          <Suspense fallback={null}>
            <LoginForm />
          </Suspense>
        </div>
      </div>
    </div>
  )
}
