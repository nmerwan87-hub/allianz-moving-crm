import type { Metadata } from "next"

export const metadata: Metadata = {
  title: "Account Archived — Bivro",
}

export default function ArchivedPage() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-slate-50 px-6 py-12">
      <div className="w-full max-w-md text-center">
        <div className="mb-6 inline-flex h-16 w-16 items-center justify-center rounded-full bg-slate-100">
          <svg
            className="h-8 w-8 text-slate-500"
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
            strokeWidth={1.5}
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              d="M20.25 7.5l-.625 10.632a2.25 2.25 0 01-2.247 2.118H6.622a2.25 2.25 0 01-2.247-2.118L3.75 7.5M10 11.25h4M3.375 7.5h17.25c.621 0 1.125-.504 1.125-1.125v-1.5c0-.621-.504-1.125-1.125-1.125H3.375c-.621 0-1.125.504-1.125 1.125v1.5c0 .621.504 1.125 1.125 1.125z"
            />
          </svg>
        </div>

        <h1 className="text-2xl font-bold text-slate-900">Account no longer active</h1>
        <p className="mt-3 text-sm text-slate-500">
          This Bivro account has been archived. No operational data is accessible.
        </p>

        <div className="mt-6 rounded-lg border border-slate-200 bg-white p-6 text-left">
          <p className="text-sm font-medium text-slate-700">Need your data?</p>
          <p className="mt-2 text-sm text-slate-500">
            Your data is retained in accordance with our data retention policy. You can request a
            data export by contacting us.
          </p>
          <a
            href="mailto:support@bivro.io?subject=Data%20Export%20Request"
            className="mt-3 inline-block text-sm font-medium text-violet-600 hover:text-violet-700"
          >
            Request data export →
          </a>
        </div>

        <p className="mt-6 text-sm text-slate-500">
          Questions?{" "}
          <a
            href="mailto:support@bivro.io"
            className="font-medium text-violet-600 hover:text-violet-700"
          >
            support@bivro.io
          </a>
        </p>
      </div>
    </div>
  )
}
