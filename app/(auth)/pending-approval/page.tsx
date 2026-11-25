import type { Metadata } from "next"

export const metadata: Metadata = {
  title: "Anmeldung in Prüfung — Bivro",
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

        <h1 className="text-2xl font-bold text-slate-900">Anmeldung wird geprüft</h1>
        <p className="mt-3 text-sm text-slate-500">
          Deine E-Mail ist bestätigt. Wir prüfen jetzt deine Anmeldung.
        </p>

        <div className="mt-8 rounded-lg border border-amber-200 bg-amber-50 p-6 text-left">
          <p className="text-sm font-semibold text-amber-800">Wie geht es weiter?</p>
          <ul className="mt-3 space-y-2 text-sm text-amber-700">
            <li className="flex items-start gap-2">
              <span className="mt-0.5 flex-shrink-0">1.</span>
              <span>Wir prüfen deine Anmeldung innert eines Arbeitstags.</span>
            </li>
            <li className="flex items-start gap-2">
              <span className="mt-0.5 flex-shrink-0">2.</span>
              <span>Du erhältst eine E-Mail, sobald entschieden ist.</span>
            </li>
            <li className="flex items-start gap-2">
              <span className="mt-0.5 flex-shrink-0">3.</span>
              <span>
                Danach startet deine 14-tägige Testphase und wir führen dich durch die Einrichtung.
              </span>
            </li>
          </ul>
        </div>

        <p className="mt-6 text-sm text-slate-500">
          Fragen?{" "}
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
