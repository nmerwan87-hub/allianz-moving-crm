import { TRPCError } from "@trpc/server"
import type { SupabaseClient } from "@supabase/supabase-js"

export const WORKFLOW_ENTITIES = [
  "lead",
  "appointment",
  "quote",
  "job",
  "invoice",
  "payment",
] as const
export type WorkflowEntity = (typeof WORKFLOW_ENTITIES)[number]

/**
 * Error prefixes raised by the database (migration 025). The database is the
 * single source of truth for allowed transitions; this only translates its
 * errors into API errors with readable messages.
 */
/**
 * German text for the details the database reports (migrations 025, 028,
 * 031). The database messages stay English; the user sees these.
 */
const DETAIL_DE: Array<[RegExp, string]> = [
  [/add the company bank account/, "Erfasse zuerst die Bankverbindung (IBAN) in den Firmendaten."],
  [/cancel the recorded payments/, "Storniere zuerst die erfassten Zahlungen."],
  [/deposits exceed the invoice total/, "Die Anzahlungen sind höher als das Rechnungstotal."],
  [/invoice has payments/, "Auf der Rechnung sind Zahlungen erfasst."],
  [/invoice is fully paid/, "Die Rechnung ist vollständig bezahlt."],
  [/invoice still has a balance due/, "Auf der Rechnung ist noch ein Betrag offen."],
  [
    /invoice total exceeds the cost cap/,
    "Das Total liegt über dem Kostendach. Gib einen Grund an.",
  ],
  [/invoice total must be greater than zero/, "Das Rechnungstotal muss grösser als null sein."],
  [/job needs at least one crew assignment/, "Teile zuerst mindestens eine Person ein."],
  [/nothing left to write off/, "Es ist nichts mehr offen."],
  [
    /only sent, viewed, expired or declined quotes can be revised/,
    "Nur gesendete, abgelaufene oder abgelehnte Offerten können überarbeitet werden.",
  ],
  [/partially paid needs a payment/, "Teilbezahlt braucht eine Zahlung und einen offenen Betrag."],
  [/quote needs a customer/, "Die Offerte braucht einen Kunden."],
  [/quote total exceeds the cost cap/, "Das Total liegt über dem Kostendach."],
  [
    /quote total must be greater than zero/,
    "Die Offerte braucht mindestens eine Position mit Preis.",
  ],
  [
    /settle a job once the move has started/,
    "Abrechnen ist möglich, sobald der Umzug begonnen hat.",
  ],
  [/this job already has an invoice/, "Dieser Auftrag hat schon eine Rechnung."],
  [/validity date must be in the future/, "Das Gültigkeitsdatum muss in der Zukunft liegen."],
  [/discount must be between 0 and 100/, "Rabatt zwischen 0 und 100 %."],
  [/discount must not exceed the line amount/, "Der Rabatt ist höher als der Positionsbetrag."],
  [/expected up to 200 lines/, "Höchstens 200 Positionen."],
  [/price must not be negative/, "Der Preis darf nicht negativ sein."],
  [/quantity must be greater than zero/, "Die Menge muss grösser als null sein."],
  [
    /amount exceeds the open balance of CHF ([\d.]+)/,
    "Der Betrag ist höher als der offene Betrag von CHF $1.",
  ],
  [/amount must be greater than zero/, "Der Betrag muss grösser als null sein."],
  [
    /payments can only be recorded on open invoices/,
    "Zahlungen nur auf offenen Rechnungen erfassen.",
  ],
  [/payments without an invoice are deposits/, "Zahlungen ohne Rechnung sind Anzahlungen."],
  [/refunds are not supported yet/, "Rückerstattungen sind noch nicht möglich."],
  [
    /the job is already invoiced/,
    "Der Auftrag ist schon verrechnet. Erfasse die Zahlung auf der Rechnung.",
  ],
  [
    /issued invoices cannot be deleted/,
    "Ausgestellte Rechnungen werden storniert, nicht gelöscht.",
  ],
  [
    /issued invoice cannot be (edited|changed)|lines of an issued invoice/,
    "Eine ausgestellte Rechnung kann nicht mehr geändert werden. Storniere sie und rechne neu ab.",
  ],
  [
    /quote cannot be edited|lines of a .* quote cannot be changed/,
    "Eine gesendete Offerte kann nicht mehr geändert werden. Erstelle eine neue Version.",
  ],
]

function german(detail: string): string {
  for (const [pattern, text] of DETAIL_DE) {
    const match = detail.match(pattern)
    if (match) return text.replace("$1", match[1] ?? "")
  }
  return capitalise(detail) + "."
}

/**
 * Error prefixes raised by the database (migration 025). The database is the
 * single source of truth for allowed transitions; this only translates its
 * errors into API errors with readable messages.
 */
const ERROR_MAP: Array<{
  prefix: string
  code: TRPCError["code"]
  message: (detail: string) => string
}> = [
  {
    prefix: "invalid_transition:",
    code: "BAD_REQUEST",
    message: () => "Dieser Statuswechsel ist nicht möglich.",
  },
  {
    prefix: "system_only_transition:",
    code: "FORBIDDEN",
    message: () => "Dieser Status wird automatisch gesetzt.",
  },
  {
    prefix: "reason_required:",
    code: "BAD_REQUEST",
    message: () => "Bitte gib einen Grund an.",
  },
  { prefix: "guard_failed:", code: "PRECONDITION_FAILED", message: german },
  { prefix: "not_found:", code: "NOT_FOUND", message: () => "Eintrag nicht gefunden." },
  { prefix: "invoice_locked:", code: "BAD_REQUEST", message: german },
  { prefix: "quote_locked:", code: "BAD_REQUEST", message: german },
  { prefix: "invalid_payment:", code: "BAD_REQUEST", message: german },
  { prefix: "invalid_line:", code: "BAD_REQUEST", message: german },
]

function capitalise(text: string): string {
  return text.charAt(0).toUpperCase() + text.slice(1)
}

export function toWorkflowError(error: { message?: string } | null | undefined): TRPCError {
  const message = error?.message ?? ""
  for (const entry of ERROR_MAP) {
    const index = message.indexOf(entry.prefix)
    if (index !== -1) {
      const detail = message.slice(index + entry.prefix.length).trim()
      return new TRPCError({ code: entry.code, message: entry.message(detail) })
    }
  }
  return new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Statuswechsel fehlgeschlagen." })
}

/**
 * Change the status of a workflow entity through the database function
 * `transition_status`. With a user client, RLS and the user's role apply; with
 * the service-role client the change counts as a system change.
 */
export async function transitionStatus(
  client: SupabaseClient,
  entity: WorkflowEntity,
  id: string,
  toStatus: string,
  reason?: string | null,
): Promise<void> {
  const { error } = await client.rpc("transition_status", {
    p_entity: entity,
    p_id: id,
    p_to_status: toStatus,
    p_reason: reason?.trim() ? reason.trim() : null,
  })
  if (error) throw toWorkflowError(error)
}
