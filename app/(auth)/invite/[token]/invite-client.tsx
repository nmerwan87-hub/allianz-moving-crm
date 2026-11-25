"use client"

import { useEffect, useState } from "react"
import { useRouter } from "next/navigation"
import { trpc } from "@/lib/trpc/client"
import { createClient } from "@/lib/supabase/client"
import { completeCompanySwitch } from "@/app/(dashboard)/_lib/active-company"

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
        setError("Konto erstellt. Bitte melde dich an.")
        router.push("/login")
        return
      }
      router.push("/onboarding/welcome")
    },
    onError: (err) => setError(err.message),
  })

  if (isLoading) {
    return <p className="text-center text-sm text-slate-500">Einladung wird geprüft …</p>
  }

  if (!lookup?.valid) {
    const reason = lookup?.reason
    return (
      <div className="text-center">
        <h1 className="text-2xl font-bold text-slate-900">Einladung ungültig</h1>
        <p className="mt-3 text-sm text-slate-500">
          {reason === "expired"
            ? "Diese Einladung ist abgelaufen. Bitte um eine neue."
            : reason === "accepted"
              ? "Diese Einladung wurde schon angenommen."
              : "Dieser Einladungslink ist ungültig. Prüfe den Link in deiner E-Mail."}
        </p>
        <a
          href="/login"
          className="text-signal-600 hover:text-signal-700 mt-4 inline-block text-sm font-medium"
        >
          Go to sign in →
        </a>
      </div>
    )
  }

  const { invitation } = lookup

  if (invitation.accountExists) {
    return (
      <JoinWithExistingAccount
        rawToken={rawToken}
        email={invitation.email as string}
        companyName={invitation.companyName}
        inviterName={invitation.inviterName}
      />
    )
  }

  const strength = passwordStrength(password)

  return (
    <div>
      <div className="mb-8 text-center">
        <h1 className="text-2xl font-bold text-slate-900">Du wurdest eingeladen</h1>
        <p className="mt-2 text-sm text-slate-500">
          <strong>{invitation.inviterName}</strong> lädt dich ein zu{" "}
          <strong>{invitation.companyName}</strong> in Bivro (Büro).
        </p>
        <p className="mt-1 text-xs text-slate-400">
          Gültig bis:{" "}
          {new Date(invitation.expiresAt as string).toLocaleDateString("de-CH", {
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
            E-Mail <span className="font-normal text-slate-400">(Adresse der Einladung)</span>
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
              Vorname <span className="text-red-500">*</span>
            </label>
            <input
              type="text"
              required
              value={firstName}
              onChange={(e) => setFirstName(e.target.value)}
              placeholder="Vorname"
              autoComplete="given-name"
              className="focus:border-signal-600 focus:ring-signal-600/20 block w-full rounded-md border border-slate-300 bg-slate-50 px-3 py-2 text-sm placeholder:text-slate-400 focus:ring-2 focus:outline-none"
            />
          </div>
          <div>
            <label className="mb-1 block text-sm font-medium text-slate-700">
              Nachname <span className="text-red-500">*</span>
            </label>
            <input
              type="text"
              required
              value={lastName}
              onChange={(e) => setLastName(e.target.value)}
              placeholder="Nachname"
              autoComplete="family-name"
              className="focus:border-signal-600 focus:ring-signal-600/20 block w-full rounded-md border border-slate-300 bg-slate-50 px-3 py-2 text-sm placeholder:text-slate-400 focus:ring-2 focus:outline-none"
            />
          </div>
        </div>

        <div>
          <label className="mb-1 block text-sm font-medium text-slate-700">
            Passwort festlegen <span className="text-red-500">*</span>
          </label>
          <input
            type="password"
            required
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder="Mindestens 12 Zeichen"
            autoComplete="new-password"
            className="focus:border-signal-600 focus:ring-signal-600/20 block w-full rounded-md border border-slate-300 bg-slate-50 px-3 py-2 text-sm placeholder:text-slate-400 focus:ring-2 focus:outline-none"
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
          className="bg-signal-600 hover:bg-signal-700 focus:ring-signal-600/30 w-full rounded-md px-4 py-2.5 text-sm font-semibold text-white focus:ring-2 focus:ring-offset-2 focus:outline-none disabled:cursor-not-allowed disabled:opacity-50"
        >
          {signingIn
            ? "Anmelden …"
            : acceptMutation.isPending
              ? "Konto wird eingerichtet …"
              : "Einladung annehmen"}
        </button>
      </form>
    </div>
  )
}

/**
 * The invited email already has a Bivro account (e.g. the owner of another
 * company). The person signs in with their existing password and the
 * invitation adds a membership — the password is never reset by an invite link.
 */
function JoinWithExistingAccount({
  rawToken,
  email,
  companyName,
  inviterName,
}: {
  rawToken: string
  email: string
  companyName: string
  inviterName: string
}) {
  const supabase = createClient()
  const [signedInEmail, setSignedInEmail] = useState<string | null | undefined>(undefined)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    void supabase.auth.getUser().then(({ data }) => setSignedInEmail(data.user?.email ?? null))
  }, [supabase])

  const joinMutation = trpc.iam.joinInvitedCompany.useMutation({
    onSuccess: async ({ companyId }) => {
      await completeCompanySwitch(companyId)
    },
    onError: (err) => setError(err.message),
  })

  const loginHref = `/login?next=${encodeURIComponent(`/invite/${rawToken}`)}`
  const isInvitedAccount = signedInEmail?.toLowerCase() === email.toLowerCase()

  return (
    <div className="text-center">
      <h1 className="text-2xl font-bold text-slate-900">{companyName} beitreten</h1>
      <p className="mt-2 text-sm text-slate-500">
        <strong>{inviterName}</strong> lädt <strong>{email}</strong> ein zu{" "}
        <strong>{companyName}</strong>. Du hast schon ein Bivro-Konto; die Firma erscheint danach im
        Firmen-Umschalter.
      </p>

      {error ? (
        <div className="mt-4 rounded-md border border-red-200 bg-red-50 px-4 py-3 text-left text-sm text-red-700">
          {error}
        </div>
      ) : null}

      <div className="mt-6">
        {signedInEmail === undefined ? (
          <p className="text-sm text-slate-500">Sitzung wird geprüft …</p>
        ) : isInvitedAccount ? (
          <button
            type="button"
            onClick={() => {
              setError(null)
              joinMutation.mutate({ rawToken })
            }}
            disabled={joinMutation.isPending || joinMutation.isSuccess}
            className="bg-signal-600 hover:bg-signal-700 focus:ring-signal-600/30 w-full rounded-md px-4 py-2.5 text-sm font-semibold text-white focus:ring-2 focus:ring-offset-2 focus:outline-none disabled:cursor-not-allowed disabled:opacity-50"
          >
            {joinMutation.isPending || joinMutation.isSuccess
              ? "Wird beigetreten …"
              : `${companyName} beitreten`}
          </button>
        ) : signedInEmail ? (
          <div className="space-y-3 text-sm text-slate-600">
            <p>
              Du bist angemeldet als <strong>{signedInEmail}</strong>. Melde dich als{" "}
              <strong>{email}</strong> an, um die Einladung anzunehmen.
            </p>
            <button
              type="button"
              onClick={async () => {
                await supabase.auth.signOut()
                window.location.assign(loginHref)
              }}
              className="text-signal-600 hover:text-signal-700 font-medium"
            >
              Abmelden und Konto wechseln →
            </button>
          </div>
        ) : (
          <a
            href={loginHref}
            className="bg-signal-600 hover:bg-signal-700 inline-block w-full rounded-md px-4 py-2.5 text-sm font-semibold text-white"
          >
            Anmelden und annehmen
          </a>
        )}
      </div>
    </div>
  )
}
