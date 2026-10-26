import { createServiceRoleClient } from "@/lib/supabase/service-role"

// ─── Permission group definitions ────────────────────────────────────────────

const PERMISSION_GROUPS: Array<{
  name: string
  slug: string
  description: string
  permissions: string[]
}> = [
  {
    name: "Dispatcher",
    slug: "dispatcher",
    description: "Manages crew assignments, schedules jobs, and coordinates daily operations.",
    permissions: [
      "jobs.view",
      "jobs.create",
      "jobs.edit",
      "jobs.assign",
      "jobs.complete",
      "jobs.cancel",
      "employees.view",
      "employees.create",
      "employees.edit",
      "vehicles.view",
      "vehicles.create",
      "vehicles.edit",
      "customers.view",
      "customers.create",
      "customers.edit",
      "leads.view",
    ],
  },
  {
    name: "Estimator",
    slug: "estimator",
    description: "Creates and sends quotes, manages leads, and handles customer pre-sales.",
    permissions: [
      "leads.view",
      "leads.create",
      "leads.edit",
      "leads.assign",
      "quotes.view",
      "quotes.create",
      "quotes.edit",
      "quotes.duplicate",
      "quotes.send",
      "quotes.approve",
      "quotes.change_pricing",
      "quotes.apply_discount",
      "customers.view",
      "customers.create",
      "customers.edit",
    ],
  },
  {
    name: "Office Manager",
    slug: "office-manager",
    description: "Full operational access except banking details and financial exports.",
    permissions: [
      "customers.view",
      "customers.create",
      "customers.edit",
      "customers.delete",
      "customers.export",
      "leads.view",
      "leads.create",
      "leads.edit",
      "leads.delete",
      "leads.assign",
      "quotes.view",
      "quotes.create",
      "quotes.edit",
      "quotes.delete",
      "quotes.duplicate",
      "quotes.send",
      "quotes.approve",
      "quotes.change_pricing",
      "quotes.view_cost_price",
      "quotes.apply_discount",
      "jobs.view",
      "jobs.create",
      "jobs.edit",
      "jobs.assign",
      "jobs.complete",
      "jobs.cancel",
      "employees.view",
      "employees.create",
      "employees.edit",
      "employees.delete",
      "vehicles.view",
      "vehicles.create",
      "vehicles.edit",
      "vehicles.delete",
      "invoices.view",
      "invoices.create",
      "invoices.edit",
      "invoices.cancel",
      "invoices.refund",
      "payments.view",
      "payments.record_manual",
      "payments.export",
      "communications.view",
      "communications.send",
      "communications.schedule",
      "communications.draft",
      "communications.manage_automations",
      "ai.view_suggestions",
      "ai.generate_quote",
      "ai.override",
      "analytics.view_operations",
      "analytics.view_sales",
      "settings.company",
      "settings.templates",
      "settings.services",
      "settings.users",
      "settings.permissions",
      "settings.integrations",
      "settings.legal_text",
    ],
  },
  {
    name: "Billing",
    slug: "billing",
    description: "Manages invoices, records payments, and views financial reports.",
    permissions: [
      "invoices.view",
      "invoices.create",
      "invoices.edit",
      "invoices.cancel",
      "invoices.refund",
      "payments.view",
      "payments.record_manual",
      "payments.export",
      "customers.view",
      "analytics.view_financial",
    ],
  },
]

// ─── Service catalog (19 items) ───────────────────────────────────────────────

