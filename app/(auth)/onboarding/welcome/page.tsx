import type { Metadata } from "next"
import { redirect } from "next/navigation"
import { createClient } from "@/lib/supabase/server"
import { getJwtAppMetadata } from "@/lib/supabase/jwt"

export const metadata: Metadata = {
  title: "Welcome to Bivro",
}

export default async function OnboardingWelcomePage() {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) redirect("/login")

  // Decode the JWT from the access_token to read hook-injected claims.
  // session.user.app_metadata is the GoTrue response body (no hook injections).
  const {
    data: { session },
  } = await supabase.auth.getSession()
  const jwtMeta = getJwtAppMetadata(session?.access_token)
  const role = jwtMeta["role"] as string | undefined
  const companyStatus = jwtMeta["company_status"] as string | undefined

  if (companyStatus !== "active") redirect("/pending-approval")

  const { data: profile } = await supabase
    .from("profiles")
    .select("first_name, last_name, company_id")
    .eq("id", user.id)
    .maybeSingle()

  const firstName = profile?.first_name ?? "there"

  return (
    <div className="flex min-h-screen items-center justify-center bg-slate-50 px-6 py-12">
      <div className="w-full max-w-lg text-center">
        <div className="mb-6 inline-flex h-20 w-20 items-center justify-center rounded-full bg-violet-100">
          <svg
            className="h-10 w-10 text-violet-600"
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
            strokeWidth={1.5}
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              d="M9 12.75L11.25 15 15 9.75M21 12a9 9 0 11-18 0 9 9 0 0118 0z"
            />
          </svg>
        </div>

        <h1 className="text-3xl font-bold text-slate-900">Welcome, {firstName}!</h1>
        <p className="mt-3 text-base text-slate-500">
          Your Bivro account is ready. Let&apos;s get you set up.
        </p>

        <div className="mt-10 grid gap-4 text-left sm:grid-cols-2">
          <div className="rounded-lg border border-slate-200 bg-white p-5">
            <div className="mb-3 flex h-9 w-9 items-center justify-center rounded-md bg-violet-100">
              <svg
                className="h-5 w-5 text-violet-600"
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
                strokeWidth={1.5}
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  d="M15 9h3.75M15 12h3.75M15 15h3.75M4.5 19.5h15a2.25 2.25 0 002.25-2.25V6.75A2.25 2.25 0 0019.5 4.5h-15a2.25 2.25 0 00-2.25 2.25v10.5A2.25 2.25 0 004.5 19.5zm6-10.125a1.875 1.875 0 11-3.75 0 1.875 1.875 0 013.75 0zm1.294 6.336a6.721 6.721 0 01-3.17.789 6.721 6.721 0 01-3.168-.789 3.376 3.376 0 016.338 0z"
                />
              </svg>
            </div>
            <h3 className="font-semibold text-slate-900">Your profile</h3>
            <p className="mt-1 text-sm text-slate-500">
              Review your account details and set your preferences.
            </p>
          </div>

          <div className="rounded-lg border border-slate-200 bg-white p-5">
            <div className="mb-3 flex h-9 w-9 items-center justify-center rounded-md bg-violet-100">
              <svg
                className="h-5 w-5 text-violet-600"
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
                strokeWidth={1.5}
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  d="M2.25 12l8.954-8.955c.44-.439 1.152-.439 1.591 0L21.75 12M4.5 9.75v10.125c0 .621.504 1.125 1.125 1.125H9.75v-4.875c0-.621.504-1.125 1.125-1.125h2.25c.621 0 1.125.504 1.125 1.125V21h4.125c.621 0 1.125-.504 1.125-1.125V9.75M8.25 21h8.25"
                />
              </svg>
            </div>
            <h3 className="font-semibold text-slate-900">Dashboard</h3>
            <p className="mt-1 text-sm text-slate-500">
              See an overview of your company&apos;s activity.
            </p>
          </div>
        </div>

        {role === "office" ? (
          <p className="mt-8 text-sm text-slate-400">
            Your access has been configured by your administrator.{" "}
            <a href="/settings/profile" className="text-violet-600 hover:text-violet-700">
              View your permissions
            </a>
          </p>
        ) : null}

        <a
          href="/dashboard"
          className="mt-8 inline-block rounded-md bg-slate-900 px-8 py-3 text-sm font-semibold text-white hover:bg-slate-800 focus:ring-2 focus:ring-violet-600/30 focus:ring-offset-2 focus:outline-none"
        >
          Go to dashboard →
        </a>
      </div>
    </div>
  )
}
