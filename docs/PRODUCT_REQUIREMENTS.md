# Bivro — Product Requirements Document (PRD)

**Version:** 1.0  
**Status:** Frozen — Single Source of Truth  
**Owner:** Product  
**Last updated:** 2026-06-29  

> Every feature, every page, every workflow defined in this document must align with `BUSINESS_MODEL.md`. If a conflict exists, the business model governs.

---

## Table of Contents

1. [Product Vision](#1-product-vision)
2. [Product Philosophy](#2-product-philosophy)
3. [User Roles & Personas](#3-user-roles--personas)
4. [Core Job Lifecycle](#4-core-job-lifecycle)
5. [Modules](#5-modules)
6. [Pages & Screens](#6-pages--screens)
7. [Feature Registry](#7-feature-registry)
8. [User Stories & Acceptance Criteria](#8-user-stories--acceptance-criteria)
9. [KPIs & Success Metrics](#9-kpis--success-metrics)
10. [MVP Scope](#10-mvp-scope)
11. [Version 1.0 Scope](#11-version-10-scope)
12. [Future Roadmap](#12-future-roadmap)

---

## 1. Product Vision

Bivro is the first AI-native operating platform for the moving and relocation industry.

A moving company operator should be able to wake up, open Bivro, and know exactly what is happening today — which crews are where, which customers need attention, which quotes are waiting, and what their business looks like financially — without asking anyone and without opening a single spreadsheet.

By the time a customer submits a moving request, Bivro should have already drafted the quote. By the time the owner thinks about scheduling, Bivro should have already proposed the optimal crew assignment. By the time the job ends, Bivro should have already sent the invoice.

The operator confirms. The AI executes.

This is not a software tool that helps people work. This is an intelligent system that does the work, and asks for human judgment only when it genuinely needs it.

---

## 2. Product Philosophy

### 2.1 The Zero-Admin Ideal

Every second an operator spends on administration is a second not spent on their customers, their crews, or their growth. The product's aspiration is zero manual administration. Every workflow is designed backward from this ideal: what would have to be true for this step to require no human action?

### 2.2 The Three-Tap Rule

Any action a crew member or operator needs to take on mobile must be completable in three taps or fewer. If it takes more, the design is wrong.

### 2.3 Progressive Disclosure

New operators see a simple, focused experience. Power users discover depth over time. Features reveal themselves based on usage patterns — not buried in settings menus.

### 2.4 Confirmations, Not Configurations

Bivro proposes. The operator confirms. Configuration is the enemy of adoption. Where the system can make a reasonable decision, it should make it and surface the result for approval — not present the operator with a blank form and expect them to fill it.

### 2.5 Trust Through Accuracy

A platform earns trust by being right. Every AI-generated output — quotes, schedules, emails — must be calibrated to be accurate enough that operators feel confident approving it without reading every word. This requires aggressive feedback loops, not aggressive disclaimers.

### 2.6 AI Assists. Humans Decide.

Every AI output in Bivro is a proposal. The AI recommends a quote — the operator approves or adjusts it. The AI suggests a crew size — the dispatcher overrides it. The AI drafts an email — the estimator edits it. No AI decision is mandatory, irrevocable, or invisible. Every recommendation must be accompanied by the ability to modify it completely. This is not a UX constraint — it is a product principle. Moving companies are trusting Bivro with their reputation and their revenue. They must always be in control.

---

## 3. User Roles & Personas

Bivro V1 has exactly **two login roles**: `Owner` and `Office`. Every user who authenticates into Bivro is one of these two.

Employees, drivers, crew leads, and movers exist as **planning records** in the database. They are assigned to jobs, their skills are tracked, their availability is managed — but they do not log into Bivro in V1. The crew mobile app (V1.0+) will introduce a separate restricted crew role; that is out of scope for V1 MVP.

---

### Role 1: Owner

**Who they are:** The business owner or CEO of a moving company. May also serve as dispatcher, estimator, or office manager in smaller operations.

**What they need:**
- Complete, unrestricted visibility into every aspect of the business
- Financial health at a glance
- The ability to configure every setting, permission, and workflow
- Trust that the system is running correctly without their constant presence

**Key behaviors:**
- Reviews the dashboard every morning
- Approves or reviews high-value quotes before sending
- Monitors revenue, outstanding invoices, and crew performance
- Makes pricing and capacity decisions
- Manages team access and permissions

**Permissions:** **Unrestricted.** The Owner has full access to every module, every record, every setting, and every data export. Nothing in Bivro restricts the Owner. There is no permission check that applies to the Owner role.

**Frustrations today:** No single view of the business. Financial reporting requires pulling data from three tools. No visibility into whether estimates are accurate.

---

### Role 2: Office

**Who they are:** Internal team members who handle day-to-day operations. In practice, Office users may function as dispatchers, estimators, office administrators, or finance managers — depending on how the Owner configures their permissions.

**What they need:**
- Access to exactly the modules and actions relevant to their function
- No friction from unnecessary restrictions on things they are allowed to do
- No accidental access to sensitive data they should not see

**Key behaviors vary by function:**
- A dispatcher-configured Office user lives on the dispatch board, managing crews and job status
- An estimator-configured Office user works in leads and quotes, building proposals and following up
- A finance-configured Office user reviews invoices, records payments, and runs reports

**Permissions:** **Completely configurable by the Owner.** The Office role has no fixed permission set. The Owner assigns permissions to each Office user individually or via Permission Groups. See Section 3.3 (Permission System) for the complete model.

---

### 3.1 Functional Personas (Not System Roles)

The following personas describe typical permission configurations that Owners create for Office users. They are **not system roles** — there is no "Dispatcher" or "Estimator" account type. These are documented to help owners understand how to configure the permission system:

**Dispatcher persona**
- Permissions: Jobs (view, create, edit, assign, complete) | Crew records (view, edit) | Vehicles (view, edit) | Customers (view) | Leads (view)
- No access to: quotes (pricing), invoices, payments, financial reports, settings

**Estimator persona**
- Permissions: Leads (view, create, edit) | Quotes (view, create, edit, send) | Customers (view, create, edit) | Appointments (view, create, edit)
- No access to: job assignment, financial data, reports, settings

**Finance persona**
- Permissions: Invoices (view, create, edit, cancel) | Payments (view, record manual) | Reports (view, export) | Jobs (view only) | Customers (view only)
- No access to: quotes (pricing changes), job management, crew, settings

**Office manager / all-rounder**
- Permissions: Most operational permissions enabled | Financial reports may be restricted | No access to company settings or subscription

---

### 3.2 Employees & Crew (Planning Records in V1)

Moving company employees — drivers, movers, crew leads, foremen — are **records** in the system, not users. They are:
- Assigned to jobs via the dispatch board
- Listed on the schedule
- Referenced in reports
- Tracked by role, skills, and employment status

They **do not log in** in V1. Their data is managed entirely by Owner and Office users on their behalf.

When the crew mobile app ships (V1.0+), a new restricted `crew` role will be introduced for on-the-ground job updates. This role will have no access to quotes, financials, or other customers' jobs. That role definition is a V1.0 scope item, not V1 MVP.

---

### 3.3 Permission System

#### Principle

The Owner decides what every Office user can or cannot do. Permissions are not a fixed matrix — they are a fully configurable set of grants that the Owner assigns. This makes Bivro flexible enough to serve a 2-person operation (where everyone does everything) and a 30-person regional company (where roles are clearly separated).

#### Permission Groups

The Owner creates named Permission Groups (e.g., "Dispatcher," "Estimator," "Finance"). Each group contains a specific set of permission grants. Office users are assigned to one or more groups. A user with multiple groups receives the union of all permissions from all assigned groups.

Individual permission overrides can be applied per user on top of their group assignments — to grant a specific extra permission or explicitly deny one.

Every permission change is recorded in the audit log.

#### Permission Catalogue

The following is the complete list of configurable permissions in V1:

**Customers**
- `customers.view` — View customer records
- `customers.create` — Create new customer records
- `customers.edit` — Edit existing customer records
- `customers.delete` — Soft-delete customer records
- `customers.export` — Export customer data to CSV

**Leads**
- `leads.view` — View leads and pipeline
- `leads.create` — Create new leads (manual entry)
- `leads.edit` — Edit lead details and status
- `leads.delete` — Archive leads
- `leads.assign` — Assign leads to other users

**Quotes**
- `quotes.view` — View quote list and details
- `quotes.create` — Create new quotes
- `quotes.edit` — Edit draft quotes
- `quotes.delete` — Archive quotes
- `quotes.duplicate` — Duplicate an existing quote
- `quotes.send` — Send a quote to a customer
- `quotes.approve` — Approve AI-generated quotes before sending
- `quotes.change_pricing` — Modify line item prices on a quote
- `quotes.view_cost_price` — See cost prices and margin on quote items (hidden from office users who only see the sell price)
- `quotes.apply_discount` — Apply discounts to a quote

**Jobs**
- `jobs.view` — View job list and details
- `jobs.create` — Create new jobs
- `jobs.edit` — Edit job details
- `jobs.assign` — Assign crew and vehicles to jobs
- `jobs.complete` — Mark a job as complete
- `jobs.cancel` — Cancel a job

**Employees (records)**
- `employees.view` — View employee records
- `employees.create` — Create new employee records
- `employees.edit` — Edit employee details
- `employees.delete` — Soft-delete employee records

**Vehicles**
- `vehicles.view` — View vehicle records
- `vehicles.create` — Add new vehicles
- `vehicles.edit` — Edit vehicle details
- `vehicles.delete` — Soft-delete vehicles

**Invoices**
- `invoices.view` — View invoice list and details
- `invoices.create` — Generate invoices
- `invoices.edit` — Edit draft invoices
- `invoices.cancel` — Void or cancel invoices
- `invoices.refund` — Process refunds

**Payments**
- `payments.view` — View payment records
- `payments.record_manual` — Record cash, check, and bank transfer payments
- `payments.export` — Export payment reports

**Communications**
- `communications.view` — View customer communication history and timeline
- `communications.send` — Send emails manually from the composer
- `communications.schedule` — Schedule future email sends
- `communications.draft` — Create email drafts only (cannot send directly; for review workflows)
- `communications.manage_automations` — Create, edit, activate, and deactivate automation rules

**AI Features**
- `ai.view_suggestions` — See AI-generated recommendations and scores
- `ai.generate_quote` — Trigger AI quote generation
- `ai.override` — Modify or reject AI recommendations
- `ai.auto_pricing` — Enable AI to apply pricing automatically (no manual approval)
- `ai.auto_emails` — Enable AI to send emails automatically (no manual approval)

**Analytics & Reports**
- `analytics.view_operations` — View operational reports (jobs, crew, fleet)
- `analytics.view_sales` — View sales reports (leads, quotes, conversion)
- `analytics.view_financial` — View financial reports (revenue, payments, invoices, margins)
- `analytics.export` — Export reports to CSV or PDF

**Settings**
- `settings.company` — Edit company profile and branding
- `settings.templates` — Edit document and email templates
- `settings.services` — Manage service catalog and pricing
- `settings.users` — Invite and manage Office users
- `settings.permissions` — Manage permission groups and assignments
- `settings.integrations` — Manage third-party integrations
- `settings.legal_text` — Edit service agreement text and document legal footer content (sensitive — changes have legal implications)
- `settings.banking` — Edit bank details shown on invoices and receipts (sensitive — restricted to prevent payment redirection fraud)

---

### External Actor 1: Customer

**Who they are:** The individual or business requesting moving services.

**What they need:**
- A simple way to request a quote
- A clear, professional quote to review and accept
- Real-time communication about their job
- An easy way to pay

**Interaction points:** Quote request form → quote review portal → booking confirmation → pre-move communications → day-of tracking → invoice → payment → review request.

**Frustrations today:** Long wait for quotes. No visibility into where the crew is. Paper contracts. Surprise charges.

---

### External Actor 2: Corporate Client / HR Manager

**Who they are:** An HR manager or mobility manager at a company that regularly relocates employees.

**What they need:**
- A portal to submit relocation requests
- Status tracking across multiple active relocations
- Cost reporting by employee and department
- Invoicing that integrates with their accounts payable

**Interaction points:** Corporate portal → relocation request → approval workflow → status dashboard → consolidated invoicing.

---

## 4. Core Job Lifecycle

Every job in Bivro progresses through a defined lifecycle. All modules, features, and automations map to one or more stages of this lifecycle.

```
LEAD → SURVEY → QUOTE → BOOKING → PREPARATION → EXECUTION → COMPLETION → BILLING → CLOSED
```

### Stage 1: LEAD
A customer has expressed interest. Source: web form, phone call, marketplace, referral, manual entry.

**System actions:**
- Lead created in CRM
- AI scores lead (likelihood to convert, estimated job value)
- Automatic assignment to available estimator
- Notification sent to estimator
- Auto-response sent to customer (acknowledgment + expected response time)

**Human actions:**
- Estimator reviews lead details
- Estimator contacts customer to schedule survey or gather inventory details

---

### Stage 2: SURVEY
The inventory and scope of the move are determined. Can be in-person, virtual video call, or AI-assisted self-survey (customer describes via form or chat).

**System actions:**
- Survey scheduled on estimator calendar
- Customer receives survey confirmation and reminder
- AI pre-populates estimated inventory from customer description
- Video survey link generated (if virtual)

**Human actions:**
- Estimator conducts survey
- Estimator confirms or adjusts AI inventory estimate
- Estimator notes access conditions, special items, distance factors

---

### Stage 3: QUOTE
The price for the move is calculated and presented to the customer.

**System actions:**
- AI generates quote from inventory + distance + service type + market rates
- Quote PDF generated automatically
- Quote sent to customer via email with tracking pixel
- Estimator notified when customer opens the quote
- Automated follow-up scheduled if quote unopened after 24h

**Human actions:**
- Estimator reviews AI-generated quote before sending (optional, configurable)
- Estimator adjusts if needed
- Estimator approves send

---

### Stage 4: BOOKING
Customer accepts the quote and commits to the move.

**System actions:**
- Customer signs digital service agreement (auto-generated)
- Deposit payment collected via Stripe
- Booking confirmation sent to customer
- Job created in dispatch system
- Crew availability checked for requested date

**Human actions:**
- Customer signs and pays deposit (self-serve)
- Dispatcher reviews job and confirms it can be staffed

---

### Stage 5: PREPARATION
The job is made ready for execution.

**System actions:**
- Crew assigned based on availability and skills
- Vehicle assigned
- Customer receives pre-move checklist and preparation instructions
- Crew receives job details on mobile app
- Certificate of Insurance (COI) generated if required
- Customer confirmation reminder sent 48h before move
- Crew reminder sent 24h before move

**Human actions:**
- Dispatcher confirms crew and vehicle assignment
- Dispatcher communicates any special requirements to crew lead

---

### Stage 6: EXECUTION
The move is in progress.

**System actions:**
- Crew lead clocks in (location-verified)
- Job status changes to "In Progress" automatically
- Customer receives "Your crew is on the way" notification with ETA
- Digital inventory checklist activated for crew lead
- Damage photo documentation enabled
- Real-time status visible to dispatcher

**Human actions:**
- Crew lead confirms inventory at pickup with customer
- Crew lead documents any pre-existing damage with photos
- Crew executes the move
- Crew lead confirms delivery completion
- Customer signs digital delivery receipt

---

### Stage 7: COMPLETION
The move is physically done. Documentation is finalized.

**System actions:**
- Job status changed to "Completed"
- All damage photos and signed documents stored
- Final invoice generated (deposit deducted automatically)
- Post-move survey sent to customer
- Review request sent (Google, Yelp, or in-app)
- Job summary PDF generated for company records

**Human actions:**
- Crew lead captures customer signature on delivery receipt
- Dispatcher marks job as complete if crew lead hasn't

---

### Stage 8: BILLING
The customer is invoiced and payment is collected.

**System actions:**
- Final invoice sent to customer automatically
- Payment reminder sent if invoice unpaid after 48h
- Payment processed via Stripe on customer action
- Payment confirmation sent to customer and owner
- Revenue recorded in financial module

**Human actions:**
- Accountant reviews invoice for accuracy (optional, configurable)
- Accountant follows up on overdue invoices

---

### Stage 9: CLOSED
The job is fully resolved. All revenue recognized, all documents stored.

**System actions:**
- Job archived with full documentation
- Customer added to retention audience
- Referral request sent (if customer review was 4+ stars)
- Company analytics updated

---

## 5. Modules

Bivro is composed of eleven core modules. Each module is a self-contained domain within the platform.

---

### Module 1: CRM & Lead Management

The system of record for all customer relationships and inbound interest.

**Purpose:** Ensure no lead falls through the cracks. Give estimators a complete view of every prospect. Track conversion from first contact to booking.

**Core capabilities:**
- Lead capture from multiple sources (web form, phone log, marketplace, manual)
- Lead scoring (AI-generated, based on inventory size, move distance, timeline, responsiveness)
- Lead assignment rules (round-robin, by territory, by availability)
- Pipeline view (Kanban by lifecycle stage)
- Contact and company records
- Interaction history (calls logged, emails sent/opened, quotes sent/viewed)
- Follow-up tasks and reminders
- Lost reason tracking
- Referral source attribution

---

### Module 2: AI Quoting Engine

The core competitive advantage of Bivro. The quotation system is designed to be significantly better than anything in traditional moving software.

**Purpose:** Eliminate the 20–45 minutes a human estimator spends building a quote. Produce a quote in under 60 seconds that is accurate enough for the operator to approve without line-by-line review — while also supporting fully manual quote creation for operators who prefer complete control.

---

#### 2.1 Three Quotation Workflows

The quoting engine supports three modes. The operator chooses which to use on any given quote.

**Mode 1 — Fully Manual**
The operator builds the quote entirely from scratch. They select services from the catalog, enter quantities, set prices, apply discounts, and define every line item. No AI involvement unless explicitly triggered. This is for operators who want complete control or for jobs that don't fit standard patterns.

**Mode 2 — Fully AI-Generated**
The operator provides the job details (inventory description, addresses, access conditions). The AI generates the complete quote — services, quantities, hours, pricing — and presents it for review. The operator reviews and approves with a single click, or edits any element before sending. The AI quote is always a starting point, never a final decision.

**Mode 3 — Hybrid (Recommended)**
The AI generates a draft quote based on available information. The operator reviews, adjusts line items, changes pricing, removes services, adds custom items, and applies discounts. This is the default workflow for most operators: AI handles the 80%, human handles the 20%.

**Critical rule:** Regardless of mode, every quote element — every service, every price, every quantity — is editable by any user with the `quotes.edit` permission. No value generated by AI is locked.

---

#### 2.2 Service Catalog

Each company owns its own isolated service catalog. Bivro seeds an initial set of standard moving-industry services at company creation; the company controls its catalog from that point forward. The initial seed is a versioned onboarding template, not a permanent product invariant — Bivro may update the seed set in future product versions without affecting existing companies.

**Initial seed catalog (19 services — V1 onboarding template):**

| # | Service | Default Pricing Mode | Category |
|---|---------|---------------------|----------|
| 1 | Moving Labor | Hourly | Labor |
| 2 | Packing Service | Hourly | Labor |
| 3 | Packing Materials | Quantity | Materials |
| 4 | Furniture Lift (stair/elevator carry) | Fixed or Hourly | Labor |
| 5 | Furniture Disassembly | Fixed or Hourly | Labor |
| 6 | Furniture Assembly | Fixed or Hourly | Labor |
| 7 | Disposal / Junk Removal | Fixed or Quantity | Specialty |
| 8 | Cleaning Service | Hourly | Labor |
| 9 | Storage (monthly) | Fixed per period | Specialty |
| 10 | Long-Distance Transport | Distance | Transport |
| 11 | Piano Moving | Fixed | Specialty |
| 12 | Safe Moving | Fixed | Specialty |
| 13 | Crane Service | Fixed | Specialty |
| 14 | Specialty Items (artwork, antiques) | Manual | Specialty |
| 15 | Fuel Surcharge | Percentage or Fixed | Surcharge |
| 16 | Travel Surcharge | Distance | Surcharge |
| 17 | Long Carry Surcharge | Fixed per occurrence | Surcharge |
| 18 | Stair Surcharge | Fixed per flight | Surcharge |
| 19 | Elevator Wait Surcharge | Hourly | Surcharge |

**Service catalog lifecycle — what each company can do:**

- **Activate / deactivate** seeded services — an inactive service is hidden from the quote builder but preserved; the company can reactivate it at any time
- **Configure** each service: display name (customer-facing and internal-facing names may differ), description, default pricing mode, default unit price, default cost price, default VAT rate
- **Control display order** — services are sorted by a configurable `sort_order` field within each category
- **Create unlimited custom services** — the Owner or an Office user with `settings.services` permission can create services that do not exist in the seed set, with full configuration of all service fields
- **Archive custom services** — a custom service that is no longer offered is archived; it becomes unavailable in the quote builder but is preserved for historical integrity

**What companies cannot do:**
- Permanently delete a seeded (system default) service — they can only deactivate it
- Delete any service that appears on historical quotes or invoices — the service record must be preserved for audit and snapshot integrity

**Historical snapshot protection rule:**
When a service is renamed, repriced, deactivated, or archived, all existing quote line items and invoice line items are unaffected. Line items are immutable snapshots: they store the service name, pricing, and all financial values at the time the quote was created. The `service_catalog_id` on a quote item is a nullable reference — if the service is archived, the ID is preserved but the line item's own `name`, `unit_price_cents`, and all other fields remain exactly as they were quoted. Historical AI learning evidence (quote outcomes, margin data, AI corrections) is similarly immutable and is never retroactively changed by service catalog modifications.

**Custom services:** Any Office user with `settings.services` permission can create custom services. Custom services follow the same pricing modes, field structure, and lifecycle rules as seeded services, except they can be fully deleted by the Owner if they have never appeared on any quote or invoice.

**AI service recommendations:**
The AI may recommend:
1. Existing active services from the company's catalog
2. Relevant inactive seeded services the company has deactivated — surfaced as a suggestion to reactivate, not activated silently
3. Creation of a new custom service, if the AI observes a recurring unbilled pattern (e.g., a service type consistently added as a free-text custom item on quotes)

**The AI never silently creates, activates, modifies, or deactivates a service.** Every AI recommendation about the service catalog requires explicit human approval before any catalog change occurs. Approving an AI service recommendation is a deliberate Owner or authorized Office action.

---

#### 2.3 Quote Line Items

Every line item on a quote (whether from the service catalog or added manually) supports the following fields:

| Field | Description |
|-------|-------------|
| Service / Name | The service being billed. Selected from catalog or entered freely. |
| Description | Optional detail shown to the customer on the PDF. |
| Pricing mode | `fixed` / `hourly` / `quantity` / `distance` / `manual` |
| Quantity | Number of units (hours, items, miles, etc.) |
| Unit label | "hours", "items", "miles", "m³", "boxes", etc. |
| Unit price (sell) | Price charged to the customer per unit |
| Cost price | Internal cost to the company per unit (hidden from non-authorized users) |
| Margin % | Computed: `(sell - cost) / sell × 100`. Displayed to users with `quotes.view_cost_price`. |
| VAT rate | VAT percentage applied to this line item (defaults to company VAT setting) |
| VAT amount | Computed: `unit_price × quantity × vat_rate / 100` |
| Discount type | `percent` or `fixed` |
| Discount value | The discount amount or percentage |
| Discount amount | Computed from discount type and value |
| Net total | `unit_price × quantity - discount_amount` |
| Gross total (inc. VAT) | `net_total + vat_amount` |
| Internal notes | Notes visible only to office users. Not shown on the customer-facing PDF. |
| Customer notes | Notes visible to the customer on the quote PDF. |

**Pricing modes in detail:**

- `fixed` — Total is the unit price × quantity. No formula applied beyond quantity.
- `hourly` — Quantity is hours. Unit price is the hourly rate. Total = hours × rate.
- `quantity` — Standard unit-based billing. Total = quantity × unit price.
- `distance` — Quantity is distance (miles or km). Unit price is the per-unit rate. Total = distance × rate.
- `manual` — Operator enters the total directly. No formula enforced. Use for negotiated or custom pricing.

---

#### 2.4 Quote Financial Summary

Every quote calculates and displays:

| Field | Calculation |
|-------|-------------|
| Subtotal (excl. VAT, excl. discount) | Sum of all line item `unit_price × quantity` |
| Total discounts | Sum of all line item discount amounts |
| Total VAT | Sum of all line item VAT amounts |
| **Quote Total** | Subtotal − discounts + VAT |
| Deposit amount | `total × deposit_percent / 100` |
| Balance due at completion | `total − deposit` |
| Total cost (internal) | Sum of all line item `cost_price × quantity` |
| Gross margin (internal) | `(total − total_cost) / total × 100` |

The `Total cost` and `Gross margin` fields are visible only to users with `quotes.view_cost_price`.

---

#### 2.5 AI Estimation Engine

When AI generates a quote (Mode 2 or Mode 3), it produces an **AI Estimation** that includes:

**Operational recommendations:**
- Recommended crew size (number of movers)
- Recommended crew composition (e.g., 1 foreman + 2 movers)
- Recommended vehicle type (cargo van / 16ft box truck / 24ft box truck)
- Number of vehicles required
- Estimated total working hours
- Estimated loading time
- Estimated travel time
- Estimated unloading time
- Estimated packing effort (hours of packing service)
- Carrying effort assessment (long carry required? stairs? elevator wait?)
- Furniture lift requirement (yes/no, estimated time)
- Recommended buffer time
- Recommended start time (based on job length and working hours)

**Financial recommendations:**
- Recommended selling price per service
- Estimated total quote value
- Expected profit margin (based on company's cost rates)

Every recommendation is displayed with the AI's confidence score and can be overridden by the operator before the quote is finalized.

---

#### 2.6 AI Data Sources

The AI estimation engine bases its recommendations on:

**Job inputs (required):**
- Inventory list (natural language or structured)
- Pickup address
- Delivery address
- Floor number at origin (with elevator/stair flag)
- Floor number at destination (with elevator/stair flag)
- Estimated walking distance from truck to door
- Parking situation (street, loading dock, no parking)

**Contextual inputs:**
- Move distance (computed from addresses)
- Day of week and season (traffic patterns, demand)
- Property size category (studio / 1BR / 2BR / etc.)
- Access conditions notes (free text)

**Historical inputs (company-specific, from the company's job history):**
- Average hours for similar jobs (same property size + distance range)
- Historical crew sizes for similar jobs
- Previous price adjustments by estimator (operator learning)
- Customer-reported satisfaction vs. AI estimate accuracy

**Future inputs (V2+):**
- Uploaded photos of the property
- Video walkthrough (AI visual analysis)
- Voice notes (speech to text → AI parsing)

---

#### 2.7 Core Quoting Capabilities (Summary)

- Natural language inventory input → structured item list (AI)
- Room-by-room structured inventory input (manual)
- Photo/video inventory upload and AI parsing (V2+)
- Cubic footage and weight estimation
- Distance calculation (origin to destination, with stops)
- Service catalog integration (default + custom services)
- All five pricing modes on any line item
- Full cost price, margin, VAT, and discount per line item
- Quote versioning (revise without losing original)
- Quote comparison view for the customer
- Confidence score on AI-generated estimates
- AI estimation panel (crew, vehicles, hours, margins)
- Quote PDF generation (branded)
- Digital signature and deposit collection via Customer Portal
- Every AI recommendation is editable and overridable

---

### Module 3: Job Management & Dispatch Board

The operational nerve center. Where dispatchers manage every active and upcoming job.

**Purpose:** Give dispatchers complete visibility and control over all jobs. Make scheduling conflicts visible before they happen. Enable instant reassignment when things go wrong.

**Core capabilities:**
- Dispatch board (Kanban by status: Scheduled, In Progress, Completed, Cancelled)
- Calendar view (day, week, month)
- Job detail view (all information about a single job)
- Drag-and-drop rescheduling
- Crew assignment with availability conflict detection
- Vehicle assignment with capacity validation
- Real-time job status (updated by crew mobile app)
- Multi-stop job support
- Recurring job support (storage, corporate accounts)
- Job notes and internal communication
- Document attachments
- Conflict alerts (double-booked crew, vehicle unavailable, COI expired)

---

### Module 4: Crew & Workforce Management

The people layer. Profiles, availability, skills, performance, and compensation.

**Purpose:** Know who is available, who is best for each job, and how the team is performing. Reduce the management overhead of a variable, often part-time workforce.

**Core capabilities:**
- Crew member profiles (contact info, role, skills, certifications, vehicle license class)
- Availability calendar (crew self-updates availability; dispatcher sees it)
- Shift scheduling
- Clock in/out with GPS verification
- Hours tracking and timesheet generation
- Performance metrics (jobs completed, customer ratings, damage incidents)
- Skills and certifications tracking
- Onboarding status
- Emergency contact information
- Document storage (driver's license, certifications, contracts)
- Mass communication (send update to all crew members)

---

### Module 5: Fleet Management

Vehicle records, maintenance, and assignment.

**Purpose:** Know which vehicles are available, which are in maintenance, and whether a vehicle has sufficient capacity for an assigned job.

**Core capabilities:**
- Vehicle records (make, model, year, license plate, VIN, capacity in cubic feet)
- Insurance and registration document storage with expiry alerts
- Maintenance schedule and history
- Availability status (available, in use, in maintenance, out of service)
- Fuel log (optional)
- Assignment history
- Capacity validation against job inventory estimate

---

### Module 6: Customer Portal

A self-service portal for customers to track their move, sign documents, and pay.

**Purpose:** Reduce inbound customer calls by giving customers visibility. Elevate the perceived professionalism of every moving company using Bivro.

**Core capabilities:**
- Unique, shareable link per customer (no account creation required)
- Quote review and approval
- Digital signature on service agreement
- Deposit and final payment
- Move status tracking (Booked → Scheduled → In Progress → Completed)
- Document downloads (signed agreement, invoice, receipt)
- Pre-move checklist (what to do before the crew arrives)
- Day-of crew tracking (crew departure, ETA, arrival)
- Post-move survey
- Review submission

---

### Module 7: Document Engine

Automatic generation of all documents in the moving workflow.

**Purpose:** Eliminate manual document creation. Every document — quote, contract, inventory list, invoice, damage report — should be generated automatically from data already in the system, with company branding.

**Documents generated:**
- Quote / Estimate (PDF, branded)
- Service Agreement / Contract (legally formatted, digital signature enabled)
- Bill of Lading (BOL) — origin and destination
- Pre-move Inventory List
- Damage Report (with photos embedded)
- Delivery Receipt (with signature)
- Invoice (with deposit deduction)
- Payment Receipt
- Certificate of Insurance (COI) — via integration
- Moving Checklist (customer-facing)
- Job Summary Report (internal)

**Core capabilities:**
- Company logo and branding applied to all documents
- Template customization
- Dynamic data population from job record
- Digital signature (DocuSign-grade, legally binding)
- PDF generation and download
- Document version history
- Document storage with job record
- Bulk document generation

---

### Module 8: Communications Engine

Automated, personalized communications to customers and crew across the job lifecycle.

**Purpose:** Ensure every customer touchpoint is professional, timely, and consistent — without the operator sending a single email manually.

**Channels:** Email, SMS (future), in-app notification, Customer Portal notification.

**Trigger-based sequences:**

*Customer sequences:*
- Lead acknowledgment (immediate on form submit)
- Quote follow-up sequence (if unopened after 24h, 48h, 72h)
- Booking confirmation
- Pre-move preparation instructions (7 days before)
- Move day reminder (48h before)
- Move day confirmation (morning of)
- Crew on the way notification (with ETA)
- Post-move thank you + review request
- Invoice notification
- Payment reminder (if unpaid after 48h)
- Payment confirmation
- Referral request (if review was 4+)

*Crew sequences:*
- Job assignment notification
- Job details reminder (24h before)
- Schedule change alert
- Company announcements

**Core capabilities:**
- Visual sequence builder (drag-and-drop)
- Template library (pre-built for every trigger point)
- AI-generated email body (personalized with customer name, move details)
- Email open and click tracking
- SMS sequences (Phase 2)
- Unsubscribe management (CAN-SPAM/GDPR compliant)
- Communication history on customer record
- A/B testing on subject lines

---

### Module 9: Payments & Billing

The financial transaction layer. Collecting deposits, final payments, and managing invoices.

**Purpose:** Make getting paid effortless. Eliminate the gap between a job completing and money arriving in the operator's account.

**Core capabilities:**
- Stripe Connect integration (operator connects their Stripe account)
- Online payment links (sent with quote and invoice)
- Deposit collection at booking
- Remaining balance collection at completion
- Multiple payment methods (card, ACH/bank transfer)
- Automatic receipt generation
- Partial payment support
- Refund processing
- Outstanding invoice aging report
- Revenue recognition (matches payment to job date)
- Export to QuickBooks / Xero
- Bivro payment processing (take-rate revenue — see business model)

---

### Module 10: Analytics & Reporting

Business intelligence for the operator and finance team.

**Purpose:** Give every operator the financial and operational clarity that only large companies currently have. Make the answer to "how is the business doing?" visible in 10 seconds, not 10 hours.

**Dashboard types:**
1. Executive Dashboard (owner view — revenue, jobs, margins, trends)
2. Operations Dashboard (dispatcher view — today's jobs, crew status, upcoming week)
3. Sales Dashboard (estimator view — pipeline, conversion rate, quote velocity)
4. Financial Dashboard (accountant view — invoices, payments, aging, revenue by period)

**Reports available:**
- Revenue by period (day, week, month, quarter, year)
- Revenue by service type (local, long-distance, packing, storage)
- Revenue by crew (crew profitability)
- Revenue by source (how customers found us)
- Jobs by status
- Conversion rate (leads → quotes → bookings)
- Average job value
- Average quote response time
- Customer satisfaction score (CSAT from post-move survey)
- Crew utilization rate
- Vehicle utilization rate
- Outstanding receivables and aging
- Damage incident rate
- Cancellation and no-show rate

**Core capabilities:**
- Real-time data (not end-of-day batch)
- Date range filtering
- Export to CSV, PDF
- Scheduled email delivery of reports
- Trend indicators (vs. prior period)
- Goal setting and progress tracking

---

### Module 11: Settings & Administration

Company configuration, user management, permission management, and platform controls.

**Purpose:** Allow the Owner to configure Bivro to match their exact business — service catalog, pricing rules, document templates, team structure, and granular permissions — without requiring a developer.

**Core capabilities:**

*Company*
- Company profile (name, logo, address, contact info, license numbers)
- Branding (logo, colors, email header/footer)
- Business hours and holiday schedule
- Service area configuration (geography, distance limits)
- Default tax / VAT rate

*Services & Pricing*
- Service catalog management (add, edit, deactivate services)
- Default pricing mode per service
- Default prices per service
- Rate matrix configuration (local rates, long-distance rates, by distance band)
- Surcharge rules (stairs, elevator, long carry, fuel, travel)
- Default quote deposit percent
- Default quote expiry period
- Default invoice payment terms

*Team & Permissions*
- User management (invite Office users via email)
- Permission Groups (create, name, configure, assign)
- Per-user permission assignments (add to groups, individual overrides)
- View audit log of all permission changes
- Deactivate users

*Documents & Templates*
- Document template customization (quote, contract, invoice, BOL)
- Custom terms and conditions (shown on quotes and invoices)
- Email template library (edit subject lines, body, footer)
- Email signature configuration

*Integrations*
- Stripe Connect (payment processing setup)
- QuickBooks (accounting export)
- Google Calendar (job sync)
- Resend (email delivery — Bivro-managed, no config needed)

*Subscription*
- Bivro plan management
- Usage and billing history
- Add-on AI credits

---

## 6. Pages & Screens

Every screen in the Bivro platform, organized by surface area.

---

### 6.1 Web Application — Operator Dashboard

#### /dashboard (Home)
The first screen every operator sees on login.

**Components:**
- Today's jobs summary (count by status: scheduled, in progress, completed)
- Revenue today / this week / this month (with trend vs. prior period)
- Crew status snapshot (available, assigned, off today)
- Open leads count + oldest open lead age
- Pending quotes (sent, not yet accepted)
- Outstanding invoices (count + total value)
- Upcoming jobs next 7 days (mini calendar)
- AI insight card ("3 quotes haven't been opened in 48h — follow up?")
- Recent activity feed

---

#### /leads
Lead list and pipeline management.

**Views available:**
- Kanban (by lifecycle stage)
- List (sortable by date, value, source, score)
- Map (geographic distribution of leads)

**Components:**
- Filter bar (date range, source, status, assigned estimator)
- Search
- "Add Lead" button (manual entry)
- Lead cards (name, source, estimated value, age, AI score, assigned to)
- Bulk actions (assign, archive, export)

---

#### /leads/[id]
Individual lead record.

**Components:**
- Lead header (name, phone, email, status badge, AI score)
- Action bar (Create Quote, Schedule Survey, Log Call, Send Email, Convert, Archive)
- Move details panel (origin, destination, move date, service type)
- AI inventory estimate (expandable)
- Interaction timeline (all emails, calls, notes, quote views)
- Quote history (all quotes sent to this lead)
- Notes (internal)
- Assigned estimator
- Source attribution

---

#### /quotes
Quote list.

**Components:**
- Filter bar (status: draft, sent, viewed, accepted, expired, declined)
- Search by customer name
- Quote cards (customer, job date, value, status, last activity)
- Quick actions (send, duplicate, archive)

---

#### /quotes/new
AI Quote Builder.

**This is the most important page in the application.**

**Components:**
- Customer selector or quick-add
- Move type selector (local, long-distance, international, commercial)
- Origin address input (with Google Maps autocomplete)
- Destination address input (with Google Maps autocomplete)
- Move date preference
- Inventory input panel:
  - AI chat input ("I have a king bed, sectional sofa, 3 dressers...")
  - OR room-by-room structured input
  - OR upload a previous quote / photo for AI parsing
- AI-generated inventory list (editable, with item-by-item quantities)
- Volume and weight estimate (AI-calculated, shown with confidence indicator)
- Add-on services panel (packing, unpacking, disassembly, storage, specialty items)
- Access conditions panel (stairs at origin, elevator, parking, long carry)
- Rate calculation breakdown (visible, line by line)
- Total price display (prominent)
- Adjustments panel (manual override with reason required)
- Quote expiry date
- Internal notes
- Action bar: Save Draft | Preview PDF | Send to Customer

---

#### /quotes/[id]
Quote detail.

**Components:**
- Quote header (customer, job date, total value, status)
- Status timeline (drafted → sent → viewed → accepted/declined)
- Quote line items (full breakdown)
- Customer view tracking (opened at, how many times)
- Version history
- Action bar (Resend, Revise, Convert to Booking, Archive)
- Activity log

---

#### /jobs
Dispatch board (primary operations view).

**Views available:**
- Kanban (by status: Scheduled, In Progress, Completed, Cancelled)
- Timeline / Gantt (jobs across time, crews as rows)
- Calendar (day/week/month)
- List (filterable, sortable)

**Components:**
- Date navigator
- Filter bar (crew, vehicle, status, service type)
- Job cards (customer, origin city → destination city, time, crew, status)
- Drag-and-drop reschedule (on Timeline view)
- "Add Job" button
- Live status indicators (color-coded by status)
- Alert badges (conflicts, overdue, no crew assigned)

---

#### /jobs/[id]
Job detail — the master record for a single move.

**Components:**
- Job header (job number, customer, status badge, move date)
- Action bar (Edit, Reassign Crew, Cancel, Archive)
- Status timeline (Booked → Crew Assigned → Reminder Sent → In Progress → Completed → Invoiced → Paid)
- Move details panel (origin, destination, service type, estimated duration, special instructions)
- Customer panel (name, phone, portal link, communication history)
- Crew panel (assigned crew members, lead, vehicle)
- Quote / pricing panel (quoted amount, deposit paid, balance due)
- Documents panel (contract, BOL, inventory list, damage report, invoice)
- Photos panel (pre-move and post-move photos, damage documentation)
- Activity log (all events, automated and manual, with timestamps)
- Internal notes
- Customer communications preview (all automated emails sent)

---

#### /jobs/new
Manual job creation (for phone bookings).

**Components:**
- Customer selector or quick-add
- Link to existing quote or create quote inline
- Move details form
- Date and time
- Crew assignment
- Vehicle assignment
- Notes

---

#### /customers
Customer list (all contacts, past and present).

**Components:**
- Search
- Filter (by status: active lead, customer, past customer, corporate)
- Customer table (name, phone, jobs count, total revenue, last job date, rating)
- Export

---

#### /customers/[id]
Customer record.

**Components:**
- Customer header (name, contact info, type: residential/corporate, average rating)
- Action bar (New Quote, Log Call, Send Email, Add Note)
- Job history (all past and current jobs with status and value)
- Quote history
- Communication timeline
- Documents (all documents associated with this customer)
- Notes
- Referral source
- Internal tags

---

#### /crew
Crew management list.

**Components:**
- Crew member cards (name, role, status today, next scheduled job)
- Availability calendar toggle
- Filter by role, status, availability
- "Add Crew Member" button

---

#### /crew/[id]
Individual crew member profile.

**Components:**
- Profile header (name, role, contact, start date)
- Action bar (Edit, Message, Deactivate)
- Today's assignment
- Upcoming schedule
- Availability calendar
- Performance metrics (jobs completed this month, average rating, damage incidents)
- Document storage (license, certifications)
- Timesheet / hours log
- Notes (internal, not visible to crew)

---

#### /fleet
Vehicle list and status.

**Components:**
- Vehicle cards (name/plate, type, capacity, status, assigned to today)
- Maintenance alerts
- "Add Vehicle" button

---

#### /fleet/[id]
Vehicle detail.

**Components:**
- Vehicle header (name, plate, make/model/year, capacity)
- Current status and assignment
- Insurance and registration (with expiry alerts)
- Maintenance history
- Assignment history

---

#### /invoices
Invoice management.

**Components:**
- Filter (status: draft, sent, viewed, paid, overdue, void)
- Invoice table (customer, job, amount, due date, status)
- Aging summary (total outstanding, <30 days, 30–60 days, 60+ days)
- Bulk actions (send reminders, export)

---

#### /invoices/[id]
Invoice detail.

**Components:**
- Invoice header (invoice number, customer, job, status)
- Invoice line items
- Payment history (deposit recorded, balance due)
- Payment link (copy, resend)
- Action bar (Mark Paid, Void, Duplicate, Download PDF)
- Activity log

---

#### /analytics
Analytics and reporting hub.

**Sub-pages:**
- /analytics/overview (executive dashboard)
- /analytics/operations (dispatcher view)
- /analytics/sales (estimator view)
- /analytics/finance (accountant view)
- /analytics/reports (report library — generate and export)

---

#### /settings
**Sub-pages:**
- /settings/company (profile, branding, contact, tax/VAT)
- /settings/services (service catalog: add, edit, deactivate services + pricing modes)
- /settings/rates (rate matrix, surcharges, default deposit %, quote expiry, payment terms)
- /settings/team (invite Office users, view all users, deactivate users)
- /settings/permissions (Permission Groups: create, configure, assign to users)
- /settings/documents (template customization, terms and conditions)
- /settings/communications (email templates, automation sequences, email signature)
- /settings/integrations (Stripe, QuickBooks, Google Calendar)
- /settings/billing (Bivro subscription, usage, invoices, AI credits)
- /settings/notifications (personal notification preferences)

---

### 6.2 Customer Portal (External)

A public-facing, brandable portal accessible via unique link. No login required.

#### /portal/[token] — Customer Home
- Move status indicator (large, clear: "Your move is scheduled for July 15")
- Key dates and timeline
- Assigned company contact (name, phone)
- Quick action buttons: Review Quote | Sign Agreement | Pay Deposit | Download Documents

#### /portal/[token]/quote
- Full quote breakdown
- Line items with descriptions
- Accept / Request Changes buttons
- Chat with estimator

#### /portal/[token]/sign
- Service agreement viewer
- Digital signature pad
- Date auto-populated
- Submit confirmation

#### /portal/[token]/pay
- Invoice or deposit amount
- Stripe payment form (card, ACH)
- Payment confirmation page

#### /portal/[token]/track
- Day-of tracking (available on move day only)
- Crew status ("On the way" / "Arrived at pickup" / "In transit" / "Arriving soon")
- Estimated arrival time
- Crew lead name and photo

#### /portal/[token]/documents
- All documents for this move (quote, agreement, invoice, receipt)
- Download PDF buttons

#### /portal/[token]/review
- Post-move satisfaction survey (1–5 stars + open comment)
- Google review redirect (if rating 4+)

---

### 6.3 Mobile Application (Crew)

Native mobile experience for crew leads and crew members. iOS and Android.

#### Crew Home Screen
- Today's job card (prominent, large)
- Clock in button (activates on job start time - 30 min)
- Next job (if multi-job day)
- Messages from dispatcher

#### Job Detail (Mobile)
- Full job info: customer name, origin address, destination address
- Map navigation (opens native maps app)
- Move notes and special instructions
- Customer contact (tap to call)
- Dispatcher contact (tap to call)

#### Inventory Checklist (Mobile)
- AI-generated checklist from quote
- Check off items as loaded
- Add items not on list
- Notes per item

#### Damage Documentation (Mobile)
- Camera access (take photo)
- Damage description (voice or text)
- Item association (link photo to inventory item)
- Customer signature on damage acknowledgment

#### Clock Out / Job Complete
- Confirm all items delivered
- Customer signature capture
- Final notes
- Submit

---

## 7. Feature Registry

All features classified by priority. P0 = must exist at launch. P1 = must exist in v1.0. P2 = future roadmap.

### P0 — Launch Critical (MVP)

| ID | Feature | Module |
|----|---------|--------|
| F001 | Lead capture form (web embed) | CRM |
| F002 | Manual lead creation | CRM |
| F003 | Lead list view (Kanban + list) | CRM |
| F004 | Lead detail record | CRM |
| F005 | Customer record creation | CRM |
| F006 | AI inventory parser (natural language → item list) | AI Quoting |
| F007 | Quote calculation engine (inventory + distance + rates) | AI Quoting |
| F008 | Quote PDF generation (branded) | AI Quoting + Documents |
| F009 | Quote send via email | AI Quoting + Communications |
| F010 | Quote open tracking | AI Quoting |
| F011 | Quote accept / decline (customer portal) | Customer Portal |
| F012 | Digital service agreement | Documents |
| F013 | Digital signature capture | Documents |
| F014 | Deposit payment via Stripe | Payments |
| F015 | Job creation from accepted quote | Job Management |
| F016 | Dispatch board (Kanban view) | Job Management |
| F017 | Job detail page | Job Management |
| F018 | Crew member profiles | Crew Management |
| F019 | Crew assignment to job | Job Management |
| F020 | Job status updates | Job Management |
| F021 | Invoice generation | Payments |
| F022 | Invoice send to customer | Payments + Communications |
| F023 | Online payment (Stripe) | Payments |
| F024 | Payment receipt generation | Documents |
| F025 | Basic email automation (booking confirmation, job reminder) | Communications |
| F026 | Customer portal (quote, sign, pay, status) | Customer Portal |
| F027 | Owner/Admin dashboard | Analytics |
| F028 | User management (invite Office users) | Settings |
| F029 | Company profile and branding | Settings |
| F030 | Rate matrix configuration | Settings |
| F031 | Permission Groups (create, configure, assign) | Settings |
| F032 | Per-user permission overrides | Settings |
| F033 | Service catalog (default + custom services) | Settings / AI Quoting |
| F034 | Manual quote mode (fully operator-controlled, no AI) | AI Quoting |
| F035 | Cost price and margin per quote line item | AI Quoting |
| F036 | VAT per quote line item | AI Quoting |
| F037 | Discount per quote line item (percent or fixed) | AI Quoting |
| F038 | Internal notes and customer notes per line item | AI Quoting |
| F039 | Five pricing modes per line item (fixed/hourly/quantity/distance/manual) | AI Quoting |
| F040 | AI estimation panel (crew, vehicle, hours recommendations) | AI Quoting |

---

### P1 — Version 1.0

| ID | Feature | Module |
|----|---------|--------|
| F041 | Lead scoring (AI) | CRM |
| F042 | Lead auto-assignment rules | CRM |
| F043 | Pipeline conversion metrics | CRM |
| F044 | Quote versioning | AI Quoting |
| F045 | Quote comparison (customer-facing) | AI Quoting |
| F046 | Seasonal rate adjustments | AI Quoting |
| F047 | Quote follow-up automation (unopened sequence) | Communications |
| F048 | Dispatch calendar view (day/week) | Job Management |
| F049 | Drag-and-drop rescheduling | Job Management |
| F050 | Crew availability calendar | Crew Management |
| F051 | Scheduling conflict detection | Job Management |
| F052 | Vehicle management | Fleet |
| F053 | Vehicle assignment with capacity validation | Fleet |
| F054 | Crew mobile app (iOS + Android) | Mobile |
| F055 | Digital inventory checklist (mobile) | Mobile |
| F056 | Damage documentation with photos (mobile) | Mobile |
| F057 | Clock in/out with GPS | Mobile |
| F058 | Customer day-of tracking | Customer Portal |
| F059 | Bill of Lading generation | Documents |
| F060 | Pre-move checklist (customer) | Documents |
| F061 | Damage report PDF | Documents |
| F062 | Post-move survey | Communications |
| F063 | Review request automation | Communications |
| F064 | Full email sequence builder | Communications |
| F065 | Operations dashboard | Analytics |
| F066 | Sales dashboard | Analytics |
| F067 | Financial dashboard | Analytics |
| F068 | Revenue reports | Analytics |
| F069 | Export to CSV | Analytics |
| F070 | QuickBooks integration | Integrations |
| F071 | Google Calendar sync | Integrations |
| F072 | Multi-location support | Settings |
| F073 | Service area configuration | Settings |
| F074 | Document template customization | Settings |
| F075 | Outstanding invoice aging report | Payments |
| F076 | Partial payment support | Payments |
| F077 | ACH / bank transfer payment | Payments |
| F078 | Referral request automation | Communications |
| F079 | AI insight notifications ("3 quotes unopened") | Analytics |
| F080 | Gross margin report (cost vs. revenue per job) | Analytics |

---

### P2 — Future Roadmap

| ID | Feature | Module |
|----|---------|--------|
| F081 | SMS automation | Communications |
| F082 | In-app chat (operator ↔ customer) | Communications |
| F083 | AI voice survey (customer describes inventory by phone) | AI Quoting |
| F084 | AI damage assessment from photos | AI Quoting |
| F085 | Predictive demand forecasting | Analytics |
| F086 | Crew performance scoring | Crew Management |
| F087 | Crew payroll export | Crew Management |
| F088 | Marketplace (customer ↔ operator matching) | Marketplace |
| F089 | Customer marketplace listing | Marketplace |
| F090 | Lead marketplace (operators bid on jobs) | Marketplace |
| F091 | Embedded moving insurance | Insurance |
| F092 | Corporate relocation portal | Corporate |
| F093 | Corporate multi-job dashboard | Corporate |
| F094 | Corporate consolidated invoicing | Corporate |
| F095 | API (public, for integrations) | Platform |
| F096 | Webhooks | Platform |
| F097 | Partner / developer marketplace | Platform |
| F098 | White-label (enterprise) | Platform |
| F099 | AI schedule optimization (optimal crew+vehicle+route) | AI |
| F100 | Xero integration | Integrations |
| F101 | Predictive maintenance alerts (fleet) | Fleet |
| F102 | Customer lifetime value scoring | CRM |
| F103 | A/B testing on quote email subject lines | Communications |
| F104 | Market intelligence reports (industry benchmarks) | Analytics |
| F105 | Multi-currency support | Platform |
| F106 | Multi-language support (UI) | Platform |
| F107 | Advanced reporting builder (custom reports) | Analytics |
| F108 | Revenue sharing for referral partners | CRM |
| F109 | Storage facility management | Operations |
| F110 | Long-distance carrier coordination | Operations |
| F111 | Custom roles (beyond Owner + Office) | Settings |
| F112 | Crew login and mobile crew app (V2 role: crew) | Mobile |
| F113 | Photo/video AI inventory parsing | AI Quoting |

---

## 8. User Stories & Acceptance Criteria

Stories are organized by the user role performing the action and tied to the job lifecycle.

---

### 8.1 Lead Management

**US-001**
*As an Estimator, I want to be notified immediately when a new lead is submitted, so I can respond before the customer contacts a competitor.*

**Acceptance Criteria:**
- When a lead is submitted via the web form, the assigned estimator receives an in-app notification and email within 60 seconds.
- The notification includes: customer name, move type, origin city, destination city, and estimated move date.
- The lead appears in the Kanban board under "New" stage.
- The customer receives an automatic acknowledgment email within 60 seconds of submitting the form.

---

**US-002**
*As an Owner, I want leads to be automatically scored by AI, so my estimators focus their energy on the most valuable opportunities.*

**Acceptance Criteria:**
- Every lead receives an AI score (1–10) within 60 seconds of creation.
- Score is based on: estimated job size, move distance, timeline urgency, source quality, and response completeness.
- Score is visible on the lead card and detail page.
- Leads can be sorted and filtered by score.
- Score updates if lead information changes.

---

**US-003**
*As an Estimator, I want to see a complete history of all interactions with a lead in one place, so I never lose context when following up.*

**Acceptance Criteria:**
- Lead detail page shows a chronological timeline of all events: form submission, emails sent, emails opened, calls logged, notes added, quotes sent, quote viewed.
- Each event shows timestamp and acting user (or "Automated by Bivro").
- Adding a note or logging a call takes no more than 2 clicks.
- Email open/click events are tracked and shown automatically without manual action.

---

### 8.2 Quoting

**US-004**
*As an Estimator, I want to paste or type a customer's inventory description and have Bivro generate a complete quote, so I can respond to a lead in under 5 minutes.*

**Acceptance Criteria:**
- Estimator enters free-text inventory description ("I have a queen bed, 2 nightstands, a sectional sofa, dining table with 6 chairs, and about 30 medium boxes").
- AI parses the input and produces a structured item list within 10 seconds.
- Each item shows: name, quantity, estimated cubic footage, estimated weight.
- Estimator can add, edit, or remove items before proceeding.
- Distance is calculated automatically from origin/destination addresses.
- Quote total is calculated in real time as inventory changes.
- The full quote is ready to preview in PDF within 30 seconds of completing the inventory.

---

**US-005**
*As an Estimator, I want to know when a customer has opened my quote, so I can follow up at the right moment.*

**Acceptance Criteria:**
- When a customer opens the quote link, the estimator receives an in-app notification and email within 2 minutes.
- The quote record shows: number of times opened, first open timestamp, most recent open timestamp.
- If a quote has not been opened within 24 hours, an automated follow-up email is sent to the customer.
- The estimator can configure or disable this automation in settings.

---

**US-006**
*As a Customer, I want to review, accept, and pay my deposit for a quote from my phone without creating an account, so I can confirm my move quickly.*

**Acceptance Criteria:**
- The quote link works on mobile without requiring account creation or app download.
- The quote is readable on a 390px wide screen without horizontal scrolling.
- "Accept Quote" button is visible without scrolling on most phones.
- After accepting, the customer proceeds immediately to sign the service agreement.
- After signing, the customer proceeds to pay the deposit.
- Deposit can be paid by credit card in under 60 seconds.
- Confirmation page and email are sent immediately after payment.

---

### 8.3 Dispatch & Operations

**US-007**
*As a Dispatcher, I want to see all of today's jobs in a single view with live status, so I know what is happening without calling the crews.*

**Acceptance Criteria:**
- The dispatch board loads with all today's jobs by default.
- Each job card shows: customer name, origin/destination city, scheduled time, assigned crew, current status.
- Status updates made by crew on mobile (clock in, job start, job complete) are reflected on the dispatch board within 30 seconds without page refresh.
- Jobs are color-coded by status (scheduled=gray, in progress=blue, completed=green, problem=red).
- A crew member showing as "Late" (not clocked in within 15 minutes of job start) triggers a visual alert.

---

**US-008**
*As a Dispatcher, I want to assign a crew to a job and be warned if there is a scheduling conflict, so I never accidentally double-book a crew member.*

**Acceptance Criteria:**
- When assigning a crew member to a job, the system checks their schedule for the same time period.
- If a conflict exists, a modal warning is shown before the assignment is saved.
- The warning shows: the conflicting job name, date, and time.
- The dispatcher can override the conflict warning (with confirmation) if needed.
- The conflicted crew member receives a notification if they are double-booked.

---

**US-009**
*As a Crew Lead, I want to receive all job details on my phone the day before, so I can prepare without calling the office.*

**Acceptance Criteria:**
- Crew lead receives a push notification and in-app message 24 hours before each assigned job.
- The mobile job detail shows: customer name, pickup address (with map link), delivery address (with map link), scheduled start time, special instructions, inventory list, and dispatcher contact.
- Job detail is accessible without internet connection (cached on device).
- Crew lead can tap the address to open navigation in Google Maps or Apple Maps.

---

### 8.4 Billing & Payments

**US-010**
*As an Accountant, I want the invoice to be automatically generated when a job is marked complete, so there is no delay between job completion and billing.*

**Acceptance Criteria:**
- When job status is set to "Completed," a draft invoice is automatically generated.
- Invoice includes: job number, customer details, move date, service line items, deposit paid (deducted), balance due, payment link, and due date (default: 7 days, configurable).
- Invoice is in draft state by default, allowing accountant review before send.
- A setting allows automatic send immediately on completion (bypassing draft state).
- Customer receives invoice email with payment link.
- Invoice is stored on the job record and customer record.

---

**US-011**
*As a Customer, I want to pay my final invoice online from my phone, so I don't have to write a check or call with my card number.*

**Acceptance Criteria:**
- Invoice email contains a unique payment link.
- Payment page works on mobile without app download.
- Payment page shows: invoice number, itemized charges, amount due, payment form.
- Customer can pay by credit card or ACH bank transfer.
- Payment confirmation email is sent immediately.
- Invoice status changes to "Paid" automatically.
- Operator receives notification of payment.

---

### 8.5 Analytics

**US-012**
*As an Owner, I want to see this month's revenue vs. last month on my dashboard, so I know immediately whether my business is growing.*

**Acceptance Criteria:**
- Dashboard shows current month revenue (sum of all payments received this calendar month).
- Comparison to prior month shown as: absolute difference and percentage change.
- Trend indicator (arrow up/down) with color (green/red) is visible at a glance.
- Revenue figure updates in real time as payments are received (no page refresh required).
- Clicking the revenue figure navigates to the Financial Dashboard report.

---

## 9. KPIs & Success Metrics

### 9.1 Product Health KPIs (Internal)

| KPI | Definition | Target (MVP) | Target (v1.0) |
|-----|-----------|-------------|--------------|
| Time to first quote | Time from lead creation to quote sent | < 10 min | < 5 min |
| Quote acceptance rate | Quotes accepted / quotes sent | > 35% | > 45% |
| Booking conversion rate | Bookings / leads | > 15% | > 22% |
| Job on-time rate | Jobs started within 30 min of schedule | > 80% | > 90% |
| Invoice payment rate | Invoices paid within 14 days / total invoices | > 70% | > 85% |
| Platform CSAT | Post-move customer satisfaction (1–5) | > 4.0 | > 4.3 |

### 9.2 Business Health KPIs (Operator-facing)

| KPI | Definition |
|-----|-----------|
| Revenue this month | Total payments received (current month) |
| Revenue vs. prior month | % change month-over-month |
| Pipeline value | Total value of all open quotes |
| Average job value | Total revenue / number of completed jobs |
| Lead response time | Average time from lead creation to first estimator action |
| Crew utilization rate | Hours worked / available hours |
| Damage rate | Jobs with documented damage / total jobs |
| Customer satisfaction | Average rating from post-move surveys |
| Net Promoter Score (NPS) | Derived from post-move survey |

### 9.3 SaaS Platform KPIs (Bivro business)

| KPI | Target |
|-----|--------|
| Monthly Recurring Revenue (MRR) | Primary growth metric |
| Net Revenue Retention (NRR) | > 110% at 12 months |
| Monthly Churn Rate | < 2.5% |
| Customer Acquisition Cost (CAC) | < $600 blended |
| Time to Value (TTV) | First quote sent < 24h from signup |
| Daily Active Usage (DAU/MAU) | > 60% (dispatchers should be daily) |
| Feature Adoption — AI Quoting | > 80% of quotes generated by AI |
| Feature Adoption — Online Payment | > 70% of invoices paid online |
| Support Ticket Volume per Customer | < 1 per month at steady state |

---

## 10. MVP Scope

The MVP is the smallest version of Bivro that a real moving company would pay for and use as their primary operational tool. It must replace spreadsheets, email, and phone calls for the core job workflow.

### MVP Definition

The MVP is scoped to complete the full job lifecycle — from lead capture to payment — for a single-location moving company with up to 10 crew members.

### MVP Includes

**CRM & Leads:**
- Manual lead creation (F002)
- Lead list view (F003)
- Lead detail record (F004)
- Customer record (F005)

**AI Quoting:**
- AI inventory parser (F006)
- Quote calculation engine (F007)
- Quote PDF generation (F008)
- Quote send via email (F009)
- Quote open tracking (F010)

**Booking:**
- Customer portal — quote accept + sign (F011, F012, F013)
- Deposit payment (F014)

**Job Management:**
- Job creation from quote (F015)
- Dispatch board Kanban (F016)
- Job detail page (F017)
- Crew assignment (F019)
- Job status updates (F020)

**Billing:**
- Invoice generation (F021)
- Invoice send (F022)
- Online payment (F023)
- Payment receipt (F024)

**Communications:**
- Booking confirmation email (F025)
- Job reminder email (F025)

**Administration:**
- Owner dashboard (simplified) (F027)
- User management (F028)
- Company profile + branding (F029)
- Rate matrix configuration (F030)

### MVP Excludes

- Crew mobile app (dispatcher manually updates job status)
- Advanced analytics
- Damage documentation
- Fleet management (vehicle tracking is manual)
- Email sequence builder
- Multi-location
- Integrations (QuickBooks, Google Calendar)
- Lead scoring
- Customer day-of tracking
- All P2 features

### MVP Success Criteria

- An operator with no training can capture a lead, generate a quote, collect a signature, and receive a payment in under 30 minutes from first login.
- The AI quoting engine produces a quote accurate within ±15% of what the operator would have manually quoted, on 80% of test cases.
- Zero critical data loss incidents in the first 90 days.
- At least 5 paying operators complete 10+ jobs per month on the platform in Month 1.
- Average operator CSAT: 4.0/5 or above.

### MVP Non-Goals

- The MVP is not a complete company management system.
- The MVP is not multi-tenant enterprise-ready.
- The MVP does not include a mobile app.
- The MVP does not need advanced analytics or reporting.
- The MVP does not need marketplace functionality.

---

## 11. Version 1.0 Scope

Version 1.0 is the full commercial product. It is the version positioned for market expansion, press coverage, and the first paid marketing campaigns.

### V1.0 Definition

V1.0 adds the crew mobile app, full analytics, advanced communications automation, fleet management, integrations, and multi-location support — making Bivro capable of running a regional moving company with multiple teams and locations.

### V1.0 Additions to MVP

All P1 features (F041–F080), which include:

- Lead scoring and auto-assignment (F041, F042)
- Quote versioning and follow-up automation (F044, F047)
- Scheduling conflict detection (F042)
- **Crew mobile app — iOS and Android** (F045)
- Digital inventory checklist on mobile (F046)
- Damage documentation with photos (F047)
- Clock in/out with GPS (F048)
- Customer day-of crew tracking (F049)
- Bill of Lading and damage report PDFs (F050, F052)
- Post-move survey and review automation (F053, F054)
- Full email sequence builder (F055)
- Operations, Sales, and Financial dashboards (F056, F057, F058)
- Revenue and performance reports (F059)
- QuickBooks integration (F061)
- Google Calendar sync (F062)
- Multi-location support (F063)
- AI insight notifications (F070)

### V1.0 Success Criteria

- 100+ paying operators on the platform.
- Average monthly churn below 3%.
- Net Revenue Retention above 100% (existing customers expanding usage).
- AI quoting engine accurate within ±10% on 90% of quotes.
- App Store rating ≥ 4.5 for mobile app.
- Operator CSAT ≥ 4.3/5.
- At least one enterprise account (20+ trucks) live on the platform.

---

## 12. Future Roadmap

Organized by strategic horizon.

---

### Horizon 1 — Expansion (Months 9–18 post-MVP)

Focus: Grow the operator network. Add monetization layers beyond subscriptions.

| Initiative | Description |
|-----------|-------------|
| SMS automation | Add SMS channel to all communication sequences |
| Payment processing take-rate | Activate Bivro's revenue on payments processed |
| ACH bank transfer | Lower-cost payment option for large invoices |
| Xero integration | Accounting export for non-QuickBooks users |
| Custom report builder | Operators build their own reports |
| AI schedule optimization | AI proposes optimal crew/vehicle/route combinations |
| Referral program | Operators earn credits for referring other operators |

---

### Horizon 2 — Marketplace (Months 18–30 post-MVP)

Focus: Build the two-sided network. Make Bivro the place where customers find movers.

| Initiative | Description |
|-----------|-------------|
| Customer marketplace | Customers submit move requests and receive quotes from Bivro operators |
| Operator marketplace listings | Operators opt in to receive leads from Bivro marketplace |
| Lead marketplace (pay-per-lead) | Operators pay for matched leads |
| Verified operator badges | Trust signals for marketplace customers |
| Customer review aggregation | Public profiles for operators |
| Embedded moving insurance | Insurance offered at point of booking; Bivro earns distribution fee |

---

### Horizon 3 — Platform (Months 30–48 post-MVP)

Focus: Become infrastructure. Open to partners. Build the ecosystem.

| Initiative | Description |
|-----------|-------------|
| Public API | Third-party developers build on Bivro |
| Webhooks | Real-time event notifications for integrations |
| Partner marketplace | Third-party apps sold in Bivro marketplace |
| White-label (enterprise) | National movers run Bivro under their own brand |
| Corporate relocation portal | HR managers submit and track employee relocations |
| Data intelligence reports | Industry benchmarks sold to enterprise and carriers |
| Multi-currency support | Serve international markets |
| Multi-language UI | French, Spanish, German, Arabic, Portuguese |

---

### Horizon 4 — Vertical Expansion (Months 48–72 post-MVP)

Focus: Apply the Bivro platform to adjacent on-site service industries.

| Vertical | Entry Point |
|---------|------------|
| Junk removal and hauling | Identical crew-dispatch model, smaller inventory |
| Cleaning services | Recurring jobs, subscription depth |
| Specialty transport | Art, vehicles, medical equipment |
| Storage facility management | Natural extension of moving |
| Home services | Larger market; plumbing, electrical, HVAC |

---

## Appendix A: Terminology Glossary

| Term | Definition |
|------|-----------|
| Lead | A prospective customer who has expressed interest in moving services |
| Quote | A formal price estimate sent to a customer |
| Booking | A confirmed job with signed agreement and deposit paid |
| Job | An active or completed moving engagement |
| Crew | A team of movers assigned to a job |
| Crew Lead | The senior mover responsible for a crew |
| Dispatcher | The operator role responsible for scheduling and crew coordination |
| BOL | Bill of Lading — the legal document confirming items transported |
| COI | Certificate of Insurance — required by many buildings for movers |
| Long carry | Additional charge when the truck cannot park near the building entrance |
| Deposit | Partial payment collected at booking to secure the date |
| Balance | Remaining amount due after the deposit, collected at or after job completion |
| Portal | The customer-facing web page for a specific job |
| AI Score | Bivro's machine-generated assessment of lead quality or job complexity |

---

## Appendix B: Out of Scope (Explicit Exclusions)

The following are explicitly outside Bivro's scope in all defined phases:

- **Physical logistics / route optimization for freight** (Bivro is for crews, not fleets of delivery trucks)
- **Warehouse management** (beyond basic storage facility support)
- **Real estate transaction management** (Bivro serves movers, not agents)
- **Full payroll processing** (Bivro exports to payroll; it is not a payroll system)
- **Customer-initiated self-booking without operator involvement** (operators remain in control of their pricing and availability)

---

*This document is the single source of truth for all product decisions in Bivro. Features not defined here require a product review before implementation. Any implementation decision that contradicts this document requires this document to be updated first.*