const SERVICE_CATALOG_ITEMS: Array<{
  name: string
  description: string
  category: string
  default_pricing_mode: "fixed" | "hourly" | "quantity" | "distance" | "manual"
  default_unit_label: string | null
  sort_order: number
}> = [
  {
    name: "Umzugsteam (Stundenansatz)",
    description: "Crew incl. vehicle, billed per hour.",
    category: "Arbeit",
    default_pricing_mode: "hourly",
    default_unit_label: "Std.",
    sort_order: 1,
  },
  {
    name: "Verpackungsservice",
    description: "Packing by the crew, billed per hour.",
    category: "Arbeit",
    default_pricing_mode: "hourly",
    default_unit_label: "Std.",
    sort_order: 2,
  },
  {
    name: "Auspackservice",
    description: "Unpacking at the destination, billed per hour.",
    category: "Arbeit",
    default_pricing_mode: "hourly",
    default_unit_label: "Std.",
    sort_order: 3,
  },
  {
    name: "Möbelmontage",
    description: "Assembly of furniture at the destination.",
    category: "Arbeit",
    default_pricing_mode: "fixed",
    default_unit_label: "Pauschale",
    sort_order: 4,
  },
  {
    name: "Möbeldemontage",
    description: "Disassembly of furniture at the origin.",
    category: "Arbeit",
    default_pricing_mode: "fixed",
    default_unit_label: "Pauschale",
    sort_order: 5,
  },
  {
    name: "Möbellift",
    description: "Furniture lift incl. operator.",
    category: "Spezialleistungen",
    default_pricing_mode: "hourly",
    default_unit_label: "Std.",
    sort_order: 6,
  },
  {
    name: "Endreinigung mit Abnahmegarantie",
    description: "Final cleaning with handover guarantee.",
    category: "Reinigung",
    default_pricing_mode: "fixed",
    default_unit_label: "Pauschale",
    sort_order: 7,
  },
  {
    name: "Entsorgung",
    description: "Disposal, billed per cubic metre.",
    category: "Entsorgung",
    default_pricing_mode: "quantity",
    default_unit_label: "m³",
    sort_order: 8,
  },
  {
    name: "Umzugskartons",
    description: "Moving boxes (sale).",
    category: "Material",
    default_pricing_mode: "quantity",
    default_unit_label: "Stk.",
    sort_order: 9,
  },
  {
    name: "Kleiderboxen (Miete)",
    description: "Wardrobe boxes for rent incl. delivery and pick-up.",
    category: "Material",
    default_pricing_mode: "quantity",
    default_unit_label: "Stk.",
    sort_order: 10,
  },
  {
    name: "Verpackungsmaterial",
    description: "Packing paper, tape, bubble wrap.",
    category: "Material",
    default_pricing_mode: "fixed",
    default_unit_label: "Pauschale",
    sort_order: 11,
  },
  {
    name: "Einlagerung (pro Monat)",
    description: "Storage per cubic metre and month.",
    category: "Lagerung",
    default_pricing_mode: "quantity",
    default_unit_label: "m³/Mt.",
    sort_order: 12,
  },
  {
    name: "Klaviertransport",
    description: "Piano transport incl. special equipment.",
    category: "Spezialleistungen",
    default_pricing_mode: "fixed",
    default_unit_label: "Pauschale",
    sort_order: 13,
  },
  {
    name: "Tresortransport",
    description: "Safe transport incl. special equipment.",
    category: "Spezialleistungen",
    default_pricing_mode: "fixed",
    default_unit_label: "Pauschale",
    sort_order: 14,
  },
  {
    name: "Lampen montieren/demontieren",
    description: "Removal or installation of lamps.",
    category: "Arbeit",
    default_pricing_mode: "quantity",
    default_unit_label: "Stk.",
    sort_order: 15,
  },
  {
    name: "Anfahrtspauschale",
    description: "Travel to and from the job.",
    category: "Zuschläge",
    default_pricing_mode: "fixed",
    default_unit_label: "Pauschale",
    sort_order: 16,
  },
  {
    name: "Kilometerzuschlag",
    description: "Distance surcharge per kilometre.",
    category: "Zuschläge",
    default_pricing_mode: "distance",
    default_unit_label: "km",
    sort_order: 17,
  },
  {
    name: "Halteverbotszone / Parkbewilligung",
    description: "No-parking zone or parking permit.",
    category: "Zuschläge",
    default_pricing_mode: "fixed",
    default_unit_label: "Pauschale",
    sort_order: 18,
  },
  {
    name: "Wochenend-/Feiertagszuschlag",
    description: "Surcharge for Saturdays, Sundays and public holidays.",
    category: "Zuschläge",
    default_pricing_mode: "manual",
    default_unit_label: null,
    sort_order: 19,
  },
]

