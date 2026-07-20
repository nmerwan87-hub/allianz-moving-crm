import type { Metadata } from "next"

export const metadata: Metadata = {
  title: "Application Under Review — Bivro",
}

export default function PendingApprovalPage() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-slate-50 px-6 py-12">
      <div className="w-full max-w-md text-center">
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
              d="M12 6v6h4.5m4.5 0a9 9 0 11-18 0 9 9 0 0118 0z"
            />
          </svg>
        </div>

        <h1 className="text-2xl font-bold text-slate-900">Application under review</h1>
        <p className="mt-3 text-sm text-slate-500">
          Your email has been verified. Your application for a Bivro account is now under review by
          our team.
        </p>

        <div className="mt-8 rounded-lg border border-amber-200 bg-amber-50 p-6 text-left">
          <p className="text-sm font-semibold text-amber-800">What happens next?</p>
          <ul className="mt-3 space-y-2 text-sm text-amber-700">
            <li className="flex items-start gap-2">
              <span className="mt-0.5 flex-shrink-0">1.</span>
              <span>Our team reviews your application within 1 business day.</span>
            </li>
            <li className="flex items-start gap-2">
              <span className="mt-0.5 flex-shrink-0">2.</span>
              <span>You&apos;ll receive an email when a decision has been made.</span>
            </li>
            <li className="flex items-start gap-2">
              <span className="mt-0.5 flex-shrink-0">3.</span>
              <span>
                If approved, your 14-day free trial starts immediately and you&apos;ll be guided
                through setup.
              </span>
            </li>
          </ul>
        </div>

        <p className="mt-6 text-sm text-slate-500">
          Have questions?{" "}
          <a
            href="mailto:support@bivro.io"
            className="font-medium text-violet-600 hover:text-violet-700"
          >
            Contact support@bivro.io
          </a>
        </p>
      </div>
    </div>
  )
}
