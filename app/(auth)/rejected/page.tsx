import type { Metadata } from "next"

export const metadata: Metadata = {
  title: "Application Not Approved — Bivro",
}

export default function RejectedPage() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-slate-50 px-6 py-12">
      <div className="w-full max-w-md text-center">
        <div className="mb-6 inline-flex h-16 w-16 items-center justify-center rounded-full bg-slate-100">
          <svg
            className="h-8 w-8 text-slate-600"
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
            strokeWidth={1.5}
          >
            <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
          </svg>
        </div>

        <h1 className="text-2xl font-bold text-slate-900">Application not approved</h1>
        <p className="mt-3 text-sm text-slate-500">
          Unfortunately, your application was not approved. You should have received an email with
          more details.
        </p>

        <p className="mt-6 text-sm text-slate-500">
          If you believe this decision was made in error or have questions, please contact{" "}
          <a
            href="mailto:support@bivro.io"
            className="font-medium text-violet-600 hover:text-violet-700"
          >
            support@bivro.io
          </a>
          .
        </p>
      </div>
    </div>
  )
}
