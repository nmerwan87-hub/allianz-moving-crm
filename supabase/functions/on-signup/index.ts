/**
 * on-signup Edge Function — STUB
 *
 * This function is a deliverable stub required by Sprint 3 (MASTER_BOOTSTRAP §48 deliverable #3).
 *
 * Company and profile creation after signup is handled synchronously in the tRPC
 * registration handler (modules/iam/router/registration.ts) via the service role client.
 * This is more reliable than an async Edge Function because:
 *   1. The registration handler and database writes happen in a single server round-trip.
 *   2. There is no race condition between the client session and profile creation.
 *   3. Rollback on failure is handled explicitly by the tRPC handler.
 *
 * If a future Sprint requires genuine async post-signup processing (e.g., AI onboarding
 * analysis, third-party webhook delivery), this stub can be activated and wired to
 * Supabase Auth's `auth.users.insert` hook.
 */
import { serve } from "https://deno.land/std@0.177.0/http/server.ts"

serve((_req: Request) => {
  return new Response(
    JSON.stringify({ message: "on-signup: no-op stub; see tRPC registration handler" }),
    {
      status: 200,
      headers: { "Content-Type": "application/json" },
    },
  )
})