// ─── Email template slugs (27) ────────────────────────────────────────────────

const EMAIL_TEMPLATES: Array<{
  slug: string
  name: string
  description: string
  lifecycle_stage: string
  template_class: string
}> = [
  {
    slug: "lead-received",
    name: "Lead Received",
    description: "Sent to the customer when a new lead is created from their enquiry.",
    lifecycle_stage: "lead",
    template_class: "transactional",
  },
  {
    slug: "quote-sent",
    name: "Quote Sent",
    description: "Sent to the customer when a quote is delivered.",
    lifecycle_stage: "quoting",
    template_class: "transactional",
  },
  {
    slug: "quote-follow-up-1",
    name: "Quote Follow-up (24h)",
    description: "Follow-up sent 24 hours after the quote if not yet accepted.",
    lifecycle_stage: "quoting",
    template_class: "transactional",
  },
  {
    slug: "quote-follow-up-2",
    name: "Quote Follow-up (3 days)",
    description: "Second follow-up sent 3 days after the quote if not yet accepted.",
    lifecycle_stage: "quoting",
    template_class: "transactional",
  },
  {
    slug: "quote-expiry-warning",
    name: "Quote Expiry Warning",
    description: "Reminder sent 48 hours before the quote expires.",
    lifecycle_stage: "quoting",
    template_class: "transactional",
  },
  {
    slug: "quote-accepted",
    name: "Quote Accepted",
    description: "Confirmation sent when the customer accepts a quote.",
    lifecycle_stage: "quoting",
    template_class: "transactional",
  },
  {
    slug: "contract-sent",
    name: "Contract Sent",
    description: "Sent when the moving contract is delivered to the customer.",
    lifecycle_stage: "booking",
    template_class: "transactional",
  },
  {
    slug: "deposit-request",
    name: "Deposit Request",
    description: "Sent when a deposit payment link is issued.",
    lifecycle_stage: "booking",
    template_class: "transactional",
  },
  {
    slug: "deposit-confirmed",
    name: "Deposit Confirmed",
    description: "Receipt sent when the deposit payment is received.",
    lifecycle_stage: "booking",
    template_class: "transactional",
  },
  {
    slug: "booking-confirmed",
    name: "Booking Confirmed",
    description: "Full booking summary sent after deposit and contract are complete.",
    lifecycle_stage: "booking",
    template_class: "transactional",
  },
  {
    slug: "pre-move-preparation",
    name: "Pre-Move Preparation Guide",
    description: "Preparation checklist sent 7 days before the move date.",
    lifecycle_stage: "pre_move",
    template_class: "transactional",
  },
  {
    slug: "move-reminder",
    name: "Move Day Reminder",
    description: "Reminder sent 48 hours before move day.",
    lifecycle_stage: "pre_move",
    template_class: "transactional",
  },
  {
    slug: "crew-on-the-way",
    name: "Crew On the Way",
    description: "Day-of notification sent when the crew departs for the customer.",
    lifecycle_stage: "move_day",
    template_class: "transactional",
  },
  {
    slug: "post-move-thank-you",
    name: "Post-Move Thank You",
    description: "Thank you message sent after the job is completed.",
    lifecycle_stage: "post_move",
    template_class: "transactional",
  },
  {
    slug: "invoice-sent",
    name: "Invoice Sent",
    description: "Sent when a final invoice is delivered to the customer.",
    lifecycle_stage: "invoicing",
    template_class: "transactional",
  },
  {
    slug: "payment-reminder-1",
    name: "Payment Reminder (48h overdue)",
    description: "Sent 48 hours after invoice due date if unpaid.",
    lifecycle_stage: "invoicing",
    template_class: "transactional",
  },
  {
    slug: "payment-reminder-2",
    name: "Payment Reminder (7 days overdue)",
    description: "Sent 7 days after invoice due date if still unpaid.",
    lifecycle_stage: "invoicing",
    template_class: "transactional",
  },
  {
    slug: "payment-confirmed",
    name: "Payment Confirmed",
    description: "Receipt sent when the final invoice payment is received.",
    lifecycle_stage: "invoicing",
    template_class: "transactional",
  },
  {
    slug: "review-request",
    name: "Review Request",
    description: "Review solicitation sent 48 hours after the job is completed.",
    lifecycle_stage: "post_move",
    template_class: "marketing",
  },
  {
    slug: "crew-job-assignment",
    name: "Crew Job Assignment",
    description: "Internal notification sent to crew members when assigned to a job.",
    lifecycle_stage: "operations",
    template_class: "transactional",
  },
  {
    slug: "crew-job-reminder",
    name: "Crew Job Reminder",
    description: "Reminder sent to crew members the day before their assigned job.",
    lifecycle_stage: "operations",
    template_class: "transactional",
  },
  {
    slug: "quote-declined",
    name: "Quote Declined",
    description: "Acknowledgment sent when the customer declines a quote.",
    lifecycle_stage: "quoting",
    template_class: "transactional",
  },
  {
    slug: "job-cancelled",
    name: "Job Cancelled",
    description: "Cancellation confirmation sent to the customer.",
    lifecycle_stage: "operations",
    template_class: "transactional",
  },
  {
    slug: "damage-report-sent",
    name: "Damage Report Sent",
    description: "Damage documentation and photos sent to the customer after a reported incident.",
    lifecycle_stage: "post_move",
    template_class: "transactional",
  },
  {
    slug: "invoice-overdue-final",
    name: "Invoice Overdue — Final Notice",
    description: "Final overdue notice before the account is escalated.",
    lifecycle_stage: "invoicing",
    template_class: "transactional",
  },
  {
    slug: "portal-access-link",
    name: "Customer Portal Access",
    description: "Sent to customers who request access to their document portal.",
    lifecycle_stage: "customer_portal",
    template_class: "transactional",
  },
  {
    slug: "general-follow-up",
    name: "General Follow-up",
    description: "General-purpose outreach template for manual follow-ups.",
    lifecycle_stage: "general",
    template_class: "transactional",
  },
]

