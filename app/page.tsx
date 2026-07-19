import { redirect } from "next/navigation"

// Root route — redirects to the authentication entry point.
// Unauthenticated users land here; middleware and auth flow
// (implemented in Sprint 3) will handle session-aware routing.
export default function RootPage() {
  redirect("/login")
}
