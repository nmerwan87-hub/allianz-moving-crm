"use client"

import { useState } from "react"
import { trpc } from "@/lib/trpc/client"

export default function ForgotPasswordPage() {
  const [email, setEmail] = useState("")
  const [submitted, setSubmitted] = useState(false)

  const mutation = trpc.iam.forgotPassword.useMutation({
    onSuccess: () => setSubmitted(true),
    onError: () => setSubmitted(true), // same UX regardless
  })

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (email) mutation.mutate({ email })
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-slate-50 px-6 py-12">
      <div className="w-full max-w-sm">
        <div className="mb-8">
          <a href="/login" className="text-sm text-violet-600 hover:text-violet-700">
            ← Back to sign in
          </a>
          <h1 className="mt-4 text-2xl font-bold text-slate-900">Passwort vergessen?</h1>
          <p className="mt-1 text-sm text-slate-500">
            Gib deine E-Mail ein, wir senden dir einen Link zum Zurücksetzen.
          </p>
        </div>

        {submitted ? (
          <div className="rounded-lg border border-green-200 bg-green-50 p-6 text-center">
            <p className="text-sm font-medium text-green-800">Schau in dein Postfach</p>
            <p className="mt-2 text-sm text-green-700">
              Ist diese E-Mail registriert, erhältst du einen Link. Er ist 60 Minuten gültig.
            </p>
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label htmlFor="email" className="mb-1 block text-sm font-medium text-slate-700">
                E-Mail
              </label>
              <input
                id="email"
                type="email"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="name@firma.ch"
                className="block w-full rounded-md border border-slate-300 bg-slate-50 px-3 py-2 text-sm text-slate-900 placeholder:text-slate-400 focus:border-violet-600 focus:ring-2 focus:ring-violet-600/20 focus:outline-none"
              />
            </div>

            <button
              type="submit"
              disabled={mutation.isPending || !email}
              className="w-full rounded-md bg-slate-900 px-4 py-2.5 text-sm font-semibold text-white hover:bg-slate-800 focus:ring-2 focus:ring-violet-600/30 focus:ring-offset-2 focus:outline-none disabled:cursor-not-allowed disabled:opacity-50"
            >
              {mutation.isPending ? "Wird gesendet …" : "Link senden"}
            </button>
          </form>
        )}
      </div>
    </div>
  )
}
