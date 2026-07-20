import type { Metadata } from "next"

export const metadata: Metadata = {
  title: "Verification Link Expired — Bivro",
}

export default function VerifyExpiredPage() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-slate-50 px-6 py-12">
      <div className="w-full max-w-sm text-center">
        <div className="mb-6 inline-flex h-16 w-16 items-center justify-center rounded-full bg-amber-100">
          <svg
            className="h-8 w-8 text-amber-600"
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
            strokeWidth={1.5}
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              d="M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126zM12 15.75h.007v.008H12v-.008z"
            />
          </svg>
        </div>

        <h1 className="text-2xl font-bold text-slate-900">Link expired</h1>
        <p className="mt-3 text-sm text-slate-500">
          Your email verification link has expired or has already been used. Verification links are
          valid for 24 hours.
        </p>

        <div className="mt-8 space-y-3">
          <a
            href="/register/check-email"
            className="block w-full rounded-md bg-slate-900 px-4 py-2.5 text-center text-sm font-semibold text-white hover:bg-slate-800 focus:ring-2 focus:ring-violet-600/30 focus:ring-offset-2 focus:outline-none"
          >
            Resend verification email
          </a>
          <a
            href="/register"
            className="block w-full rounded-md border border-slate-300 bg-white px-4 py-2.5 text-center text-sm font-medium text-slate-700 hover:bg-slate-50 focus:ring-2 focus:ring-violet-600/30 focus:ring-offset-2 focus:outline-none"
          >
            Start over
          </a>
        </div>
      </div>
    </div>
  )
}