// ─── Email automations (12, seeded inactive) ─────────────────────────────────

interface AutomationSeed {
  name: string
  description: string
  trigger_event: string
  trigger_delay_seconds: number
  template_slug: string
  mode: string
}

const EMAIL_AUTOMATIONS: AutomationSeed[] = [
  {
    name: "Quote Follow-up 1 (24h)",
    description: "Follow-up 24 hours after a quote is sent if not accepted.",
    trigger_event: "quoting.quote.sent",
    trigger_delay_seconds: 86400,
    template_slug: "quote-follow-up-1",
    mode: "approval",
  },
  {
    name: "Quote Follow-up 2 (3 days)",
    description: "Second follow-up 3 days after a quote is sent if not accepted.",
    trigger_event: "quoting.quote.sent",
    trigger_delay_seconds: 259200,
    template_slug: "quote-follow-up-2",
    mode: "approval",
  },
  {
    name: "Quote Expiry Warning",
    description: "Warning sent 5 days after quote sent (near expiry).",
    trigger_event: "quoting.quote.sent",
    trigger_delay_seconds: 432000,
    template_slug: "quote-expiry-warning",
    mode: "auto_send",
  },
  {
    name: "Booking Confirmation",
    description: "Booking summary sent immediately when a quote is accepted.",
    trigger_event: "quoting.quote.accepted",
    trigger_delay_seconds: 0,
    template_slug: "booking-confirmed",
    mode: "auto_send",
  },
  {
    name: "Pre-Move Preparation Guide",
    description: "Preparation guide sent immediately when a job is scheduled.",
    trigger_event: "jobs.job.scheduled",
    trigger_delay_seconds: 0,
    template_slug: "pre-move-preparation",
    mode: "auto_send",
  },
  {
    name: "Move Day Reminder (48h before)",
    description: "Reminder sent 48 hours before the scheduled move.",
    trigger_event: "jobs.job.scheduled",
    trigger_delay_seconds: -172800,
    template_slug: "move-reminder",
    mode: "auto_send",
  },
  {
    name: "Post-Move Thank You",
    description: "Thank you sent 2 hours after job completion.",
    trigger_event: "jobs.job.completed",
    trigger_delay_seconds: 7200,
    template_slug: "post-move-thank-you",
    mode: "auto_send",
  },
  {
    name: "Review Request",
    description: "Review solicitation sent 48 hours after job completion.",
    trigger_event: "jobs.job.completed",
    trigger_delay_seconds: 172800,
    template_slug: "review-request",
    mode: "approval",
  },
  {
    name: "Payment Reminder 1 (48h overdue)",
    description: "First payment reminder sent 48 hours after invoice due date.",
    trigger_event: "invoicing.invoice.sent",
    trigger_delay_seconds: 172800,
    template_slug: "payment-reminder-1",
    mode: "auto_send",
  },
  {
    name: "Payment Reminder 2 (7 days overdue)",
    description: "Second payment reminder sent 7 days after invoice due date.",
    trigger_event: "invoicing.invoice.sent",
    trigger_delay_seconds: 604800,
    template_slug: "payment-reminder-2",
    mode: "auto_send",
  },
  {
    name: "Payment Confirmed",
    description: "Payment receipt sent immediately when a payment is received.",
    trigger_event: "invoicing.payment.received",
    trigger_delay_seconds: 0,
    template_slug: "payment-confirmed",
    mode: "auto_send",
  },
  {
    name: "Lead Received",
    description: "Acknowledgment sent when a new lead arrives via the lead form.",
    trigger_event: "crm.lead.received",
    trigger_delay_seconds: 0,
    template_slug: "lead-received",
    mode: "approval",
  },
]

