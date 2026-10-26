/**
 * Next.js instrumentation hook — runs once when the server starts.
 * Development only: starts the local domain-event loop (lib/events/dev-loop.ts).
 */
export async function register() {
  if (
    process.env["NEXT_RUNTIME"] === "nodejs" &&
    process.env.NODE_ENV === "development" &&
    process.env["DEV_EVENT_LOOP"] !== "off"
  ) {
    const { startDevEventLoop } = await import("./lib/events/dev-loop")
    startDevEventLoop()
  }
}
