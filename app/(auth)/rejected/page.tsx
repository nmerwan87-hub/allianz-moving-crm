import type { Metadata } from "next"

export const metadata: Metadata = {
  title: "Anmeldung abgelehnt — Bivro",
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

        <h1 className="text-2xl font-bold text-slate-900">Anmeldung nicht bestätigt</h1>
        <p className="mt-3 text-sm text-slate-500">
          Deine Anmeldung wurde leider nicht bestätigt. Details findest du in der E-Mail, die wir
          dir gesendet haben.
        </p>

        <p className="mt-6 text-sm text-slate-500">
          Bei Fragen melde dich bei{" "}
          <a
            href="mailto:support@bivro.io"
            className="text-signal-600 hover:text-signal-700 font-medium"
          >
            support@bivro.io
          </a>
          .
        </p>
      </div>
    </div>
  )
}
