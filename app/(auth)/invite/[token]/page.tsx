import { Suspense } from "react"
import { InviteAcceptanceClient } from "./invite-client"

interface PageProps {
  params: Promise<{ token: string }>
}

export default async function InviteTokenPage({ params }: PageProps) {
  const { token } = await params

  return (
    <div className="flex min-h-screen items-center justify-center bg-slate-50 px-6 py-12">
      <div className="w-full max-w-md">
        <Suspense
          fallback={<div className="text-center text-sm text-slate-500">Loading invitation…</div>}
        >
          <InviteAcceptanceClient rawToken={token} />
        </Suspense>
      </div>
    </div>
  )
}
