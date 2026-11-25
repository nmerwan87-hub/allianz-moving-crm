/** German names for permission resources and actions (keys stay English in the database). */
export const RESOURCE_LABELS: Record<string, string> = {
  customers: "Kunden",
  leads: "Anfragen",
  quotes: "Offerten",
  jobs: "Aufträge",
  employees: "Mitarbeitende",
  vehicles: "Fahrzeuge",
  invoices: "Rechnungen",
  payments: "Zahlungen",
  communications: "Kommunikation",
  ai: "KI",
  analytics: "Auswertungen",
  settings: "Einstellungen",
}

const PERMISSION_LABELS: Record<string, string> = {
  view: "ansehen",
  create: "erstellen",
  edit: "bearbeiten",
  delete: "löschen",
  export: "exportieren",
  assign: "zuteilen",
  duplicate: "kopieren",
  send: "senden",
  approve: "freigeben",
  change_pricing: "Preise ändern",
  view_cost_price: "Einstandspreise sehen",
  apply_discount: "Rabatte geben",
  complete: "abschliessen",
  cancel: "stornieren / absagen",
  refund: "rückerstatten",
  record_manual: "Zahlungen erfassen",
  schedule: "planen",
  draft: "entwerfen",
  manage_automations: "Automatisierungen verwalten",
  view_suggestions: "Vorschläge sehen",
  generate_quote: "Offerte generieren",
  override: "übersteuern",
  auto_pricing: "automatische Preise",
  auto_emails: "automatische E-Mails",
  view_operations: "Betrieb",
  view_sales: "Verkauf",
  view_financial: "Finanzen",
  company: "Firmendaten",
  templates: "Vorlagen",
  services: "Leistungen",
  users: "Benutzer",
  permissions: "Rechte",
  integrations: "Integrationen",
  legal_text: "Rechtstexte",
  banking: "Bankverbindung",
}

export function resourceLabel(resource: string): string {
  return RESOURCE_LABELS[resource] ?? resource
}

export function actionLabel(action: string): string {
  return PERMISSION_LABELS[action] ?? action.replace(/_/g, " ")
}
