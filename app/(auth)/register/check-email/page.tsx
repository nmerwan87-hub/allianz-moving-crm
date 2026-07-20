"use client"

import { useState } from "react"
import { trpc } from "@/lib/trpc/client"

export default function CheckEmailPage() {
  const [resent, setResent] = useState(false)
  const [email] = useState<string>(() => {
    if (typeof window === "undefined") return ""
    return sessionStorage.getItem("registration_email") ?? ""
  })

  const resendMutation = trpc.iam.resendVerification.useMutation({
    onSuccess: () => setResent(true),
  })

  return (
    <div className="flex min-h-screen items-center justify-center bg-slate-50 px-6 py-12">
      <div className="w-full max-w-md text-center">
        <div className="mb-6 inline-flex h-16 w-16 items-center justify-center rounded-full bg-violet-100">
          <svg
            className="h-8 w-8 text-violet-600"
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
            strokeWidth={1.5}
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              d="M21.75 6.75v10.5a2.25 2.25 0 01-2.25 2.25h-15a2.25 2.25 0 01-2.25-2.25V6.75m19.5 0A2.25 2.25 0 0019.5 4.5h-15a2.25 2.25 0 00-2.25 2.25m19.5 0v.243a2.25 2.25 0 01-1.07 1.916l-7.5 4.615a2.25 2.25 0 01-2.36 0L3.32 8.91a2.25 2.25 0 01-1.07-1.916V6.75"
            />
          </svg>
        </div>

        <h1 className="text-2xl font-bold text-slate-900">Check your email</h1>
        <p className="mt-3 text-sm text-slate-500">
          We&apos;ve sent a confirmation link to{" "}
          {email ? <strong className="text-slate-700">{email}</strong> : "your email address"}.
          Click the link in the email to verify your account and submit your application.
        </p>

        <div className="mt-8 rounded-lg border border-slate-200 bg-white p-6 text-left">
          <p className="text-sm font-medium text-slate-700">Didn&apos;t receive the email?</p>
          <ul className="mt-3 list-inside list-disc space-y-1 text-sm text-slate-500">
            <li>Check your spam or junk folder</li>
            <li>Make sure you entered the correct email address</li>
            <li>Wait a few minutes — it can take up to 5 minutes</li>
          </ul>

          {resent ? (
            <p className="mt-4 text-sm font-medium text-green-600">
              Verification email resent. Please check your inbox.
            </p>
          ) : (
            <button
              type="button"
              onClick={() => email && resendMutation.mutate({ email })}
              disabled={resendMutation.isPending || !email}
              className="mt-4 text-sm font-medium text-violet-600 hover:text-violet-700 disabled:opacity-50"
            >
              {resendMutation.isPending ? "Resending…" : "Resend verification email"}
            </button>
          )}
        </div>

        <p className="mt-6 text-sm text-slate-500">
          Wrong account?{" "}
          <a href="/register" className="font-medium text-violet-600 hover:text-violet-700">
            Start over
          </a>
        </p>
      </div>
    </div>
  )
}
