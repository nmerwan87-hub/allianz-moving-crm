# Bivro Email System Architecture

**Document status:** Architecture specification — no code, no migrations, no frontend template files.
**Version:** V1 (outbound, lifecycle-driven, AI-assisted communication)
**Cross-references:** ARCHITECTURE.md §3 §10 §15, DATABASE_ARCHITECTURE.md §16, AI_ENGINE.md, PRODUCT_REQUIREMENTS.md §3.3, UI_UX_SYSTEM.md, PLATFORM_ADMIN.md

---

## Table of Contents

1. [Communication Philosophy](#1-communication-philosophy)
2. [Tenant Isolation in Communication](#2-tenant-isolation-in-communication)
3. [Communication Lifecycle](#3-communication-lifecycle)
4. [Email Composer UX](#4-email-composer-ux)
5. [AI Communication Assistant](#5-ai-communication-assistant)
6. [AI Tone Memory](#6-ai-tone-memory)
7. [Multilingual Communication](#7-multilingual-communication)
8. [Template System](#8-template-system)
9. [Automation Engine](#9-automation-engine)
10. [Quote Follow-Up Intelligence](#10-quote-follow-up-intelligence)
11. [Inbound Email Architecture](#11-inbound-email-architecture)
12. [Customer Communication Timeline](#12-customer-communication-timeline)
13. [Delivery Architecture](#13-delivery-architecture)
14. [Email Safety and Pre-Send Validation](#14-email-safety-and-pre-send-validation)
15. [Permissions](#15-permissions)
16. [Audit and Compliance](#16-audit-and-compliance)
17. [Mobile UX](#17-mobile-ux)
18. [Database Schema Extensions](#18-database-schema-extensions)
19. [V1 vs V2+ Scope](#19-v1-vs-v2-scope)
20. [Cross-Document Consistency](#20-cross-document-consistency)
21. [Final Report](#21-final-report)

---

## 1. Communication Philosophy

### 1.1 The Core Thesis

Email in Bivro is not a "send message" feature bolted onto an operational tool. It is the communication layer of an AI Operating System. Every outbound message is an extension of the company's professional relationship with its customer.

Done right, a quote follow-up at the right moment converts a hesitating customer. A pre-move preparation email builds trust before the crew arrives. A personalized thank-you turns a one-time move into a referral. Done carelessly, automated emails embarrass the company.

Bivro's communication system must make it easy to do the right thing and hard to do the embarrassing thing.

### 1.2 Five Communication Principles

**P1 — Company Voice, Not Bivro Voice**
Every email a customer receives should feel like it came from the moving company. Bivro's role is invisible. The company's name, tone, identity, and sender domain are what the customer sees.

**P2 — AI Drafts, Humans Send**
The AI may draft, suggest, and schedule. The human understands what will be sent, to whom, when, and why before it goes out. Exceptions exist only for explicitly approved, business-safe automations at the Owner's discretion.

**P3 — Right Message, Right Moment**
A payment reminder sent the day after the job, before the customer has had a chance to process the invoice, damages goodwill. Timing is not a cosmetic detail — it is part of the message's meaning.

**P4 — Immutable History**
Every sent email is a permanent, immutable record. What went to the customer is always retrievable. No edit to a template ever changes a previously sent message.

**P5 — Transparent Automation**
When an email was sent by an automation, the internal communication history marks it as such. Office users understand which messages were manually sent and which were automated. Surprises damage trust in both directions — the customer's and the team's.

### 1.3 What Email Is Not

- Not a cold outreach system. Bivro manages communication with existing customers and active leads — not mass acquisition campaigns.
- Not a marketing broadcast platform. Promotional or bulk marketing email is architecturally separate from transactional operational email and governed by different rules.
- Not a fully autonomous agent. The AI assists. The human remains responsible for what is sent.

---

## 2. Tenant Isolation in Communication

### 2.1 The Foundational Rule

Every company's communication data is completely isolated. No data, pattern, preference, style, or history from Company A may influence Company B's communication in any way.

This applies to:
- Email history and sent message records
- Customer communication preferences (language, opt-out status)
- Company tone preferences and AI-learned communication style
- Template definitions and template content
- Sender identities and verified domains
- Delivery statistics and open/click analytics
- AI communication memory (learned tone, preferred greetings, follow-up timing)
- AI communication suggestions derived from observed patterns

The Company AI Brain (AI_ENGINE.md §2) governs this isolation. The communication module is a consumer of that brain — it inherits the same isolation guarantee.

### 2.2 Platform Portal Access to Communication Data

Bivro platform staff never view the content of customer emails sent by a company. Platform analytics may include aggregate, anonymized delivery statistics (total emails sent per tier, average open rates across platform) but never message content, customer email addresses, or company-specific communication data.

Support access to a company (via break-glass session) includes the communication timeline as visible data during the session — every access is logged per PLATFORM_ADMIN.md §5.

---

## 3. Communication Lifecycle

The following table defines the 27 lifecycle stages that the communication system must support. Each stage is a defined communication moment — some automated, some manual.

### 3.1 Lifecycle Stage Definitions

For each stage: **Trigger | Audience | Channel | Automation Eligibility | Approval Required | AI Involvement | Cancellation Conditions | Audit**

---

**Stage 1 — Lead Received**
- Trigger: New lead record created (manual entry or future web form integration)
- Audience: Owner/Office user (internal notification, not customer)
- Channel: In-app notification (see UI_UX_SYSTEM.md §12.11); email alert to `company_settings.alert_email` if configured
- Automation: V2+ (inbound lead auto-acknowledge)
- Approval: Not applicable (internal)
- AI: Lead score surfaced (AI_ENGINE.md §17 Task 2); intent classification if inbound
- Cancellation: N/A
- Audit: `activity_logs` entry

**Stage 2 — Lead Acknowledgement**
- Trigger: Manual (operator action) or automation rule
- Audience: Lead / prospective customer
- Channel: Email
- Automation Eligibility: Approval mode (operator reviews AI draft before send)
- Approval: Required by default; Owner may enable auto-send
- AI: May draft acknowledgement using company tone memory and lead details
- Cancellation: Lead archived or converted to customer before send
- Audit: `email_logs` entry; `activity_logs` record

**Stage 3 — Survey Appointment Invitation**
- Trigger: Operator books a survey appointment
- Audience: Customer
- Channel: Email
- Automation: Auto-send eligible (survey time is a confirmed fact)
- Approval: Auto-send enabled by Owner; otherwise Approval mode
- AI: Drafts confirmation copy; does not invent times or addresses
- Cancellation: Survey appointment cancelled or rescheduled before send
- Audit: `email_logs`

**Stage 4 — Survey Confirmation**
- Trigger: Survey appointment confirmed in system
- Audience: Customer
- Channel: Email
- Automation: Auto-send eligible
- Approval: Owner-configurable
- AI: Personalized confirmation with company tone; includes survey address, time, contact person
- Cancellation: Appointment cancelled before send
- Audit: `email_logs`

**Stage 5 — Survey Reminder**
- Trigger: Scheduled N hours/days before survey appointment (configurable, default: 24 hours prior)
- Audience: Customer
- Channel: Email
- Automation: Auto-send eligible
- Approval: Owner-configurable
- AI: Short, direct reminder copy
- Cancellation: Appointment cancelled; survey already completed; customer already replied to confirm
- Audit: `email_logs`

**Stage 6 — Quote Preparation (Internal)**
- Trigger: Quote is being built
- Audience: Internal only (AI coaching, not customer-facing)
- Channel: In-app AI Quote Coach (see UI_UX_SYSTEM.md §9.13)
- Automation: N/A (AI analysis, not outbound email)
- Approval: N/A
- AI: Quote Coach, Confidence Score, reasoning
- Cancellation: N/A
- Audit: `ai_logs`

**Stage 7 — Quote Sent**
- Trigger: Operator clicks "Send Quote" (requires `quotes.send` permission)
- Audience: Customer
- Channel: Email (quote PDF attached or quoted inline)
- Automation: Trigger fires on status change to `sent`; email sent immediately
- Approval: Sending is the human action itself — no separate approval layer
- AI: Optional AI-assisted subject line or cover message; human reviews before send
- Cancellation: Quote archived before send completes
- Audit: `email_logs`; domain event `quoting.quote.sent`

**Stage 8 — Quote Opened (Internal Notification)**
- Trigger: Customer opens the quote email (Resend webhook `email.opened`)
- Audience: Owner/Office user (internal notification only — customer is not emailed)
- Channel: In-app notification + dashboard surfacing
- Automation: Automatic internal notification
- Approval: N/A (internal signal only)
- AI: Follow-up timing recommendation surfaced (see §10)
- Cancellation: N/A
- Audit: `email_logs` open tracking; in-app notification record

**Stage 9 — Quote Follow-Up**
- Trigger: Operator action or automation rule (time-based, after quote sent)
- Audience: Customer
- Channel: Email
- Automation: Approval mode (default); Owner may enable Auto-send
- Approval: Operator review by default; see §9 automation modes
- AI: Drafts follow-up; recommends timing; references open history; reasons explained
- Cancellation: Quote accepted; quote rejected by customer; quote expired; customer already replied
- Audit: `email_logs`; automation run logged

**Stage 10 — Quote Reminder**
- Trigger: Quote approaching expiry with no response
- Audience: Customer
- Channel: Email
- Automation: Approval or Auto-send (Owner-configured)
- Approval: Owner-configurable
- AI: Drafts urgency-appropriate reminder; does not invent new pricing or promises
- Cancellation: Quote accepted; rejected; expired before send; customer replied
- Audit: `email_logs`

**Stage 11 — Quote Accepted (Confirmation to Customer)**
- Trigger: Quote accepted by customer (status → `accepted`)
- Audience: Customer
- Channel: Email (booking confirmation + service agreement attached)
- Automation: Auto-send eligible — booking confirmation is a factual, non-negotiable confirmation
- Approval: Owner may require Approval mode; Auto-send is the recommended default
- AI: Personalizes confirmation tone; all dates, addresses, and totals from structured data
- Cancellation: Job immediately cancelled before send (rare edge case)
- Audit: `email_logs`; domain event `quoting.quote.accepted`

**Stage 12 — Quote Rejected / Lost**
- Trigger: Operator marks quote as Lost, or customer explicitly declines
- Audience: Internal notification only (Stage 12a); optional gracious follow-up to customer (Stage 12b)
- Channel: Internal: in-app notification. Customer: Email (optional, manual)
- Automation: Internal notification is automatic; customer email is always manual
- Approval: Required for any outbound customer email on lost quotes
- AI: May suggest optional "we'd love to help in the future" draft
- Cancellation: N/A
- Audit: `activity_logs`; `email_logs` if customer email sent

**Stage 13 — Booking Confirmation**
- Trigger: Job created from accepted quote (automatically, or when operator creates job record)
- Audience: Customer
- Channel: Email (move details: date, time window, crew, addresses)
- Automation: Auto-send eligible — factual confirmation of confirmed job
- Approval: Owner-configurable (recommended: Auto-send)
- AI: Tone personalization; all facts from `jobs` record — crew, date, addresses, time window
- Cancellation: Job cancelled before send
- Audit: `email_logs`; domain event `operations.job.created`

**Stage 14 — Pre-Move Preparation**
- Trigger: Configurable N days before move date (default: 5 days)
- Audience: Customer
- Channel: Email
- Automation: Auto-send eligible
- Approval: Owner-configurable
- AI: Personalizes checklist based on job type (local vs. long-distance, packing service included, special items); does not invent logistics not in the job record
- Cancellation: Job cancelled before send; customer has already received this message
- Audit: `email_logs`

**Stage 15 — Move Reminder**
- Trigger: Scheduled 24–48 hours before move (configurable; default: 48 hours)
- Audience: Customer
- Channel: Email
- Automation: Auto-send eligible — factual time reminder
- Approval: Owner-configurable (recommended: Auto-send)
- AI: Short reminder; includes crew contact info if configured; does not invent logistics
- Cancellation: Job cancelled; job rescheduled (reminder rescheduled to new date)
- Audit: `email_logs`

**Stage 16 — Missing Information Request**
- Trigger: Manual (operator identifies missing data needed before move)
- Audience: Customer
- Channel: Email
- Automation: Draft-only (this is context-specific — automation would be inappropriate)
- Approval: Always required — operator reviews before send
- AI: May draft the request clearly and professionally
- Cancellation: Information received before send
- Audit: `email_logs`

**Stage 17 — Operational Change**
- Trigger: Manual (operator must communicate a change: crew change, vehicle change, time adjustment)
- Audience: Customer
- Channel: Email
- Automation: Never auto-send — all operational changes require human confirmation of the communication
- Approval: Always required
- AI: May draft the change notification professionally
- Cancellation: N/A
- Audit: `email_logs`

**Stage 18 — Delay Notification**
- Trigger: Manual (crew delayed; operator must inform customer)
- Audience: Customer
- Channel: Email
- Automation: Never auto-send — delay communications require human judgment
- Approval: Always required
- AI: May draft a professional, empathetic delay notification
- Cancellation: Delay resolved before send
- Audit: `email_logs`

**Stage 19 — Job Completion**
- Trigger: Job marked `completed`
- Audience: Customer
- Channel: Email (thank-you + what-happens-next)
- Automation: Auto-send eligible
- Approval: Owner-configurable (recommended: Auto-send)
- AI: Personalized completion note based on company tone; references the specific move
- Cancellation: Job was cancelled (not completed)
- Audit: `email_logs`; domain event `operations.job.completed`

**Stage 20 — Invoice Sent**
- Trigger: Invoice created and status set to `sent`
- Audience: Customer
- Channel: Email (invoice PDF attached)
- Automation: Auto-send eligible — factual financial document delivery
- Approval: Owner-configurable (recommended: Auto-send)
- AI: Professional cover message; all financials from `invoices` record — never AI-generated amounts
- Cancellation: Invoice voided or cancelled before send
- Audit: `email_logs`; domain event `payments.invoice.sent`

**Stage 21 — Payment Confirmation**
- Trigger: Payment recorded and invoice marked `paid`
- Audience: Customer
- Channel: Email (payment receipt)
- Automation: Auto-send eligible — factual financial confirmation
- Approval: Owner-configurable (recommended: Auto-send)
- AI: Short, clear confirmation; payment amount and date from `payments` record
- Cancellation: Payment reversed before send (very rare)
- Audit: `email_logs`; domain event `payments.payment.recorded`

**Stage 22 — Payment Reminder**
- Trigger: Invoice overdue by N days (configurable; default: 3 days past due date)
- Audience: Customer
- Channel: Email
- Automation: Approval mode (default); Owner may enable Auto-send with a specific payment reminder template
- Approval: Operator review recommended — financial demands require care
- AI: Professional, firm tone; correct balance from invoice record; does not invent late fees or legal threats unless those are real fields in the record
- Cancellation: Invoice paid before send; invoice voided
- Audit: `email_logs`; automation run logged

**Stage 23 — Overdue Invoice (Escalation)**
- Trigger: Invoice significantly overdue (configurable threshold; default: 14 days past due)
- Audience: Customer
- Channel: Email
- Automation: Draft-only recommended — escalated financial communication requires human judgment
- Approval: Always required
- AI: May draft escalation; does not invent legal threats or make commitments not sanctioned by the company
- Cancellation: Invoice paid; invoice voided; manual override
- Audit: `email_logs`

**Stage 24 — Thank-You Message**
- Trigger: Manual or X days after successful job completion (configurable; default: 2 days after completion)
- Audience: Customer
- Channel: Email
- Automation: Auto-send eligible (if Owner enables)
- Approval: Owner-configurable
- AI: Personalized thank-you based on company tone; references the specific move when appropriate
- Cancellation: Job was not completed successfully (damage reported, complaint raised); already sent
- Audit: `email_logs`

**Stage 25 — Review Request**
- Trigger: N days after successful completion (configurable; default: 3 days after completion)
- Audience: Customer
- Channel: Email
- Automation: Auto-send eligible (commonly automated for consistency)
- Approval: Owner-configurable
- AI: Friendly, non-pressuring copy; review platform link from company settings
- Cancellation: Customer complaint is open; job involved a damage claim; same customer already received a review request in last 90 days
- Audit: `email_logs`

**Stage 26 — Customer Reactivation**
- Trigger: Manual; AI may suggest (configurable reactivation timeframe — default: 11 months since last completed job)
- Audience: Customer
- Channel: Email
- Automation: Draft-only — reactivation outreach requires personal, non-templated touch
- Approval: Always required
- AI: Drafts personalized reactivation message; references previous moves if permitted; timing recommendation with reasoning
- Cancellation: Customer is already active (new quote or job within 90 days); customer is archived/opted out
- Audit: `email_logs`

**Stage 27 — Manual Communication**
- Trigger: Operator composes an email directly (no lifecycle trigger)
- Audience: Any customer, lead, or custom recipient
- Channel: Email
- Automation: N/A — manual by definition
- Approval: N/A (operator is the human approver)
- AI: Full drafting assistance available on request; AI does not pre-fill manual compose by default
- Cancellation: Operator discards draft
- Audit: `email_logs`; classified as `manual_compose` trigger type

---

## 4. Email Composer UX

### 4.1 Composer Access Points

The email composer is accessible from:
- Customer record → "Send Email" button
- Quote detail → "Send" → email compose flow
- Job detail → "Email Customer" button
- Lead record → "Follow Up" button
- Communication timeline → "Reply" or "New Message"
- Dashboard → "Attention Required" → quick compose on follow-up items
- Manual from navigation → Compose button (if `communications.send` permission)

### 4.2 Composer Fields

```
From:       [Sender identity selector — dropdown of verified identities]
            Displays: "Company Name <email@domain.com>"
To:         [Customer email — pre-filled when opened from entity context]
            [+ Add CC] [+ Add BCC]
CC:         [Optional; multiple recipients]
BCC:        [Optional; multiple recipients]
Reply-To:   [Auto-filled from sender identity default; editable]
Subject:    [Text input; AI may suggest]
───────────────────────────────────────────────────────────────
[Template selector dropdown — optional]
[Language selector — defaults to customer.preferred_language]
───────────────────────────────────────────────────────────────
[Message body — rich text editor]
  - Bold, italic, underline, lists, links
  - No markdown — rendered HTML email
  - AI draft button (see §5)
  - Character count (for tone check; no hard limit)
───────────────────────────────────────────────────────────────
[Attachments]
  - Upload file (PDF, image)
  - Attach quote (auto-generates quote PDF if not already generated)
  - Attach invoice (auto-generates invoice PDF)
  - Attach document from company storage
───────────────────────────────────────────────────────────────
[Internal note — only visible to office team; never sent to customer]
───────────────────────────────────────────────────────────────
[Send now]  [Schedule]  [Save draft]  [Discard]
```

**Financial information in the composer:**

If the email includes a quote attachment or references financial data:
- Users without `quotes.view_cost_price` do not see cost or margin data in the composer preview
- Compose flow never surfaces cost/margin fields in the UI for unauthorized users
- AI drafts for users without `quotes.view_cost_price` are generated without cost/margin language

### 4.3 Template Selection Flow

Selecting a template:
1. Dropdown opens searchable template selector
2. Templates filtered by context (if composing from a Quote, quote templates are shown first)
3. Template selected → body pre-filled with template content
4. Variables resolved against the current entity context (customer, quote, job, invoice)
5. Unresolved variables highlighted in amber — operator must fill them before send
6. [Preview] button shows the rendered email as the customer will see it

### 4.4 Scheduling

[Schedule] button opens a date/time picker:
- Default suggestion: AI may suggest an optimal time (see §10 for quote follow-ups; general default: next business day morning)
- Operator sets exact datetime
- Timezone: company's configured timezone
- Scheduled emails visible in a "Scheduled" queue accessible from the Communication section

### 4.5 Draft Behavior

- Drafts autosave every 30 seconds after first content is entered
- Drafts are persisted to the database (not localStorage) — survive browser close
- Draft list accessible from the Communications section
- Drafts never sent automatically — always require explicit send action
- Automation-created drafts (Draft mode) appear in the same draft queue with an "Automation Draft" label

### 4.6 Sending Flow and Confirmation

1. Operator clicks [Send now] or [Send scheduled]
2. Pre-send validation runs (§14)
3. If validation passes: confirmation notice "Email sent to [customer name] <email>" — no separate dialog for routine sends
4. If validation fails: specific errors shown inline — blocking send with a clear explanation of what needs to be fixed
5. If automation-triggered with Approval mode: confirmation dialog shows the specific email that will be sent, to whom, and at what time

---

## 5. AI Communication Assistant

### 5.1 AI Draft Capabilities

The AI communication assistant is available throughout the email composer. It is invoked explicitly — it does not pre-fill the compose window unless the operator requests it.

**Available actions (all invoked by operator):**

| Action | Description |
|--------|-------------|
| Draft | Generate a complete email based on the current context (customer, quote, job, template type) |
| Rewrite | Rewrite the current message body in the same tone but different phrasing |
| Shorten | Reduce the message length while preserving key content |
| Make more professional | Shift register toward formal business communication |
| Make warmer | Shift tone toward approachable and human |
| Simplify | Remove jargon, reduce complexity, make easier to read |
| Translate | Translate the current message to a selected language |
| Summarize thread | Produce a brief summary of the communication history with this customer |
| Suggest reply | Draft a reply based on the context of the last received message (V1.5+) |

### 5.2 AI Safety Rules for Drafted Communication

**The AI may:**
- Draft prose, tone, structure, and phrasing
- Personalize salutations and closings using the company's tone memory
- Reference facts from the structured Bivro record (customer name, quote number, move date, address, total from `quotes.grand_total_cents`)
- Suggest timing for follow-ups with reasoning

**The AI must not:**
- Invent prices, discounts, or financial commitments not in the structured data
- Invent dates not recorded in the job or quote record
- Invent logistics or crew details not confirmed in the system
- Make legal claims or commitments (warranty, insurance, liability)
- Reference other customers' communication patterns in a way that reveals data from other tenants
- Auto-apply discounts, waive fees, or make business promises on the company's behalf

**All AI-generated business facts must be resolved from structured Bivro data.** If a fact is not in the database, the AI does not invent it. The AI may use placeholder instructions: "[Add the agreed price here]" or "[Insert your cancellation policy here]" for facts that cannot be resolved automatically.

### 5.3 AI Influence Indicator

Every email that was AI-drafted or AI-modified displays an indicator in the internal communication history:
- "AI-assisted draft" — operator used AI draft and sent it (with or without edits)
- "AI-generated, operator-edited" — operator modified the AI draft before sending
- "Manually composed" — no AI assistance used
- "Automation-sent" — sent by automation without human review

This indicator is visible only in the internal communication timeline — not in the email sent to the customer.

### 5.4 AI Conversation Intelligence (V1 capabilities)

**Intent classification:** When an inbound reply is linked to a communication thread (V1.5+), the AI classifies the customer's intent: accepted, rejected, questioning, requesting info, expressing concern, neutral. This surfaces as a badge on the communication timeline.

**Urgency detection:** Identifies messages that contain time-sensitive language ("urgent", "can you come tomorrow", "I need to cancel") and surfaces an alert to the operator.

**Missing information detection:** During quote creation or job preparation, the AI identifies information gaps that may require customer contact: "No elevator status confirmed for destination address — consider requesting before the move."

**Follow-up timing recommendation:** See §10 for the full specification.

**Frustration detection:** If the customer's communication contains language suggesting frustration (tone analysis), a soft alert appears in the internal timeline: "This customer's last message may indicate frustration. Consider a personal call." This is a suggestion only.

---

## 6. AI Tone Memory

### 6.1 Purpose

Each company develops its own communication identity over time. Bivro's AI learns the company's communication style from actual sent messages and operator behavior — not from a generic template.

**Core message:** "Bivro learns how your company communicates."

### 6.2 What the AI Learns

All learning is tenant-isolated. The following patterns are observed and learned per company:

**Company-level tone patterns:**
- Preferred salutation style ("Hi [first name]" vs. "Dear Mr./Ms. [last name]")
- Preferred sign-off ("Best regards" vs. "Looking forward to helping you" vs. "Kind regards")
- Average message length (short and direct vs. comprehensive)
- Formal vs. informal register
- Use of numbered lists vs. prose paragraphs
- Emoji usage (yes/no; which contexts)
- Subject line style (brief vs. descriptive)

**Context-specific patterns:**
- Quote follow-up style (assertive vs. gentle)
- Payment reminder tone (firm vs. apologetic)
- Thank-you message style (brief vs. elaborate)
- Preferred language per customer (learned from individual history)

**Operator behavior patterns:**
- How operators modify AI drafts (consistently shortening → AI drafts shorter; consistently softening → AI drafts warmer)
- Which AI suggestions are accepted vs. rewritten
- Specific phrases the company uses repeatedly

### 6.3 Tone Memory Architecture

Tone memory is stored in `ai_communication_memory` (see §18). It is structured as:
- **Company-level memory:** General tone preferences applying to all customer communication
- **Customer-level overrides:** Customer-specific language preference, preferred salutation, communication notes

### 6.4 Transparency and Control

AI tone memory is visible and manageable from Settings → Bivro Intelligence → Communication Patterns:

**Viewing learned patterns:**
- "How Bivro currently drafts your emails" — a human-readable summary of learned patterns
- Examples: "Usually starts with 'Hi [first name]'" | "Quote follow-ups are typically 2–3 sentences" | "Sign-offs: 'Kind regards'"

**Correcting learned patterns:**
- Operator can edit individual learned patterns
- Operator can mark a draft as "I wouldn't normally write this — don't learn from it"

**Resetting communication memory:**
- [Reset communication patterns] — clears all learned company tone; AI reverts to neutral defaults
- Confirmation required; scope explained; historical sent emails are not affected

**Proposed learning:**
When the AI observes a pattern across multiple interactions, it proposes it as a learned pattern:
- "I noticed your emails consistently begin with 'Hi [first name]' — should I use this as your default greeting?"
- [Yes, use this] [No, keep suggesting varied greetings]
- Human must confirm or reject — AI does not self-adopt patterns silently

### 6.5 Customer-Specific Communication Preferences

Stored in `communication_preferences` (see §18) per customer:
- Preferred language
- Preferred salutation
- Opt-out status and scope (all, marketing only, automated only — defined in §18)
- Communication notes (freetext, visible to office team)

---

## 7. Multilingual Communication

### 7.1 V1 Language Support

Bivro V1 is designed for international markets with multilingual communication. The initial priority languages for European markets are:

| Language | Code | Notes |
|----------|------|-------|
| English | `en` | Default fallback |
| German | `de` | Primary European market |
| French | `fr` | |
| Italian | `it` | |

The architecture is extensible to additional languages. Adding a new language requires: (a) translating the default template set, (b) adding the language code to the supported languages configuration, and (c) ensuring AI model capabilities for that language (Claude supports all four V1 languages and is broadly multilingual).

### 7.2 Language Determination Hierarchy

When composing or sending an email, the language is determined by this priority order:

1. **Explicitly selected** by the operator in the compose window (highest priority)
2. **Customer preferred language** from `communication_preferences.preferred_language` (if set)
3. **Customer detected language** — AI may suggest based on previous email content (human confirms)
4. **Company default language** from `company_settings.default_language`
5. **English** — final fallback

**Rule: Never silently change an established customer language preference.** If a customer has been communicating in German and the operator selects French, the system does not prevent it but surfaces a notice: "This customer's communications have been in German. Sending in French — confirm?" This is a one-time informational prompt, not a blocker.

### 7.3 Template Language Variants

Each email template supports multiple language variants. A template is identified by a slug (e.g., `quote-sent`) and a language code (e.g., `quote-sent/de`). Companies can create, edit, and translate their own template variants.

**Fallback behavior:** If no template variant exists for the customer's language, the system falls back to the company default language template. If that also doesn't exist, the system falls back to English. Fallback is logged in the send record so operators can identify missing translations.

### 7.4 AI Translation

The AI communication assistant includes a [Translate] action that translates the current message body into a selected language. AI translation:
- Preserves the message's structure and tone as closely as possible
- Does not translate `{{variable}}` tokens — these remain as-is for resolution
- Flags for human review before send
- Is logged as "AI-translated" in the send record

**Rule: The AI never silently translates outgoing messages.** Translation is always an explicit operator action.

### 7.5 Variable Translation

Template variables (e.g., `{{job.date}}`) resolve to locale-appropriate formats:
- Date format: locale-aware (e.g., `15. März 2026` for `de`, `15 March 2026` for `en`)
- Currency: company-configured currency; international number formatting based on language
- The formatting logic is resolved at send time based on the email's language

---

## 8. Template System

### 8.1 Template Philosophy

Templates are company-owned assets. Bivro provides a versioned set of default templates at company creation (matching the lifecycle stages in §3). Companies own their templates from the point of creation — they can modify, deactivate, duplicate, or extend them without restriction.

Changing a template never changes any previously sent email. Every sent email is an immutable snapshot of the message that was sent. (See §14.2 and §16.)

### 8.2 Template Lifecycle

**What companies can do with templates:**
- **Activate** a Bivro default template (if deactivated at onboarding)
- **Deactivate** a template (removes it from the template selector but preserves history)
- **Duplicate** a template (creates a company-owned copy; changes to the duplicate do not affect the original)
- **Edit** the subject line, message body, and variable usage
- **Create custom templates** (no limit on custom templates)
- **Archive** a template that is no longer needed (cannot be selected but is preserved for historical reference)
- **Reorder** templates in the template selector (sort_order field)
- **Manage language variants** (see §7.3)

**What companies cannot do:**
- Delete a template that was used in a sent email (the template record must be preserved for audit)
- Permanently delete Bivro-seeded default templates (can only deactivate or archive)

### 8.3 Template Variables

Variables are written as `{{entity.field}}` in the template editor. They are resolved to real values at send time from Bivro's structured data.

**Canonical variable reference:**

| Variable | Source | Required? | Notes |
|----------|--------|-----------|-------|
| `{{customer.first_name}}` | `customers.first_name` | — | Fallback: full name |
| `{{customer.full_name}}` | `customers.first_name` + `customers.last_name` | — | |
| `{{customer.email}}` | `customers.email` | — | |
| `{{customer.phone}}` | `customers.phone` | — | |
| `{{company.name}}` | `companies.name` | — | |
| `{{company.phone}}` | `companies.phone` | — | |
| `{{company.email}}` | `companies.email` | — | |
| `{{company.address}}` | `companies.address_*` fields | — | Formatted single string |
| `{{contact.name}}` | Assigned office user or owner | — | The person responsible for this customer/job |
| `{{contact.phone}}` | `profiles.phone` | — | |
| `{{quote.number}}` | `quotes.quote_number` | Quotes only | |
| `{{quote.total}}` | `quotes.grand_total_cents` formatted | Quotes only | Permission: visible to all quote recipients |
| `{{quote.valid_until}}` | `quotes.expires_at` | Quotes only | |
| `{{quote.pdf_link}}` | Generated signed URL | Quotes only | |
| `{{job.number}}` | `jobs.job_number` | Jobs only | |
| `{{job.date}}` | `jobs.scheduled_date` | Jobs only | |
| `{{job.time_window}}` | `jobs.time_window_start` + `jobs.time_window_end` | Jobs only | |
| `{{job.origin_address}}` | Formatted from `jobs.origin_*` | Jobs only | |
| `{{job.destination_address}}` | Formatted from `jobs.destination_*` | Jobs only | |
| `{{job.crew_lead.name}}` | Lead crew member name | Jobs only | If assigned |
| `{{invoice.number}}` | `invoices.invoice_number` | Invoices only | |
| `{{invoice.total}}` | `invoices.total_cents` formatted | Invoices only | |
| `{{invoice.due_date}}` | `invoices.due_date` | Invoices only | |
| `{{invoice.pdf_link}}` | Generated signed URL | Invoices only | |
| `{{payment.amount}}` | `payments.amount_cents` formatted | Payments only | |
| `{{payment.date}}` | `payments.paid_at` | Payments only | |
| `{{payment.method}}` | `payments.method` | Payments only | |
| `{{survey.date}}` | Survey appointment date | Survey stage | |
| `{{survey.time}}` | Survey appointment time | Survey stage | |
| `{{review.link}}` | Company-configured review platform URL | Review stage | |
| `{{unsubscribe.link}}` | Auto-generated per-recipient | Marketing-class only | |

**Financial variable permissions:**
- `{{quote.total}}` — always included in customer-facing emails (this is the sell price, the customer's number)
- Internal cost/margin variables (`{{quote.cost}}`, `{{quote.margin}}`) — do not exist in the template system; cost/margin data is never included in customer-facing emails

### 8.4 Variable Validation

Before any email is sent (manually or via automation), all template variables are validated:

**Validation rules:**
1. All `{{variable}}` tokens in the email body and subject must resolve to a non-empty value
2. Required variables for the email context must be present in the entity record
3. If a variable cannot be resolved: send is blocked with a specific error identifying the missing field
4. "Hello {{customer.first_name}}" can never reach the customer — the system catches this and blocks the send

**Variable resolution at send time, not template save time.** Templates may contain variables for future entities. Resolution happens only when the email is actually composed and sent.

### 8.5 Template Editor UX

**Located in:** Settings → Templates (requires `settings.templates` permission)

**Editor features:**
- Rich text WYSIWYG editor (not code-based — accessible to non-technical operators)
- Variable insertion: "{{" triggers a dropdown of available variables with descriptions
- Language variant tabs: [English] [Deutsch] [Français] [Italiano] (+ Add Language)
- [Preview] button: renders the template with sample data substituted for variables
- [Test Send] button: sends a preview version to the operator's email address using sample data
- Subject line editor with variable support
- Auto-save on each change (version history maintained)

**Template versioning:**
- Every save creates a new version record
- Version history is accessible: "Version 3 · Saved by Emma C. · 3 Jun 2026, 14:22"
- Previous versions can be viewed but not automatically restored (operator copies content manually — deliberate friction to prevent accidental rollback)
- The version that was used for a specific sent email is recorded in `email_logs.template_version`

---

## 9. Automation Engine

### 9.1 Automation Modes

Every automation rule operates in exactly one of three modes:

**Mode 1 — Draft Only**
The automation creates a draft email at the scheduled trigger time. The draft appears in the operator's draft queue with an "Automation Draft" label. The operator reviews, edits if needed, and manually sends.
- Use for: Situations where tone, timing, or content benefit from human judgment
- Cannot be bypassed by `ai.auto_emails` permission

**Mode 2 — Approval Required**
The automation prepares the email and queues it for approval. An authorized user (Owner or user with `communications.approve` permission) must explicitly approve the email before it is sent.
- Approval action: "This email is ready to send to [Customer Name]. Review: [preview]. [Approve & Send] [Edit] [Cancel]"
- Approval timeout: configurable (default: 48 hours); if not approved, automation run is logged as `expired`
- Use for: Financial communications (payment reminders), sensitive operational changes

**Mode 3 — Auto-Send**
The email is sent automatically when the trigger conditions are met and all pre-send validations pass. No human review before send.
- Requires: Owner explicit enablement per automation rule
- Requires: `ai.auto_emails` effective permission if the email is AI-drafted (PRODUCT_REQUIREMENTS.md §3.3)
- Must still pass all pre-send safety validations (§14)
- Use for: Factual confirmations (booking, invoice), low-risk lifecycle reminders (move reminder)

### 9.2 Automation Rule Structure

Each automation rule defines:

```
Automation Rule
─────────────────────────────────────────────────────────────────
name                   Human-readable rule name
trigger_event          Domain event that activates evaluation (e.g., 'quoting.quote.sent')
trigger_delay          Time after trigger before send (e.g., 0 = immediate, 3d = 3 days)
conditions             Array of conditions that must all be true at send time
template_id            The email template to use
template_language      Language (or: 'customer_preference' = auto-resolve per customer)
sender_identity_id     Which sender identity to use
mode                   'draft' | 'approval' | 'auto_send'
cancellation_events    Domain events that cancel this pending send (e.g., 'quoting.quote.accepted')
max_retries            Number of send retries on failure (default: 3)
retry_delay_minutes    Delay between retries (default: 5)
is_active              bool
created_by             User who created this rule
─────────────────────────────────────────────────────────────────
```

### 9.3 Condition Types

Automation conditions are evaluated at the moment the email is about to be sent (not at trigger time). This prevents stale sends.

| Condition type | Example | Purpose |
|---------------|---------|---------|
| Entity status check | `quote.status == 'sent'` | Cancel if already accepted/expired |
| Time since event | `days_since(quote.sent_at) >= 3` | Time-based delay |
| Email tracking | `quote.email_opens == 0` | Send different follow-up if unopened vs. opened |
| Customer preference | `customer.opt_out_automated != true` | Respect opt-out |
| Not already sent | `no_sent_email(template_id, entity_id, last_7_days)` | Deduplication |
| Invoice status | `invoice.status == 'overdue'` | Cancel if paid |
| Business day only | `is_business_day()` | Don't send payment reminders on weekends |

### 9.4 Cancellation Events

Every automation that creates a pending send must register cancellation events — domain events that should stop the send if they fire before the send time:

| Automation | Cancellation events |
|-----------|-------------------|
| Quote follow-up | `quoting.quote.accepted`, `quoting.quote.rejected`, `quoting.quote.expired` |
| Quote reminder | Same as above |
| Move reminder | `operations.job.cancelled`, `operations.job.rescheduled` |
| Payment reminder | `payments.invoice.paid`, `payments.invoice.voided` |
| Review request | `operations.complaint.raised`, `operations.damage.reported` |

### 9.5 V1 Built-In Automation Templates

The following automations are available in V1. Each is seeded as an inactive rule at company creation — the Owner must explicitly activate and configure them.

| # | Automation | Default trigger | Default delay | Default mode |
|---|-----------|----------------|--------------|-------------|
| 1 | Quote follow-up (unopened) | `quoting.quote.sent` + opened_count=0 | 3 days | Approval |
| 2 | Quote follow-up (opened, not responded) | `quoting.quote.sent` + opened_count>0 | 2 days | Approval |
| 3 | Quote expiry reminder | `quoting.quote.sent` + N days before expiry | 3 days before | Approval |
| 4 | Booking confirmation | `quoting.quote.accepted` | Immediate | Auto-send |
| 5 | Pre-move preparation | `operations.job.created` | 5 days before job | Auto-send |
| 6 | Move reminder | `operations.job.created` | 48 hours before job | Auto-send |
| 7 | Job completion thank-you | `operations.job.completed` | 2 days | Auto-send |
| 8 | Review request | `operations.job.completed` (no complaint) | 3 days | Auto-send |
| 9 | Invoice sent notification | `payments.invoice.sent` | Immediate | Auto-send |
| 10 | Payment reminder (first) | `payments.invoice.due_date_passed` | 3 days | Approval |
| 11 | Payment reminder (escalation) | `payments.invoice.due_date_passed` | 14 days | Draft only |
| 12 | Customer reactivation | Time-based, since last job | 11 months | Draft only |

### 9.6 Automation Management UX

**Location:** Settings → Automations (requires Owner or `communications.manage_automations` permission)

- List of all automation rules with status (active/inactive), mode badge, last triggered time
- Toggle to activate/deactivate per rule
- [Edit] opens rule configuration drawer
- [View History] shows the last 30 run logs for that automation
- [Test] simulates the automation against a sample record (draft mode only — does not send)
- Changes to automations are logged in `activity_logs`

---

## 10. Quote Follow-Up Intelligence

### 10.1 Why This Is a Flagship Feature

Quote follow-up timing is one of the highest-leverage communication decisions a moving company makes. Following up too soon feels pushy; too late means the customer booked a competitor.

Bivro Intelligence uses the company's own historical data to recommend the right follow-up moment — and shows its reasoning. This is not a generic rule ("follow up after 3 days"). It is company-specific intelligence: "Your quotes convert 42% more often when followed up on day 2 compared to day 5."

### 10.2 What AI Analyzes for Follow-Up

**Quote-level signals:**
- Quote sent timestamp
- Number of email opens
- Time of first open
- Time of most recent open
- Whether the customer clicked any links in the email
- Time since last open
- Quote value (higher-value quotes may warrant different timing)

**Customer history signals:**
- Previous quote-to-booking conversion with this specific customer
- This customer's typical response time on prior quotes
- Communication history: has this customer been responsive to follow-ups?

**Company history signals (tenant-isolated):**
- Average conversion rate by follow-up timing (day 1, 2, 3, 5, 7, 14)
- Conversion rate for unopened vs. opened quotes at each timing interval
- Seasonal patterns (end of month, summer peak)
- Quote value segment conversion patterns

**Permission-gated signals:**
- Quote margin analysis in the AI reasoning (only available to users with `quotes.view_cost_price`)
- If a quote has a very low margin, the AI may note this in its reasoning (visible only to authorized users)

### 10.3 AI Recommendation Output

Displayed in the quote detail page and in the Dashboard "Quote Follow-ups" section:

```
┌────────────────────────────────────────────────────────┐
│ ✦ Bivro Intelligence          Follow-Up Recommendation │
├────────────────────────────────────────────────────────┤
│ Follow up today.                                       │
│                                                        │
│ This customer opened the quote 4 times since Tuesday.  │
│ That's a strong signal of interest.                    │
│                                                        │
│ Your company converts 63% of quotes followed up within │
│ 48 hours of the 3rd open, compared to 31% at 5+ days. │
│                                                        │
│ Confidence: High                                       │
│ [Compose Follow-Up] [Why?] [Remind Me Tomorrow]        │
└────────────────────────────────────────────────────────┘
```

**[Why?] expands:**
- Primary signal: "4 opens — strong engagement"
- Company history: "42 follow-up pairs analyzed from your company"
- Customer history: "This customer responded to your last follow-up within 4 hours"
- Assumptions: "Standard quote value bracket; no recent communication from customer"
- Confidence explanation: "High — strong open signal + supporting company history"

### 10.4 Recommendation Types

| Recommendation | When surfaced | Confidence threshold |
|----------------|--------------|---------------------|
| "Follow up today" | Multiple opens, strong engagement signals | High |
| "Consider following up tomorrow" | Single open or recent send, moderate signals | Moderate |
| "Wait — let this breathe" | Sent recently; no opens yet | Moderate |
| "This quote has gone cold" | No opens, significant time since send | High |
| "This customer usually takes their time" | Customer history shows slow conversion pattern | Moderate |

**Confidence display:** Follows the same confidence display rules as UI_UX_SYSTEM.md §9.5. Never raw numbers. Qualitative labels with reasoning.

### 10.5 Human Decision is Always Final

The follow-up intelligence is always advisory. The operator can:
- Accept the recommendation → [Compose Follow-Up] opens pre-drafted follow-up
- Dismiss the recommendation → logged, not shown again for this quote until new signals arrive
- Ignore without action → system re-evaluates as new signals come in

The AI does not send follow-up emails autonomously without an automation rule with `auto_send` mode explicitly configured by the Owner.

---

## 11. Inbound Email Architecture

### 11.1 V1 Scope

**V1 does not include inbound email synchronization.** Bivro V1 is outbound-only. Operators manage customer responses in their existing email client.

What V1 does provide:
- Customers' replies go to the sender identity's reply-to address (which is the company's actual email)
- The communication timeline shows outbound messages; inbound replies must be manually noted by the operator using the "Internal Note" field
- Resend webhooks capture open, click, bounce, and complaint events on outbound messages

### 11.2 V1.5 — Manual Thread Linking

**V1.5** adds manual reply linkage:
- Operator can paste or forward a customer's reply into Bivro's communication interface
- AI summarizes the reply and classifies the customer's intent
- The reply is stored as a linked inbound message on the customer's communication timeline
- Inbound messages are manually associated with the relevant entity (quote, job, invoice)

### 11.3 V2+ — Full Inbound Email Synchronization

**V2+ architecture** (not built in V1, architecture preserved for upgrade):

The system should be architecturally prepared to:
- **Associate inbound messages** with customers, leads, quotes, jobs, and invoices automatically based on sender email, reply-to-message-id threading, and subject line parsing
- **Unified communication inbox** — operator sees all customer communication in Bivro, not in a separate email client
- **Thread summarization** — AI summarizes email threads for quick context
- **Intent and urgency detection** — automatic classification of inbound messages
- **Smart reply suggestions** — AI drafts a reply based on thread context
- **Omnichannel** — future integration of WhatsApp, SMS alongside email (architected as channel-agnostic `communication_messages` not `email_messages`)

**V2+ architectural preparation in V1:**
- `email_logs` table has `thread_id` and `in_reply_to_message_id` fields reserved for threading
- Customer records store `email` as the primary communication identifier
- Domain event system is channel-agnostic (`email.received`, not hardcoded — see ARCHITECTURE.md §10)

---

## 12. Customer Communication Timeline

### 12.1 Purpose

Every customer record in Bivro has a chronological communication timeline — a complete, readable history of every interaction. This is the single source of truth for "what has been communicated with this customer."

### 12.2 Timeline Event Types

| Event | Display | Level of detail |
|-------|---------|----------------|
| Email sent | "Quote Q-2041 sent" + preview subject + recipient | Standard |
| Email delivered | "Delivered" timestamp | Compact (below the send event) |
| Email opened | "Opened [N] times · First opened [time]" | Compact |
| Email clicked | "Link clicked · [time]" | Compact |
| Email bounced | "Bounced — [bounce type]" + alert badge | Prominent |
| Email failed | "Failed — [error code]" + alert badge | Prominent |
| Email complained | "Marked as spam" + warning | Prominent |
| Quote sent | Quote card with number, total, status | Standard |
| Quote viewed (via Bivro tracking) | "Quote viewed by customer" | Compact |
| Quote accepted | "Customer accepted quote" | Standard |
| Invoice sent | Invoice card with number, total | Standard |
| Payment received | "Payment received — [amount]" | Standard |
| Internal note | Note content (internal-only marker) | Standard |
| Automation sent | "Automated: [template name]" + AI Assisted badge | Standard |
| AI recommendation | Follow-up recommendation surfaced (dismissed or acted on) | Compact |

### 12.3 Visual Hierarchy Rules

**Default view:** Shows significant events only — sent emails, quotes, payments, internal notes. Low-value technical events (delivery status, open tracking) are collapsed under the primary event as a compact sub-row.

**Expand to full detail:** "[+] 3 tracking events" expands to show delivery, opens, clicks.

**Priority events** (always prominent, never collapsed):
- Bounces
- Complaints (marked as spam)
- Failed sends

**Permission-aware timeline:**
- Financial events (invoice amounts, payment amounts) visible only to users with `invoices.view` and `payments.view`
- AI recommendations and follow-up intelligence visible only to users with `ai.view_suggestions`
- Internal notes visible to all office users (they are not customer-visible)

### 12.4 Timeline and the Communication Module

The communication timeline is accessed from:
- Customer record → Timeline tab
- Quote detail → Activity feed
- Job detail → Activity feed
- Invoice detail → Activity feed

Each entity's timeline shows only events relevant to that entity. The customer-level timeline shows all events across all entities for that customer.

---

## 13. Delivery Architecture

### 13.1 Email Provider

**V1 provider:** Resend (already defined in ARCHITECTURE.md §2 — no change to architecture decision)
**React Email** for template rendering (HTML generation from component-based email templates)

Resend provides:
- REST API for sending
- Webhook delivery for tracking events (delivered, opened, clicked, bounced, complained)
- Domain and DNS management for custom sending domains
- Per-message `resend_id` for idempotency and tracking reference

### 13.2 Sender Identity Architecture

Every email has a sender identity — a `From` name and `From` address that the customer sees.

**Two tiers of sender identity:**

**Tier 1 — Bivro-Managed (default, no setup required)**
- Format: `[Company Name] <hello@[slug].bivro.io>`
- Bivro manages the `bivro.io` domain and its SPF/DKIM/DMARC records
- No configuration needed from the company
- Available immediately on account creation
- The company cannot send from a Bivro-managed domain unless Bivro has verified ownership — this is enforced at the infrastructure level, not only at the application level

**Tier 2 — Company-Verified Domain (optional)**
- Format: `[Company Name] <[company-configured]@[company-domain.com]>`
- Requires DNS configuration: SPF record update, DKIM TXT record addition
- Bivro guides the company through DNS setup in Settings → Email → Sending Domain
- Verification check: Bivro polls DNS to confirm records are propagated before activating
- Only activated sender identities appear in the From selector

**Reply-To:**
- Default: company's primary email address (`companies.email`)
- Configurable per sender identity
- Must be a real monitored address — this is where customer replies arrive

### 13.3 Email Authentication (SPF, DKIM, DMARC)

**Bivro-managed domains:**
- SPF: `bivro.io` SPF record includes Resend's sending servers
- DKIM: Resend signs with Bivro's DKIM key
- DMARC: `bivro.io` has a DMARC policy of `p=quarantine` at minimum

**Company-verified domains:**
The company must add:
1. SPF record update: include Resend's IP ranges in the company's SPF record
2. DKIM: add Resend-provided TXT record to the company's domain DNS
3. DMARC (recommended, not enforced by Bivro): company configures their own DMARC policy

Bivro provides copy-paste DNS record values in the Settings → Email → Sending Domain setup UI.

### 13.4 Bounce and Complaint Handling

**Bounce handling:**
- Hard bounce: email address is permanently invalid → `communication_preferences.email_deliverability = 'hard_bounce'` set; future sends to this address are blocked with a specific warning
- Soft bounce: temporary delivery failure → retry with backoff (Resend handles retry logic); after 3 soft bounces in 30 days, treat as deliverability risk and surface warning to operator

**Complaint handling (spam reports):**
- Customer marked the email as spam → `communication_preferences.email_deliverability = 'complained'` set
- All future automated emails to this customer are blocked
- Manual sends to this customer require explicit override confirmation from the operator
- Both operator and Owner are notified via in-app alert

### 13.5 Unsubscribe Handling

**Transactional email:** Invoices, payment receipts, booking confirmations, and job-specific operational communication are transactional. They do not require an unsubscribe link under most jurisdictions. However, all emails include company contact details.

**Marketing/promotional email** (review requests, reactivation outreach, some follow-ups): These include an unsubscribe link. Clicking the link:
1. Sets `communication_preferences.opted_out_marketing = true`
2. All automation rules of type `marketing` are suppressed for this customer
3. Operator is notified
4. Audit log entry created

**Unsubscribe scope options (configurable per automation):**
- `marketing` — only blocks marketing-class automations
- `automated_all` — blocks all automated emails; manual sends still permitted
- `all` — blocks all outbound emails; requires explicit override to send anything

### 13.6 Webhook Processing

Resend webhooks POST to `/api/webhooks/email-tracking` (Next.js API route, as defined in ARCHITECTURE.md §10).

**Webhook events processed:**
- `email.delivered` → updates `email_logs.delivered_at`, status → `delivered`
- `email.opened` → updates `email_logs.first_opened_at` (if null), increments `email_logs.open_count`, status → `opened`
- `email.clicked` → updates `email_logs.first_clicked_at` (if null), status → `clicked`
- `email.bounced` → updates `email_logs.bounced_at`, `bounce_type`, `bounce_reason`, status → `bounced`; triggers deliverability flag update
- `email.complained` → updates `email_logs.complained_at`, status → `complained`; triggers complaint handling flow

**Webhook security:** Resend includes an HMAC-SHA256 signature in the `Svix-Signature` header. The handler validates this signature before processing any event. Invalid signatures are rejected with 401.

**Idempotency:** Each Resend message has a unique `resend_id`. The webhook handler is idempotent — processing the same event twice does not corrupt the tracking record (uses `UPDATE WHERE status != new_status OR field IS NULL`).

### 13.7 Retry Architecture

**Delivery retries:** Resend handles SMTP-level retries for soft bounces. Bivro does not implement its own delivery retry loop.

**Application-level retry (failed webhook handler):** If the webhook handler throws an error (e.g., database unavailable), the handler returns HTTP 500. Resend re-delivers webhooks with exponential backoff. Handlers must be idempotent.

**Send failure retry (API call to Resend fails):**
- Retry: 3 attempts with 5-minute intervals
- After 3 failures: `email_logs` row status → `failed`; in-app alert to operator; Sentry error reported

**Idempotency key:** Every `email_logs` row has an `idempotency_key` (UUID v7) passed to Resend. If the same key is sent twice within Resend's deduplication window, Resend deduplicates the send.

---

## 14. Email Safety and Pre-Send Validation

### 14.1 The Safety Contract

Bivro guarantees that no outbound email to a customer will:
- Contain an unresolved template variable token like `{{customer.first_name}}`
- Reference financial data that the sending operator is not authorized to view
- Be sent to an archived customer without explicit override
- Duplicate a send that already went out recently for the same entity
- Contain facts invented by AI (prices, dates, commitments) that are not in the database
- Cross tenant boundaries (Company A never sends to Company B's customers)

### 14.2 Pre-Send Validation Checklist

Every email — manual or automated — passes through this validation before dispatch:

**1. Recipient validity**
- To address is a valid email format (RFC 5322)
- Customer is not archived/deleted (unless explicit override with reason confirmed by operator)
- Customer is not blocked due to hard bounce or spam complaint (unless explicit override by Owner)

**2. Opt-out check**
- Customer's opt-out status for this communication class is checked
- If opted out of the relevant class: send blocked, operator notified

**3. Variable resolution**
- Every `{{variable}}` token in the subject and body must resolve to a non-empty value
- If any token fails to resolve: send blocked with specific field identified: "Customer first name is missing. Complete the customer record before sending."
- No template variable token may appear in the rendered output

**4. Permission check**
- The sending operator has `communications.send` (or `communications.schedule` for scheduled)
- If the email includes financial references: operator has the required financial view permissions

**5. Entity state check (automation only)**
- Quote is still in `sent` status → not accepted, not expired, not archived
- Invoice is still in unpaid status → not paid, not voided
- Job is still scheduled or active → not cancelled, not already completed before reminder fires
- Customer has not already replied (V1.5+)

**6. Duplicate send prevention**
- Check: has the same automation rule already sent to this recipient for the same entity within the deduplication window (configurable per rule; default: 7 days)?
- If duplicate detected: automation run logged as `skipped_duplicate`; no send

**7. Cross-tenant integrity**
- Recipient email address must belong to a customer record in the sending company
- The referenced entity (quote, job, invoice) must belong to the sending company
- This validation is enforced at the application layer; RLS enforces it at the database layer

**8. Scheduled send validity (for future-scheduled emails)**
- Scheduled send time is in the future
- Scheduled send time is within business-reasonable bounds (no emails scheduled years in advance without explicit confirmation)

**9. Idempotency key**
- A unique UUID v7 idempotency key is assigned to each send attempt
- Key is stored in `email_logs.idempotency_key` and passed to Resend
- If a retry occurs with the same key, Resend deduplicates

**10. Sender identity verification**
- The selected sender identity's domain is verified and active

### 14.3 AI Content Safety

For AI-drafted emails specifically:

**AI facts must come from structured data:**
- Customer name: from `customers` record
- Quote number: from `quotes.quote_number`
- Financial amounts: from `quotes.grand_total_cents` or `invoices.total_cents` — formatted, not generated
- Move date: from `jobs.scheduled_date`
- Addresses: from `jobs.origin_*` / `jobs.destination_*`

**AI must not invent:**
- Prices or discounts not in the record
- Dates not recorded
- Legal claims, warranties, or commitments
- Crew names unless they appear in the job assignment
- Promised delivery windows beyond what is recorded

**Implementation:** The AI prompt for email drafting includes the structured entity data as authoritative facts. The prompt explicitly instructs the model to use only provided data and to use placeholder brackets `[...]` for facts it cannot find rather than inventing them.

**Human review gate:** Any AI-drafted email that is queued for Auto-send undergoes template variable resolution (which resolves all structured data references). Variables that cannot be resolved block the auto-send, and the automation run falls back to Approval mode.

---

## 15. Permissions

### 15.1 Extending the Permission Architecture

The canonical permission catalogue is defined in PRODUCT_REQUIREMENTS.md §3.3. The following communication permissions extend that catalogue and must be added to it.

Note: `settings.templates` and `ai.auto_emails` already exist in the PRODUCT_REQUIREMENTS.md catalogue and continue to serve their defined function.

**New permissions required (to be added to PRODUCT_REQUIREMENTS.md §3.3):**

**Communications (new resource group):**
- `communications.view` — View the outbound communication history and timeline for customers, quotes, jobs, and invoices
- `communications.send` — Send emails manually from the composer
- `communications.schedule` — Schedule future email sends
- `communications.draft` — Create email drafts; cannot send directly (used for junior operators who draft for review)
- `communications.manage_automations` — Create, edit, activate, and deactivate automation rules (distinct from `ai.auto_emails` which controls auto-send mode; this controls rule configuration)

**Already in catalogue (no change):**
- `settings.templates` — Manage email templates
- `ai.auto_emails` — Enable AI to send emails automatically without manual approval (Owner-controlled per automation)
- `ai.view_suggestions` — See AI communication recommendations and follow-up intelligence

### 15.2 Owner UX Rules for Communication

The Owner has unrestricted access to all communication features:
- Compose and send emails to any customer
- Manage all automation rules and modes
- Configure sender identities
- View all communication analytics
- Reset AI communication memory
- Override opt-out warnings (with confirmation and audit log entry)

### 15.3 Office User Communication Permissions

Office users see only communication features their effective permissions grant:

| Feature | Required permission |
|---------|-------------------|
| View communication timeline | `communications.view` |
| Send email manually | `communications.send` |
| Create a draft only | `communications.draft` (without `communications.send`) |
| Schedule send | `communications.schedule` |
| Approve automation-queued email | `communications.send` |
| Use AI draft in composer | `ai.view_suggestions` (for draft suggestion) |
| Manage email templates | `settings.templates` |
| Manage automation rules | `communications.manage_automations` |
| See AI follow-up intelligence | `ai.view_suggestions` |
| View open/click analytics | `communications.view` |
| See financial amount in communication | `invoices.view` or `quotes.view` (depending on entity) |
| See margin/cost in AI reasoning | `quotes.view_cost_price` |

### 15.4 Permission and AI Drafts

When the AI drafts an email for an operator:
- The AI prompt is scoped to the operator's effective permissions
- An operator without `quotes.view_cost_price` receives a draft that does not reference cost, margin, or profitability language
- An operator without `invoices.view` cannot draft an email with invoice amounts referenced
- The AI never surfaces restricted financial data through the email drafting flow

---

## 16. Audit and Compliance

### 16.1 What Is Audited

Every communication-related action creates an audit record. The following actions are audited:

| Action | Audit table | Detail |
|--------|------------|--------|
| Email sent (manual) | `email_logs` | Full send record; immutable |
| Email sent (automation) | `email_logs` | Full send record; automation_run_id linked |
| Email scheduled | `email_logs` | status = 'scheduled'; updated on send or cancel |
| Email cancelled (scheduled) | `email_logs` | status updated + cancellation reason |
| Automation rule created | `activity_logs` | Who created, rule details |
| Automation rule edited | `activity_logs` | Before/after state |
| Automation rule activated/deactivated | `activity_logs` | |
| Template created/edited/archived | `activity_logs` | Template version snapshot |
| Sender identity added/verified | `activity_logs` | |
| Communication opt-out recorded | `activity_logs` | Source (customer-initiated vs. operator) |
| AI draft generated | `ai_logs` | Task type = `email_draft`; prompt; model used |
| AI draft modified by operator | `email_logs.ai_influenced` | Boolean flag |
| Approval granted (Approval mode) | `email_automation_runs` | Approver + timestamp |
| Hard bounce recorded | `activity_logs` | |
| Spam complaint recorded | `activity_logs` | |

### 16.2 Immutable Sent-Email Snapshot

Every sent email is preserved as a permanent, immutable record in `email_logs`. The record includes:
- Subject line (as sent)
- Template ID and version used
- Sender identity
- Recipient email
- All delivery tracking data

**What the `email_logs` table does NOT store:** The full rendered HTML body of the email. The body is reconstructable from the template version + entity data at send time. For compliance-critical communications (invoices, service agreements), the PDF attachment is stored in Supabase Storage and the storage URL is in `email_logs`.

If full body storage is required for compliance purposes in specific markets (V2+): `email_logs.body_snapshot` column added and populated at send time for flagged template types.

### 16.3 GDPR and International Compliance Preparation

Bivro does not make legal compliance guarantees in this document. The following architectural provisions support GDPR and equivalent regulatory frameworks:

**Data minimization:**
- `email_logs` stores recipient email, subject, template reference — not full HTML body by default
- Communication preferences store opt-out status — not detailed behavioral profiling

**Right to erasure:**
- `email_logs` rows for a customer cannot be hard-deleted (they are operational audit records)
- GDPR erasure: `email_logs.to_email` is replaced with `[erased]` and `to_name` with `[erased]`; the send record is preserved but personal data is anonymized
- Customer record soft-deleted: future automated sends blocked; existing logs anonymized on request

**Consent for transactional vs. marketing:**
- Transactional email (invoices, job confirmations, booking receipts) does not require separate consent under most jurisdictions
- Marketing-class email (reactivation, unsolicited promotions) requires opt-in or a prior relationship basis — this is not enforced by Bivro's architecture; it is the company's legal responsibility

**Retention:**
- `email_logs` retention follows the company's `activity_logs` retention policy (7 years for business records by default; configurable)
- AI drafts in `ai_logs` follow the same retention

**Data residency (V2+):** Supabase regional database options provide EU data residency if required. V1 defaults to Supabase's default region; companies requiring EU residency should configure this at account creation.

### 16.4 Platform Audit of Communication Data

If a Bivro platform staff member accesses a company's communication data during a support session:
- Support session is logged per PLATFORM_ADMIN.md §5
- All views of `email_logs` data during the session are captured in `platform_audit_log`
- Content of viewed emails is not separately stored in the platform audit (the session log covers what was accessed)

---

## 17. Mobile UX

### 17.1 Mobile Communication Patterns

Communication workflows must be usable on mobile (0–767px) and tablet (768–1023px). Complex template editing and automation configuration are laptop/desktop-optimized but the following must work on mobile:

### 17.2 Mobile Communication Features

**Quick compose (mobile):**
- FAB or "Email Customer" button opens bottom sheet
- Bottom sheet: To (pre-filled), Subject, short message body
- Template selector in bottom sheet (recent/relevant templates)
- [Send] [Schedule] [Save draft]
- No attachment from mobile (V1); view attachments is read-only

**Approve/review automation queued email (mobile):**
- Notification: "Review and approve a scheduled email for Thompson Family"
- Tap → full-screen email preview
- [Approve & Send] [Edit on desktop] [Cancel send]
- Edit on desktop: adds a note to the draft; does not block approval

**View communication timeline (mobile):**
- Timeline is a simple chronological card list
- Each card: event type icon, brief description, timestamp
- Tap card to expand detail
- Internal notes visible with a distinct label

**AI follow-up recommendation (mobile dashboard):**
- Card in dashboard "Attention" section: "Consider following up on Q-2041 · Thompson Family"
- Tap → brief reasoning + [Compose Follow-Up] [Dismiss]

**Communication timeline actions (mobile):**
- [+] Add internal note (text input → save)
- No inline compose on mobile — directs to bottom sheet composer

### 17.3 Tablet Patterns

- Composer is available as a drawer (right-side panel) without leaving the customer record
- Timeline visible alongside composer on tablet (split view)
- Template selector available as a searchable dropdown (not a full-page modal)
- Automation approval available with full preview and actions

---

## 18. Database Schema Extensions

This section defines the new database tables required by the email system. These tables extend `DATABASE_ARCHITECTURE.md` and must be added to it. The existing `email_logs` table and `email_delivery_status` ENUM (DATABASE_ARCHITECTURE.md §16) are unchanged.

### 18.1 `email_templates`

Company-owned email templates. Seeded with Bivro default templates at company creation.

```
email_templates
─────────────────────────────────────────────────────────────────
id                      uuid            PRIMARY KEY  DEFAULT gen_uuid_v7()
─────────────────────────────────────────────────────────────────
company_id              uuid            NOT NULL REFERENCES companies(id) ON DELETE CASCADE

-- Identity
slug                    text            NOT NULL   -- unique within company; e.g., 'quote-sent'
name                    text            NOT NULL   -- display name; e.g., "Quote Sent"
description             text

-- Classification
lifecycle_stage         text            -- matches §3 stage labels; e.g., 'quote_sent', 'move_reminder'
template_class          text            NOT NULL DEFAULT 'transactional'
-- 'transactional' | 'marketing' — governs unsubscribe and opt-out behavior

-- Seeding
is_system_default       boolean         NOT NULL DEFAULT false
-- true = seeded by Bivro; can be deactivated but not deleted

-- Status
is_active               boolean         NOT NULL DEFAULT true
archived_at             timestamptz

-- Display order
sort_order              integer         NOT NULL DEFAULT 0

-- Timestamps
created_at              timestamptz     NOT NULL DEFAULT now()
updated_at              timestamptz     NOT NULL DEFAULT now()
deleted_at              timestamptz
─────────────────────────────────────────────────────────────────
INDEXES:
  idx_email_templates_company_slug  UNIQUE (company_id, slug) WHERE deleted_at IS NULL
  idx_email_templates_company_active (company_id, is_active, lifecycle_stage)
```

### 18.2 `email_template_versions`

Every save to a template creates a version record. Versions are immutable — they are the source of truth for what template content was active at any point in time.

```
email_template_versions
─────────────────────────────────────────────────────────────────
id                      uuid            PRIMARY KEY  DEFAULT gen_uuid_v7()
─────────────────────────────────────────────────────────────────
template_id             uuid            NOT NULL REFERENCES email_templates(id) ON DELETE CASCADE
company_id              uuid            NOT NULL   -- denormalized for RLS

-- Version identifier
version_number          integer         NOT NULL   -- sequential within template; 1, 2, 3...
is_current              boolean         NOT NULL DEFAULT false
-- Only one version per template may have is_current = true

-- Language
language                text            NOT NULL DEFAULT 'en'
-- e.g., 'en', 'de', 'fr', 'it'

-- Content
subject                 text            NOT NULL
body_html               text            NOT NULL   -- rendered HTML (React Email output)
body_text               text            NOT NULL   -- plain text fallback
variables_used          text[]          NOT NULL DEFAULT '{}'
-- Array of variable names referenced in this version (e.g., {customer.first_name, quote.number})

-- Authorship
created_by              uuid            REFERENCES profiles(id) ON DELETE SET NULL

-- Append-only: no updated_at, no deleted_at
created_at              timestamptz     NOT NULL DEFAULT now()
─────────────────────────────────────────────────────────────────
INDEXES:
  idx_template_versions_template_id   (template_id, language, version_number DESC)
  idx_template_versions_current       (template_id, language) WHERE is_current = true
CONSTRAINTS:
  UNIQUE (template_id, language, version_number)
```

### 18.3 `email_automations`

Automation rule definitions. Each rule is scoped to a company.

```
email_automations
─────────────────────────────────────────────────────────────────
id                      uuid            PRIMARY KEY  DEFAULT gen_uuid_v7()
─────────────────────────────────────────────────────────────────
company_id              uuid            NOT NULL REFERENCES companies(id) ON DELETE CASCADE

-- Identity
name                    text            NOT NULL
description             text

-- Trigger
trigger_event           text            NOT NULL   -- domain event type; e.g., 'quoting.quote.sent'
trigger_delay_seconds   integer         NOT NULL DEFAULT 0
-- 0 = immediate; 86400 = 1 day; 259200 = 3 days

-- Conditions (JSON array of condition objects)
conditions              jsonb           NOT NULL DEFAULT '[]'
-- e.g., [{"field": "quote.status", "op": "eq", "value": "sent"}, ...]

-- Cancellation (domain events that abort pending send)
cancellation_events     text[]          NOT NULL DEFAULT '{}'
-- e.g., {'quoting.quote.accepted', 'quoting.quote.rejected'}

-- Template
template_id             uuid            NOT NULL REFERENCES email_templates(id) ON DELETE RESTRICT
template_language       text            DEFAULT 'customer_preference'
-- 'customer_preference' = auto-resolve per customer; or explicit: 'en', 'de', etc.

-- Sender
sender_identity_id      uuid            REFERENCES email_sender_identities(id) ON DELETE SET NULL
-- null = use company default sender identity

-- Execution
mode                    text            NOT NULL DEFAULT 'approval'
-- 'draft' | 'approval' | 'auto_send'

-- Retry
max_retries             smallint        NOT NULL DEFAULT 3
retry_delay_minutes     smallint        NOT NULL DEFAULT 5

-- Seeding
is_system_default       boolean         NOT NULL DEFAULT false
-- true = seeded by Bivro; deletable by Owner

-- Status
is_active               boolean         NOT NULL DEFAULT false
-- All automations start inactive; Owner must explicitly activate

-- Authorship
created_by              uuid            REFERENCES profiles(id) ON DELETE SET NULL
updated_by              uuid            REFERENCES profiles(id) ON DELETE SET NULL

-- Timestamps
created_at              timestamptz     NOT NULL DEFAULT now()
updated_at              timestamptz     NOT NULL DEFAULT now()
─────────────────────────────────────────────────────────────────
INDEXES:
  idx_email_automations_company_trigger (company_id, trigger_event) WHERE is_active = true
```

### 18.4 `email_automation_runs`

Execution log for every automation trigger event. Append-only audit trail.

```
email_automation_runs
─────────────────────────────────────────────────────────────────
id                      uuid            PRIMARY KEY  DEFAULT gen_uuid_v7()
─────────────────────────────────────────────────────────────────
company_id              uuid            NOT NULL   -- denormalized; no FK (append-only log)
automation_id           uuid            NOT NULL   -- soft reference
template_id             uuid            NOT NULL   -- soft reference

-- What triggered this run
trigger_event           text            NOT NULL
entity_type             text            -- 'quote' | 'job' | 'invoice' | 'customer'
entity_id               uuid

-- Recipient
to_email                text            NOT NULL
to_name                 text

-- Execution result
status                  text            NOT NULL
-- 'pending' | 'draft_created' | 'approval_pending' | 'approved' | 'sent' | 'skipped' | 'failed' | 'expired' | 'cancelled'
cancellation_reason     text
-- populated when status = 'cancelled'; e.g., 'quote_accepted_before_send'

-- Timing
scheduled_for           timestamptz     -- when the send was scheduled
approved_at             timestamptz     -- for approval mode
approved_by             uuid            -- soft reference to profiles

-- Links
email_log_id            uuid            -- references email_logs.id when email was sent

-- Error
error_message           text

-- Append-only
created_at              timestamptz     NOT NULL DEFAULT now()
─────────────────────────────────────────────────────────────────
INDEXES:
  idx_automation_runs_company_id      (company_id, created_at DESC)
  idx_automation_runs_entity          (entity_type, entity_id) WHERE entity_id IS NOT NULL
  idx_automation_runs_status          (company_id, status) WHERE status IN ('pending', 'approval_pending')
```

### 18.5 `email_sender_identities`

Verified sender identities for each company.

```
email_sender_identities
─────────────────────────────────────────────────────────────────
id                      uuid            PRIMARY KEY  DEFAULT gen_uuid_v7()
─────────────────────────────────────────────────────────────────
company_id              uuid            NOT NULL REFERENCES companies(id) ON DELETE CASCADE

-- Identity
name                    text            NOT NULL   -- Display name; e.g., "Allianz Moving Co."
email                   text            NOT NULL   -- From address; e.g., "hello@allianzmoving.com"
reply_to                text            -- Reply-to address; defaults to company.email

-- Tier
tier                    text            NOT NULL DEFAULT 'bivro_managed'
-- 'bivro_managed' | 'company_verified'

-- Verification (company_verified tier only)
domain                  text            -- e.g., 'allianzmoving.com'
dkim_status             text            DEFAULT 'pending'
-- 'pending' | 'verified' | 'failed'
spf_status              text            DEFAULT 'pending'
dmarc_status            text            DEFAULT 'pending'
verified_at             timestamptz

-- Status
is_active               boolean         NOT NULL DEFAULT true
is_default              boolean         NOT NULL DEFAULT false
-- Only one identity per company may be is_default = true

-- Timestamps
created_at              timestamptz     NOT NULL DEFAULT now()
updated_at              timestamptz     NOT NULL DEFAULT now()
deleted_at              timestamptz
─────────────────────────────────────────────────────────────────
INDEXES:
  idx_sender_identities_company_default (company_id) WHERE is_default = true AND deleted_at IS NULL
CONSTRAINTS:
  UNIQUE (company_id, email) WHERE deleted_at IS NULL
```

### 18.6 `communication_preferences`

Per-customer communication preferences. One row per customer.

```
communication_preferences
─────────────────────────────────────────────────────────────────
id                      uuid            PRIMARY KEY  DEFAULT gen_uuid_v7()
─────────────────────────────────────────────────────────────────
company_id              uuid            NOT NULL REFERENCES companies(id) ON DELETE CASCADE
customer_id             uuid            NOT NULL UNIQUE REFERENCES customers(id) ON DELETE CASCADE

-- Language
preferred_language      text            DEFAULT NULL
-- null = use company default; 'en' | 'de' | 'fr' | 'it' | ...
language_source         text            DEFAULT 'unset'
-- 'unset' | 'operator_set' | 'customer_set' | 'ai_detected'

-- Opt-out
opted_out_all           boolean         NOT NULL DEFAULT false
opted_out_automated     boolean         NOT NULL DEFAULT false
opted_out_marketing     boolean         NOT NULL DEFAULT false
opted_out_at            timestamptz

-- Deliverability
email_deliverability    text            NOT NULL DEFAULT 'ok'
-- 'ok' | 'soft_bounce_risk' | 'hard_bounce' | 'complained'
deliverability_updated_at timestamptz

-- Custom salutation
preferred_salutation    text            -- e.g., 'Mr. Thompson' or 'Thomas'

-- Internal notes
communication_notes     text            -- visible to office team; not sent to customer

-- Timestamps
created_at              timestamptz     NOT NULL DEFAULT now()
updated_at              timestamptz     NOT NULL DEFAULT now()
─────────────────────────────────────────────────────────────────
INDEXES:
  idx_comm_prefs_company_customer     (company_id, customer_id) — covered by UNIQUE
  idx_comm_prefs_deliverability       (company_id, email_deliverability)
```

### 18.7 `ai_communication_memory`

Tenant-isolated AI communication tone and style learning. One-to-few rows per company.

```
ai_communication_memory
─────────────────────────────────────────────────────────────────
id                      uuid            PRIMARY KEY  DEFAULT gen_uuid_v7()
─────────────────────────────────────────────────────────────────
company_id              uuid            NOT NULL REFERENCES companies(id) ON DELETE CASCADE

-- Scope
scope                   text            NOT NULL DEFAULT 'company'
-- 'company' | 'customer'
customer_id             uuid            REFERENCES customers(id) ON DELETE CASCADE
-- null when scope = 'company'; populated when scope = 'customer'

-- Memory content
memory_type             text            NOT NULL
-- e.g., 'preferred_greeting' | 'preferred_signoff' | 'message_length' | 'register' | 'follow_up_style' | 'language_preference'

observed_value          text            NOT NULL
-- Plain language description; e.g., "Usually starts with 'Hi [first name]'"
confidence              integer         NOT NULL DEFAULT 0 CHECK (confidence BETWEEN 0 AND 100)

-- Status
status                  text            NOT NULL DEFAULT 'proposed'
-- 'proposed' | 'confirmed' | 'rejected'
confirmed_by            uuid            REFERENCES profiles(id) ON DELETE SET NULL
confirmed_at            timestamptz

-- Evidence
observation_count       integer         NOT NULL DEFAULT 1
-- Number of observed instances that support this memory

-- Timestamps
created_at              timestamptz     NOT NULL DEFAULT now()
updated_at              timestamptz     NOT NULL DEFAULT now()
─────────────────────────────────────────────────────────────────
INDEXES:
  idx_ai_comm_memory_company_type     (company_id, scope, memory_type)
  idx_ai_comm_memory_customer         (customer_id) WHERE customer_id IS NOT NULL
```

### 18.8 Extension to `email_logs`

The existing `email_logs` table (DATABASE_ARCHITECTURE.md §16) needs the following additional columns. These are additive and do not break the existing schema:

```
-- Add to email_logs:

-- Automation linkage
automation_id           uuid            -- soft reference to email_automations.id
automation_run_id       uuid            -- soft reference to email_automation_runs.id

-- Template linkage
template_id             uuid            -- soft reference to email_templates.id
template_version_id     uuid            -- soft reference to email_template_versions.id

-- AI involvement
ai_influenced           boolean         NOT NULL DEFAULT false
-- true = AI drafted or modified the email body

-- Idempotency
idempotency_key         uuid            UNIQUE NOT NULL DEFAULT gen_uuid_v7()
-- Passed to Resend; prevents duplicate sends on retry

-- Language
language                text            DEFAULT 'en'

-- Scheduled send
scheduled_for           timestamptz
-- null = immediate send; populated = was scheduled before send

-- Sender identity
sender_identity_id      uuid            -- soft reference to email_sender_identities.id

-- Document attachment integrity
attached_document_id    uuid
-- Soft reference to the exact documents.id that was attached to this email.
-- Records the immutable document snapshot that was delivered to the customer.
-- CRITICAL: This is a soft reference (no FK) because email_logs is append-only
-- and documents may be soft-deleted. The reference must never be updated after send.
-- Pre-send validation must confirm documents.generation_status = 'generated'
-- and documents.voided_at IS NULL before attaching.
-- A scheduled email whose attached_document_id points to a superseded or voided document
-- must be blocked and escalated to Approval mode before sending.
```

### 18.9 Email Attachment Integrity Rule

When an email is composed with a document attachment (quote PDF, invoice PDF, payment receipt):

1. The specific `documents.id` is recorded in `email_logs.attached_document_id` at send time
2. This reference is permanent and immutable — never updated after the email is sent
3. The email sends the exact PDF binary at `documents.storage_path` for that specific document row
4. If a new document version is generated after the email is sent: the sent email's attachment is unaffected — the old `documents` row and its PDF file remain permanently accessible

**Scheduled email integrity:**
- At compose time: `attached_document_id` is set to the current document version
- At send time (scheduled emails): pre-send validation checks that the referenced document still has `generation_status = 'generated'` and `voided_at IS NULL`
- If the document was superseded or voided between compose and scheduled send time: the send is blocked and escalated to Approval mode with the specific notice: "The document attached to this scheduled email has been superseded by a newer version — review before sending"
- The operator must explicitly select the new version or confirm the old version before the email proceeds

---

## 19. V1 vs V2+ Scope

### 19.1 V1 — What Is Built

The following capabilities are built in Bivro V1:

| Capability | V1 status |
|-----------|----------|
| Outbound email via Resend | ✅ |
| Email template system (company-owned, versioned) | ✅ |
| Template variables with pre-send validation | ✅ |
| 4-language support (en, de, fr, it) | ✅ |
| AI-assisted email drafting | ✅ |
| Composer with To/CC/BCC/Schedule/Attachments | ✅ |
| Quote/Invoice PDF attachments | ✅ |
| 12 built-in automation rules (seeded inactive) | ✅ |
| 3 automation modes (Draft / Approval / Auto-send) | ✅ |
| Quote follow-up intelligence | ✅ |
| Resend webhooks (open/click/bounce tracking) | ✅ |
| Customer communication timeline (outbound) | ✅ |
| Sender identity: Bivro-managed domain | ✅ |
| Sender identity: Company-verified domain | ✅ |
| Bounce and complaint handling | ✅ |
| Unsubscribe handling (marketing class) | ✅ |
| AI tone memory (company-level) | ✅ |
| Communication audit log | ✅ |
| GDPR erasure support (email anonymization) | ✅ |
| Pre-send safety validation | ✅ |
| Cross-tenant isolation | ✅ |
| Mobile: approve, review, quick compose | ✅ |

### 19.2 V1.5 — Added Before V2

| Capability | Notes |
|-----------|-------|
| Manual inbound reply linking | Operator pastes/forwards customer reply into Bivro |
| Inbound intent classification | AI classifies customer reply intent (accepted, questioning, etc.) |
| AI summarize thread | Summary of all communication with a customer |
| Customer-level tone memory | AI learns individual customer communication preferences |
| Suggest reply | AI drafts a reply based on last inbound message |

### 19.3 V2+ — Future Architecture

| Capability | Notes |
|-----------|-------|
| Full inbox synchronization | IMAP/SMTP integration for unified inbox |
| Omnichannel (WhatsApp, SMS) | Architecture treats channels generically |
| Real-time thread view | Bi-directional conversation in Bivro |
| Advanced intent detection | Frustration, urgency, intent classification at scale |
| Durable automation retry | Inngest replacing Vercel Cron for automation (ARCHITECTURE.md §10 risk register) |
| Full email body snapshot storage | For compliance-critical markets |
| SMS channel | Twilio or alternative |
| Marketing email campaigns | Separate from transactional; separate legal/consent framework |
| Multilingual expansion | Additional languages beyond V1 four |
| EU data residency | Configurable at company creation for GDPR-strict markets |

---

## 20. Cross-Document Consistency

### 20.1 Verified Against Existing Documents

| Claim in this document | Verified against | Status |
|-----------------------|-----------------|--------|
| Resend + React Email as email stack | ARCHITECTURE.md §2 tech stack table | ✅ Consistent |
| `email_logs` schema and `email_delivery_status` ENUM | DATABASE_ARCHITECTURE.md §16 | ✅ Consistent — this document extends, does not replace |
| Supabase DB webhook → Next.js API route for email triggers | ARCHITECTURE.md §10 | ✅ Consistent |
| Vercel Cron for scheduled sends | ARCHITECTURE.md §10 | ✅ Consistent |
| Inngest as V2+ durable retry upgrade | ARCHITECTURE.md §10 risk register | ✅ Consistent |
| Domain events: `quoting.quote.sent`, `payments.invoice.sent` | ARCHITECTURE.md §10 domain event table | ✅ Consistent |
| `settings.templates` permission | PRODUCT_REQUIREMENTS.md §3.3 | ✅ Consistent |
| `ai.auto_emails` permission | PRODUCT_REQUIREMENTS.md §3.3 | ✅ Consistent |
| `ai.view_suggestions` permission | PRODUCT_REQUIREMENTS.md §3.3 | ✅ Consistent |
| Owner is unrestricted | PRODUCT_REQUIREMENTS.md §2.0, product_freeze.md | ✅ Consistent |
| Two roles: Owner and Office (V1) | PRODUCT_REQUIREMENTS.md §2.0 | ✅ Consistent |
| Tenant isolation for AI learning | AI_ENGINE.md §4 | ✅ Consistent |
| `quotes.view_cost_price` gates financial visibility | PRODUCT_REQUIREMENTS.md §3.3 | ✅ Consistent — applied to AI drafts |
| Communications domain ownership: EmailTemplate, MessageLog | ARCHITECTURE.md §3 | ✅ Consistent |
| `activity_logs` for audit trail | DATABASE_ARCHITECTURE.md §6.20 | ✅ Consistent |
| Platform support access logged in `platform_audit_log` | PLATFORM_ADMIN.md §5, §11.12 | ✅ Consistent |
| GDPR erasure: soft delete + anonymization | DATABASE_ARCHITECTURE.md §14 | ✅ Consistent |
| gen_uuid_v7() for all PKs | DATABASE_ARCHITECTURE.md P8 | ✅ Consistent — all new tables use this |
| Mobile patterns align with UI_UX_SYSTEM.md | UI_UX_SYSTEM.md §5.5, §12.9 | ✅ Consistent |
| AI facts must come from structured data | AI_ENGINE.md §1.1, product_freeze.md | ✅ Consistent |

### 20.2 Identified Inconsistencies

#### High Inconsistency — New permissions not in PRODUCT_REQUIREMENTS.md

**Conflict:** This document defines 5 new communication permissions (`communications.view`, `communications.send`, `communications.schedule`, `communications.draft`, `communications.manage_automations`) that do not currently exist in `PRODUCT_REQUIREMENTS.md §3.3`.

**Resolution required:** `PRODUCT_REQUIREMENTS.md §3.3` must be updated to add the Communications resource group with these permissions. This document defines the authoritative specification for these permissions; PRODUCT_REQUIREMENTS.md §3.3 must be brought into alignment.

**Impact:** Medium — no frozen product decisions are changed; the permission model is extended (adding new permissions never removes or changes existing ones). However, the database schema (`permission_definitions` table) and UI (`permission_groups` management) must reflect the new permissions before V1 launch.

**This is flagged as High because permission definitions gate schema seeding and the permission group management UI.** Unresolved before implementation: new permissions would be silently missing from the permission catalogue.

#### Medium — `company_settings` email fields not yet defined

**Conflict:** This document references `company_settings.default_language` and `company_settings.alert_email` (already present). However, email sender configuration (default sender identity, reply-to address) is not currently in `company_settings` in `DATABASE_ARCHITECTURE.md §6.23`.

**Resolution required:** `company_settings` needs email-related fields, OR sender configuration is fully managed through `email_sender_identities` (which this document establishes). The latter is architecturally cleaner — email sender configuration lives in `email_sender_identities`, not in `company_settings`. No change to `company_settings` is needed. This is a clarification, not a contradiction.

**Status:** ✅ Resolved by clarification — `email_sender_identities` owns sender configuration.

### 20.3 No Critical Contradictions Found

No frozen product decisions were changed. No business features were added beyond the scope of the communication system. No existing permission definitions were modified.

---

## 21. Final Report

### Communication Principles Established (5)

1. **Company Voice, Not Bivro Voice** — customers experience the company's identity
2. **AI Drafts, Humans Send** — AI assists; humans approve except for explicitly configured auto-sends
3. **Right Message, Right Moment** — timing is part of the message
4. **Immutable History** — every sent email is a permanent, exact record
5. **Transparent Automation** — internal records show whether a message was manual, AI-assisted, or automated

### Lifecycle Flows Defined

**27 lifecycle stages** fully specified with trigger, audience, channel, automation eligibility, approval requirement, AI involvement, cancellation conditions, and audit requirements.

### AI Communication Capabilities

- Email drafting (full, rewrite, shorten, formalize, warm, simplify, translate)
- Quote follow-up timing intelligence (tenant-isolated historical analysis)
- Missing information detection
- Urgency and intent detection (V1.5+)
- Frustration detection (soft alert)
- Tone memory — learned from company's own communication history
- AI facts sourced exclusively from structured Bivro data

### Tenant-Isolated Communication Learning

`ai_communication_memory` table provides per-company (and in V1.5+, per-customer) tone and style learning. No company's patterns influence another. Learning is transparent, reviewable, correctable, and deletable by the Owner. Proposed patterns require human confirmation before becoming active.

### Template Architecture

- Company-owned templates with unlimited custom creation
- Versioned (every save is a new version; sent emails link to exact version used)
- 4-language variants per template
- Pre-send variable validation (no `{{unresolved.token}}` ever reaches a customer)
- Test-send and preview in Settings → Templates
- Historical sent emails are immutable — template changes never affect past messages

### Automation Modes

Three modes: **Draft Only** (human must send) | **Approval Required** (human must approve) | **Auto-Send** (Owner-configured per rule). 12 built-in V1 automation rules seeded as inactive. All must be explicitly activated. Auto-send requires Owner enablement per automation.

### Quote Follow-Up Intelligence

Tenant-isolated analysis of: open count, open timing, customer history, company conversion patterns. Qualitative confidence labels with reasoning. Three recommendation types (follow up now, wait, gone cold). Always advisory — operator decides.

### Delivery Architecture

- **Provider:** Resend (V1) — consistent with ARCHITECTURE.md
- **Sender identities:** Bivro-managed (no DNS setup) and Company-verified (SPF/DKIM)
- **Authentication:** SPF, DKIM enforced; DMARC recommended
- **Bounce handling:** Hard bounce blocks future sends; soft bounce triggers risk flag
- **Unsubscribe:** Marketing-class emails include unsubscribe; transactional emails do not
- **Webhooks:** Delivery, open, click, bounce, complaint events processed from Resend
- **Idempotency:** UUID v7 idempotency key per send; Resend deduplicates on retry

### V1 Scope

**V1:** Full outbound email system with templates, automations, AI drafting, follow-up intelligence, delivery tracking, tenant isolation, and audit.
**V1.5:** Manual inbound reply linking, AI reply suggestions.
**V2+:** Full inbox synchronization, omnichannel, Inngest durable automations.

### Files Created

| File | Action |
|------|--------|
| `docs/EMAIL_SYSTEM.md` | Created (this document) |

### Files That Require Updates (Not Changed in This Document)

| File | Required update |
|------|----------------|
| `PRODUCT_REQUIREMENTS.md §3.3` | Add Communications permission group (5 new permissions) |
| `DATABASE_ARCHITECTURE.md` | Add 7 new tables from §18 and extensions to `email_logs` |

---

### Critical Contradictions: None

### High Contradictions: 1

1. **New communications permissions not yet in PRODUCT_REQUIREMENTS.md §3.3** — this document defines 5 new permissions (`communications.view`, `communications.send`, `communications.schedule`, `communications.draft`, `communications.manage_automations`) that must be added to the canonical permission catalogue before implementation. PRODUCT_REQUIREMENTS.md §3.3 is the source of truth for permissions and must be updated. This document provides the authoritative definition.

### Medium Contradictions: None

---

---

## 22. Platform Emails (Registration and Onboarding)

> **Full specification:** `ONBOARDING_ARCHITECTURE.md §10`

Platform emails are sent by Bivro to prospective and existing company owners as part of the registration, approval, and account lifecycle flows. They are **not** tenant emails (not stored in the per-company `email_templates` table). They are hardcoded React Email components in `/emails/platform/` and sent from the platform sender identity (`noreply@mail.bivro.io`) via Resend.

### 22.1 Platform vs. Tenant Email Distinction

| Property | Platform email | Tenant email |
|----------|---------------|-------------|
| Sender | `noreply@mail.bivro.io` (Bivro) | Company's configured sender |
| Template storage | Hardcoded React Email in `/emails/platform/` | `email_templates` table per company |
| Trigger | Registration / approval lifecycle events | Customer lifecycle events (lead, quote, job, invoice) |
| Customizable by Owner | No | Yes |
| Company_id required | No (sent before company may be active) | Yes |
| Uses Resend | Yes (server-side, service_role) | Yes (server-side, service_role) |

### 22.2 Platform Email Catalogue

| Template file | Subject | Trigger |
|--------------|---------|---------|
| `platform-email-verification.tsx` | "Confirm your email to complete registration" | After registration (Supabase Auth built-in confirmation — configured in Auth dashboard) |
| `platform-registration-received.tsx` | "We've received your Bivro application" | When email verified → company_status transitions to `pending_review` |
| `platform-registration-approved.tsx` | "Your Bivro account is ready — welcome aboard" | When Platform Admin approves |
| `platform-registration-rejected.tsx` | "Update on your Bivro application" | When Platform Admin rejects |
| `platform-registration-more-info-needed.tsx` | "Action required: additional information needed" | When Platform Admin requests more information |
| `platform-account-suspended.tsx` | "Your Bivro account has been suspended" | When company suspended |
| `platform-account-reactivated.tsx` | "Your Bivro account has been reactivated" | When suspended company restored |
| `platform-office-invitation.tsx` | "You've been invited to join [Company] on Bivro" | When Owner invites an Office user |
| `platform-password-reset.tsx` | "Reset your Bivro password" | Forgot password (Supabase Auth built-in — configured in Auth dashboard) |
| `platform-password-changed.tsx` | "Your Bivro password has been changed" | After successful password change (reset or in-session) |

**Note on Supabase Auth emails:** `platform-email-verification.tsx` and `platform-password-reset.tsx` are configured as custom templates in the Supabase Auth dashboard, not sent directly by Bivro via Resend. All other platform emails are sent via Resend from server-side application code.

### 22.3 Rejection Email — Customer-Safe Reason Mapping

The internal rejection reason (stored in `companies.rejection_reason`) is never sent to the registrant. The following mapping produces the customer-facing reason shown in the rejection email:

| Internal rejection category | Customer-facing text |
|---------------------------|---------------------|
| Insufficient business information | "We were unable to verify the business information provided." |
| Non-qualifying business | "At this time, Bivro serves professional moving and relocation companies. Based on the information provided, we are unable to confirm your business qualifies." |
| Duplicate registration | "An account already exists for this business. If you believe this is an error, please contact us." |
| Fraudulent / suspicious | *(not disclosed)* "Please contact us at support@bivro.io for more details." |
| Terms of Service violation | "Please contact us at support@bivro.io for more details." |
| Other | "Please contact us at support@bivro.io for more details." |

### 22.4 Platform Email Variables

Platform email templates use a separate variable namespace from tenant templates. Variables are populated server-side before sending:

| Variable | Source |
|----------|--------|
| `{{company_name}}` | `companies.legal_name` OR `companies.name` |
| `{{owner_first_name}}` | `profiles.first_name` |
| `{{owner_email}}` | `profiles.email` |
| `{{trial_ends_at}}` | `companies.trial_ends_at` (formatted per locale) |
| `{{approval_date}}` | `companies.reviewed_at` |
| `{{suspension_reason}}` | `companies.suspended_reason` |
| `{{info_request_message}}` | Platform Admin's free-text input (§6.11) |
| `{{invite_expires_at}}` | `user_invitations.expires_at` |
| `{{inviter_name}}` | `profiles.first_name + last_name` of the inviting Owner |
| `{{accept_invite_url}}` | `https://app.bivro.io/invite/{raw_token}` |
| `{{password_reset_url}}` | Supabase Auth reset URL (injected by Supabase) |

### 22.5 Sprint Assignment

All 10 platform email templates are implemented in **Sprint 3 (IAM Module)**. They are simple React Email components with no AI involvement. They do not depend on any tenant-specific data beyond what is in the `companies` and `profiles` tables.

**Email system architecture foundation passed.**
