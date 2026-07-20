"use client"

import { useState } from "react"
import { useRouter } from "next/navigation"
import { trpc } from "@/lib/trpc/client"
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

interface InviteAcceptanceClientProps {
  rawToken: string
}

export function InviteAcceptanceClient({ rawToken }: InviteAcceptanceClientProps) {
  const router = useRouter()
  const supabase = createClient()

  const [firstName, setFirstName] = useState("")
  const [lastName, setLastName] = useState("")
  const [password, setPassword] = useState("")
  const [error, setError] = useState<string | null>(null)
  const [signingIn, setSigningIn] = useState(false)

  const { data: lookup, isLoading } = trpc.iam.lookupInvitation.useQuery(
    { rawToken },
    { retry: false },
  )

  const acceptMutation = trpc.iam.acceptInvitation.useMutation({
    onSuccess: async (data) => {
      setSigningIn(true)
      // Sign in client-side after server creates the account
      const { error: signInError } = await supabase.auth.signInWithPassword({
        email: data.email,
        password,
      })
      if (signInError) {
        setError("Account created. Please sign in at the login page.")
        router.push("/login")
        return
      }
      router.push("/onboarding/welcome")
    },
    onError: (err) => setError(err.message),
  })

  if (isLoading) {
    return <p className="text-center text-sm text-slate-500">Verifying invitation…</p>
  }

  if (!lookup?.valid) {
    const reason = lookup?.reason
    return (
      <div className="text-center">
        <h1 className="text-2xl font-bold text-slate-900">Invitation invalid</h1>
        <p className="mt-3 text-sm text-slate-500">
          {reason === "expired"
            ? "This invitation has expired. Please ask your administrator to send a new one."
            : reason === "accepted"
              ? "This invitation has already been accepted."
              : "This invitation link is not valid. Please check your email for the correct link."}
        </p>
        <a
          href="/login"
          className="mt-4 inline-block text-sm font-medium text-violet-600 hover:text-violet-700"
        >
          Go to sign in →
        </a>
      </div>
    )
  }

  const { invitation } = lookup
  const strength = passwordStrength(password)

  return (
    <div>
      <div className="mb-8 text-center">
        <h1 className="text-2xl font-bold text-slate-900">You&apos;ve been invited</h1>
        <p className="mt-2 text-sm text-slate-500">
          <strong>{invitation.inviterName}</strong> has invited you to join{" "}
          <strong>{invitation.companyName}</strong> on Bivro as an Office member.
        </p>
        <p className="mt-1 text-xs text-slate-400">
          Invitation expires:{" "}
          {new Date(invitation.expiresAt as string).toLocaleDateString("en-GB", {
            day: "numeric",
            month: "long",
            year: "numeric",
          })}
        </p>
      </div>

      {error ? (
        <div className="mb-4 rounded-md border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          {error}
        </div>
      ) : null}

      <form
        onSubmit={(e) => {
          e.preventDefault()
          setError(null)
          acceptMutation.mutate({ rawToken, firstName, lastName, password })
        }}
        className="space-y-4"
      >
        <div>
          <label className="mb-1 block text-sm font-medium text-slate-700">
            Email <span className="font-normal text-slate-400">(your invitation address)</span>
          </label>
          <input
            type="email"
            value={invitation.email as string}
            readOnly
            className="block w-full rounded-md border border-slate-200 bg-slate-100 px-3 py-2 text-sm text-slate-600"
          />
        </div>

        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="mb-1 block text-sm font-medium text-slate-700">
              First name <span className="text-red-500">*</span>
            </label>
            <input
              type="text"
              required
              value={firstName}
              onChange={(e) => setFirstName(e.target.value)}
              placeholder="Jane"
              autoComplete="given-name"
              className="block w-full rounded-md border border-slate-300 bg-slate-50 px-3 py-2 text-sm placeholder:text-slate-400 focus:border-violet-600 focus:ring-2 focus:ring-violet-600/20 focus:outline-none"
            />
          </div>
          <div>
            <label className="mb-1 block text-sm font-medium text-slate-700">
              Last name <span className="text-red-500">*</span>
            </label>
            <input
              type="text"
              required
              value={lastName}
              onChange={(e) => setLastName(e.target.value)}
              placeholder="Smith"
              autoComplete="family-name"
              className="block w-full rounded-md border border-slate-300 bg-slate-50 px-3 py-2 text-sm placeholder:text-slate-400 focus:border-violet-600 focus:ring-2 focus:ring-violet-600/20 focus:outline-none"
            />
          </div>
        </div>

        <div>
          <label className="mb-1 block text-sm font-medium text-slate-700">
            Create a password <span className="text-red-500">*</span>
          </label>
          <input
            type="password"
            required
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder="Minimum 12 characters"
            autoComplete="new-password"
            className="block w-full rounded-md border border-slate-300 bg-slate-50 px-3 py-2 text-sm placeholder:text-slate-400 focus:border-violet-600 focus:ring-2 focus:ring-violet-600/20 focus:outline-none"
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
          <p className="mt-1 text-xs text-slate-400">
            At least 12 characters, 1 number, and 1 special character
          </p>
        </div>

        <button
          type="submit"
          disabled={acceptMutation.isPending || signingIn}
          className="w-full rounded-md bg-slate-900 px-4 py-2.5 text-sm font-semibold text-white hover:bg-slate-800 focus:ring-2 focus:ring-violet-600/30 focus:ring-offset-2 focus:outline-none disabled:cursor-not-allowed disabled:opacity-50"
        >
          {signingIn
            ? "Signing you in…"
            : acceptMutation.isPending
              ? "Setting up your account…"
              : "Accept invitation & set up account"}
        </button>
      </form>
    </div>
  )
}
