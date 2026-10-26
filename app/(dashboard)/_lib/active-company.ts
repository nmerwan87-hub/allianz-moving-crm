"use client"

import { useEffect } from "react"
import { createClient } from "@/lib/supabase/client"
import { getJwtAppMetadata } from "@/lib/supabase/jwt"

/**
 * Client side of the company switch (docs/MULTI_COMPANY_ACCESS.md §4.2, §6).
 *
 * One browser session has exactly one active company — the one in the JWT.
 * After a switch every open tab must follow, otherwise a tab would keep showing
 * data of the previous company until its next token refresh.
 */

const CHANNEL_NAME = "bivro:active-company"

// BroadcastChannel also delivers to other channel objects in the sending tab;
// the tab id lets this tab ignore its own messages.
const TAB_ID = typeof crypto !== "undefined" ? crypto.randomUUID() : String(Math.random())

interface SwitchMessage {
  companyId: string
  tabId: string
}

function openChannel(): BroadcastChannel | null {
  return typeof BroadcastChannel === "undefined" ? null : new BroadcastChannel(CHANNEL_NAME)
}

/**
 * Finish a switch after the server accepted it: fetch a token for the new
 * company, tell the other tabs, then hard-navigate (to the dashboard unless a
 * record of the new company was requested). The full page load drops every
 * cached query of the previous company.
 */
export async function completeCompanySwitch(
  companyId: string,
  destination = "/dashboard",
): Promise<void> {
  const supabase = createClient()
  await supabase.auth.refreshSession()

  const channel = openChannel()
  channel?.postMessage({ companyId, tabId: TAB_ID } satisfies SwitchMessage)
  channel?.close()

  leavePage(destination)
}

// Set right before a navigation that the user already confirmed (or that must
// happen for correctness), so the browser's own "leave site?" prompt is skipped.
let bypassUnloadWarning = false

function leavePage(destination: string): void {
  bypassUnloadWarning = true
  window.location.assign(destination)
}

/**
 * Keeps this tab on the active company. Reacts to switches in other tabs
 * (BroadcastChannel) and, as a fallback, checks the token whenever the tab
 * regains focus.
 */
export function useActiveCompanySync(companyId: string): void {
  useEffect(() => {
    if (!companyId) return

    // Another tab switched company: this tab's token now belongs to the new
    // company, so anything still on screen (including unsaved form input) would be
    // saved into the wrong company. Leave unconditionally.
    function followSwitch(nextCompanyId: string | undefined) {
      if (nextCompanyId && nextCompanyId !== companyId) {
        leavePage("/dashboard")
      }
    }

    const channel = openChannel()
    if (channel) {
      channel.onmessage = (event: MessageEvent<SwitchMessage>) => {
        if (event.data.tabId !== TAB_ID) followSwitch(event.data.companyId)
      }
    }

    async function checkToken() {
      if (document.visibilityState !== "visible") return
      const supabase = createClient()
      const {
        data: { session },
      } = await supabase.auth.getSession()
      if (!session) return
      followSwitch(getJwtAppMetadata(session.access_token)["company_id"] as string | undefined)
    }

    document.addEventListener("visibilitychange", checkToken)
    window.addEventListener("focus", checkToken)

    return () => {
      channel?.close()
      document.removeEventListener("visibilitychange", checkToken)
      window.removeEventListener("focus", checkToken)
    }
  }, [companyId])
}

// ─── Unsaved changes ─────────────────────────────────────────────────────────

const dirtyForms = new Set<symbol>()

/** True while any mounted form registered via useUnsavedChangesGuard has unsaved input. */
export function hasUnsavedChanges(): boolean {
  return dirtyForms.size > 0
}

/**
 * Register a form's dirty state. The company switcher asks for confirmation
 * while any form is dirty, and the browser warns before leaving the page.
 */
export function useUnsavedChangesGuard(isDirty: boolean): void {
  useEffect(() => {
    if (!isDirty) return
    const token = Symbol("dirty-form")
    dirtyForms.add(token)

    function warn(event: BeforeUnloadEvent) {
      if (bypassUnloadWarning) return
      event.preventDefault()
    }
    window.addEventListener("beforeunload", warn)

    return () => {
      dirtyForms.delete(token)
      window.removeEventListener("beforeunload", warn)
    }
  }, [isDirty])
}

// ─── Company identity colour ─────────────────────────────────────────────────

const IDENTITY_COLOURS = [
  "bg-signal-600",
  "bg-ai-600",
  "bg-warning-600",
  "bg-success-600",
  "bg-info-600",
  "bg-danger-600",
] as const

/**
 * Stable colour per company so the active company is recognisable at a glance
 * (used until companies upload a logo).
 */
export function companyColour(companyId: string): string {
  let hash = 0
  for (const char of companyId) hash = (hash * 31 + char.charCodeAt(0)) >>> 0
  return IDENTITY_COLOURS[hash % IDENTITY_COLOURS.length]!
}

export function companyInitials(name: string): string {
  const words = name.trim().split(/\s+/).filter(Boolean)
  const initials = words.length > 1 ? `${words[0]![0]}${words[1]![0]}` : name.slice(0, 2)
  return initials.toUpperCase() || "B"
}