// ─── Main provisioning function ──────────────────────────────────────────────

/**
 * Provisions all company defaults after Platform Admin approval.
 * Idempotent: safe to call multiple times — checks for existing rows first.
 *
 * Creates:
 *   1. company_settings (default rates)
 *   2. 4 permission_groups + permission_group_assignments
 *   3. 19 service_catalog rows (is_system_default: true)
 *   4. 27 email_templates + 27 email_template_versions (version 1, current)
 *   5. 12 email_automations (is_active: false)
 *   6. 1 email_sender_identity (tier: bivro_managed)
 */
export async function provisionCompany(companyId: string): Promise<void> {
  const svc = createServiceRoleClient()

  // 1. Company settings (idempotent via ON CONFLICT DO NOTHING equivalent)
  const { data: existingSettings } = await svc
    .from("company_settings")
    .select("id")
    .eq("company_id", companyId)
    .maybeSingle()

  if (!existingSettings) {
    await svc.from("company_settings").insert({
      company_id: companyId,
      local_rate_per_hour_cents: 0,
      long_distance_rate_per_mile_cents: 0,
      minimum_charge_cents: 0,
      minimum_hours: 2.0,
      fuel_surcharge_percent: 0,
      stair_carry_rate_cents: 0,
      long_carry_rate_cents: 0,
      elevator_wait_rate_cents: 0,
      default_deposit_percent: 20,
      default_quote_expiry_days: 30,
      default_payment_terms_days: 30,
      tax_enabled: true,
      tax_rate_percent: 8.1,
      tax_label: "MWST",
    })
  }

  // 2. Permission groups
  const { data: existingGroups } = await svc
    .from("permission_groups")
    .select("id, name")
    .eq("company_id", companyId)

  const existingGroupNames = new Set((existingGroups ?? []).map((g) => g.name))

  for (const group of PERMISSION_GROUPS) {
    if (existingGroupNames.has(group.name)) continue

    const { data: newGroup } = await svc
      .from("permission_groups")
      .insert({
        company_id: companyId,
        name: group.name,
        description: group.description,
        is_default: false,
      })
      .select("id")
      .single()

    if (!newGroup) continue

    const assignments = group.permissions.map((key) => ({
      group_id: newGroup.id,
      permission_key: key,
      company_id: companyId,
    }))

    if (assignments.length > 0) {
      await svc.from("permission_group_assignments").insert(assignments)
    }
  }

  // 3. Service catalog (19 items)
  const { data: existingCatalog } = await svc
    .from("service_catalog")
    .select("name")
    .eq("company_id", companyId)
    .eq("is_system_default", true)

  const existingServiceNames = new Set((existingCatalog ?? []).map((s) => s.name))

  const newServices = SERVICE_CATALOG_ITEMS.filter(
    (item) => !existingServiceNames.has(item.name),
  ).map((item) => ({
    company_id: companyId,
    name: item.name,
    description: item.description,
    category: item.category,
    default_pricing_mode: item.default_pricing_mode,
    default_unit_label: item.default_unit_label,
    default_unit_price_cents: 0,
    default_vat_rate_percent: 8.1,
    is_active: true,
    is_system_default: true,
    sort_order: item.sort_order,
  }))

  if (newServices.length > 0) {
    const { error: catalogError } = await svc.from("service_catalog").insert(newServices)
    if (catalogError) throw new Error(`provision service catalog: ${catalogError.message}`)
  }

  // 4. Email templates (27) + versions
  const { data: existingTemplates } = await svc
    .from("email_templates")
    .select("slug")
    .eq("company_id", companyId)
    .eq("is_system_default", true)

  const existingSlugs = new Set((existingTemplates ?? []).map((t) => t.slug))

  for (const template of EMAIL_TEMPLATES) {
    if (existingSlugs.has(template.slug)) continue

    const { data: newTemplate } = await svc
      .from("email_templates")
      .insert({
        company_id: companyId,
        slug: template.slug,
        name: template.name,
        description: template.description,
        lifecycle_stage: template.lifecycle_stage,
        template_class: template.template_class,
        is_system_default: true,
        is_active: true,
        sort_order: 0,
      })
      .select("id")
      .single()

    if (!newTemplate) continue

    const placeholderHtml = `<p>This template (${template.name}) has not been configured yet. Edit it in Settings → Email Templates.</p>`

    await svc.from("email_template_versions").insert({
      template_id: newTemplate.id,
      company_id: companyId,
      version_number: 1,
      is_current: true,
      language: "en",
      subject: template.name,
      body_html: placeholderHtml,
      body_text: `This template (${template.name}) has not been configured yet.`,
      variables_used: [],
    })
  }

  // 5. Email automations (12, all inactive)
  const { data: existingAutomations } = await svc
    .from("email_automations")
    .select("name")
    .eq("company_id", companyId)
    .eq("is_system_default", true)

  const existingAutoNames = new Set((existingAutomations ?? []).map((a) => a.name))

  // Look up template IDs for automation references
  const { data: allTemplates } = await svc
    .from("email_templates")
    .select("id, slug")
    .eq("company_id", companyId)

  const templateIdBySlug = new Map((allTemplates ?? []).map((t) => [t.slug, t.id]))

  // Look up sender identity
  const { data: senderIdentity } = await svc
    .from("email_sender_identities")
    .select("id")
    .eq("company_id", companyId)
    .eq("is_default", true)
    .maybeSingle()

  for (const auto of EMAIL_AUTOMATIONS) {
    if (existingAutoNames.has(auto.name)) continue

    const templateId = templateIdBySlug.get(auto.template_slug)
    if (!templateId) continue

    await svc.from("email_automations").insert({
      company_id: companyId,
      name: auto.name,
      description: auto.description,
      trigger_event: auto.trigger_event,
      trigger_delay_seconds: auto.trigger_delay_seconds,
      conditions: [],
      template_id: templateId,
      template_language: "en",
      sender_identity_id: senderIdentity?.id ?? null,
      mode: auto.mode,
      max_retries: 3,
      retry_delay_minutes: 5,
      is_system_default: true,
      is_active: false,
    })
  }

  // 6. Email sender identity
  const { data: existingSender } = await svc
    .from("email_sender_identities")
    .select("id")
    .eq("company_id", companyId)
    .maybeSingle()

  if (!existingSender) {
    await svc.from("email_sender_identities").insert({
      company_id: companyId,
      email: "noreply@mail.bivro.io",
      name: "Bivro",
      tier: "bivro_managed",
      is_default: true,
    })
  }
}
