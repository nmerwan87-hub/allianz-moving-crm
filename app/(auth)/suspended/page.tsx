import type { Metadata } from "next"
import { createClient } from "@/lib/supabase/server"
import { createServiceRoleClient } from "@/lib/supabase/service-role"

export const metadata: Metadata = {
  title: "Account Suspended — Bivro",
}

export default async function SuspendedPage() {
  let suspendedReason: string | null = null

  try {
    const supabase = await createClient()
    const {
      data: { user },
    } = await supabase.auth.getUser()

    if (user) {
      const companyId = user.app_metadata["company_id"] as string | undefined
      if (companyId) {
        const svc = createServiceRoleClient()
        const { data: company } = await svc
          .from("companies")
          .select("suspended_reason")
          .eq("id", companyId)
          .maybeSingle()
        suspendedReason = (company?.suspended_reason as string | null) ?? null
      }
    }
  } catch {
    // fallback to generic message
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-slate-50 px-6 py-12">
      <div className="w-full max-w-md text-center">
        <div className="mb-6 inline-flex h-16 w-16 items-center justify-center rounded-full bg-red-100">
          <svg
            className="h-8 w-8 text-red-600"
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

        <h1 className="text-2xl font-bold text-slate-900">Account suspended</h1>
        <p className="mt-3 text-sm text-slate-500">
          Your Bivro account has been temporarily suspended.
        </p>

        {suspendedReason ? (
          <div className="mt-6 rounded-lg border border-red-200 bg-red-50 p-4 text-left">
            <p className="text-sm font-medium text-red-800">Reason</p>
            <p className="mt-1 text-sm text-red-700">{suspendedReason}</p>
          </div>
        ) : null}

        <p className="mt-6 text-sm text-slate-500">
          To resolve this, please contact{" "}
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
