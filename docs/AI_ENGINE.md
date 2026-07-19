# Bivro — AI Engine Architecture

**Version:** 1.0  
**Status:** Authoritative Reference — AI Intelligence Layer  
**Owner:** Engineering / AI  
**Last updated:** 2026-06-30

> This document defines the intelligence architecture of Bivro. No AI feature, no AI model call, and no AI data structure may be designed without aligning with the principles and specifications defined here. The AI Engine is Bivro's primary competitive advantage. Treat this document with the same authority as the database schema.

---

## Table of Contents

1. [Core Philosophy](#1-core-philosophy)
2. [The Company AI Brain](#2-the-company-ai-brain)
3. [Portal Architecture and AI Access Layers](#3-portal-architecture-and-ai-access-layers)
4. [Tenant Isolation and Privacy](#4-tenant-isolation-and-privacy)
5. [AI Memory System](#5-ai-memory-system)
6. [AI Observation Engine](#6-ai-observation-engine)
7. [AI Quote Engine](#7-ai-quote-engine)
8. [AI Business Coach](#8-ai-business-coach)
9. [AI Profit Analysis Engine](#9-ai-profit-analysis-engine)
10. [AI Replay Engine](#10-ai-replay-engine)
11. [AI Simulation Engine](#11-ai-simulation-engine)
12. [AI Digital Twin](#12-ai-digital-twin)
13. [AI Safety Framework](#13-ai-safety-framework)
14. [AI Model Strategy](#14-ai-model-strategy)
15. [Prompt Architecture](#15-prompt-architecture)
16. [The Learning Feedback Loop](#16-the-learning-feedback-loop)
17. [AI Task Catalogue](#17-ai-task-catalogue)
18. [AI Database Schema](#18-ai-database-schema)
19. [Cost Management](#19-cost-management)
20. [V1 Implementation vs. V2+ Vision](#20-v1-implementation-vs-v2-vision)

---

## 1. Core Philosophy

### 1.1 AI Assists. Humans Decide.

Every AI output in Bivro is a proposal. Not a decision.

The AI estimates the crew size. The dispatcher confirms or changes it. The AI drafts the email. The estimator reviews and sends it. The AI generates the quote. The operator approves or edits it. This is not a feature limitation — it is a design principle that defines what Bivro is.

Moving companies operate with their reputation. A wrong crew size causes a bad review. A wrong price loses a job or loses money. A wrong email damages a customer relationship. These are consequential decisions. The human who runs the business must always be in the loop. The AI is there to make that loop faster, not to remove it.

**The invariant:** No AI output ever executes automatically without human approval, unless an operator has explicitly configured an automation rule for that specific scenario — and even then, the automation can always be disabled.

### 1.2 The AI Is Not a Chatbot

Bivro's AI is not a general-purpose assistant that answers questions. It is a **domain intelligence layer** embedded in every workflow in the platform.

It is not ChatGPT. It is not Copilot. It is the invisible engine that makes every screen in Bivro smarter. It pre-fills forms, anticipates decisions, surfaces risks, and synthesizes information so that every operator can operate like they have the knowledge of someone who has completed ten thousand moves.

### 1.3 The AI Gets Smarter Over Time

The first quote Bivro generates for a company will be good. The hundredth will be better. The thousandth will be the most accurate estimate that company has ever produced.

This is the compounding value of the AI architecture. The system is designed not just to call an AI model, but to learn from every interaction, remember every correction, and continuously calibrate its understanding of how each individual company operates.

### 1.4 The AI Is Honest About Uncertainty

Every AI output carries a confidence score. The AI does not pretend to be certain when it is not. A low-confidence recommendation is surfaced as such, prompting the operator to apply more judgment. High confidence is earned through data — more jobs, more corrections, more feedback.

The AI never outputs a single number and calls it a recommendation without explaining what it is based on and what assumptions were made.

---

## 2. The Company AI Brain

### 2.1 Overview

Every company on Bivro has its own **Company AI Brain** — a personalized, isolated intelligence layer that accumulates knowledge about that company over time. The Brain is not a separate system. It is the synthesis of:

1. **Company Memory** — structured patterns, preferences, and learned behaviors stored in the database
2. **Historical Data** — the company's actual jobs, quotes, corrections, and outcomes
3. **Company Context** — compiled fresh on every AI request made for that company

```
┌──────────────────────────────────────────────────────────┐
│                   Company AI Brain                        │
│               (per-tenant, fully isolated)                │
│                                                          │
│  ┌─────────────────┐   ┌──────────────────┐             │
│  │  Company Memory │   │  Historical Data │             │
│  │  (patterns,     │   │  (jobs, quotes,  │             │
│  │   preferences,  │   │   outcomes,      │             │
│  │   corrections)  │   │   corrections)   │             │
│  └────────┬────────┘   └────────┬─────────┘             │
│           │                     │                        │
│           └──────────┬──────────┘                        │
│                      ▼                                    │
│            ┌─────────────────┐                           │
│            │ Context Builder │                           │
│            │  (compiled per  │                           │
│            │   AI request)   │                           │
│            └────────┬────────┘                           │
│                     │                                    │
│                     ▼                                    │
│            ┌─────────────────┐                           │
│            │  Claude API     │                           │
│            │  (informed by   │                           │
│            │  company brain) │                           │
│            └────────┬────────┘                           │
│                     │                                    │
│                     ▼                                    │
│         ┌───────────────────────┐                        │
│         │  Structured Output +  │                        │
│         │  Confidence + Reason  │                        │
│         └───────────────────────┘                        │
└──────────────────────────────────────────────────────────┘
```

### 2.2 What the Brain Knows

The Company AI Brain maintains awareness across six domains:

**Operational knowledge**
- Types of moves the company handles (local, long-distance, commercial)
- Average crew sizes per property type and move type
- Typical job duration per property size
- Vehicle usage patterns (which truck for which job size)
- Geographic patterns (where customers come from, where they go)

**Financial knowledge**
- Average pricing per service type
- Typical margin range the company operates in
- Common discount patterns
- Which services are almost always added together
- Which jobs tend to run over estimate and by how much

**Customer knowledge**
- Repeat customer preferences
- Customers who have raised price objections
- Customers with documented access challenges

**Operator behavior**
- How often the operator increases or decreases AI-suggested hours
- Which AI recommendations are accepted vs. modified
- Common manual additions the operator makes to AI-generated quotes
- Corrections that recur systematically (patterns, not noise)

**Seasonal patterns**
- Busy periods (summer months, end of month, weekends)
- Revenue variance by season
- Crew availability constraints by period

### 2.3 The Context Compilation Process

Every time an AI task is triggered for a company, the **Context Builder** compiles a company context package and injects it into the system prompt alongside the task-specific input:

```
Company Context (compiled per AI request)
─────────────────────────────────────────
company_profile:
  - company name, location, service area
  - primary move types (local 70%, long_distance 25%, commercial 5%)
  - active services in catalog

operational_baselines (last 90 days):
  - avg crew size by property size (studio: 2, 1BR: 2, 2BR: 3, 3BR: 4...)
  - avg hours by move type + property size
  - avg distance for local jobs
  - avg vehicle type by job size

pricing_patterns:
  - avg hourly rate (labor)
  - avg margin per service type
  - common discount % applied

confirmed_patterns (from AI Memory Tier 1):
  - patterns the operator confirmed for automatic application

recent_corrections (last 30 days):
  - count and type of AI recommendation overrides
  - most frequently modified fields

active_context:
  - today's date, day of week, season
  - jobs scheduled today/tomorrow
```

---

## 3. Portal Architecture and AI Access Layers

### 3.1 Overview

Bivro operates across two distinct portal layers, each with different access to AI capabilities and AI data. The AI Engine must understand which portal layer is making a request and enforce the appropriate access boundaries at every point.

```
┌─────────────────────────────────────────────────────────────┐
│                    Bivro Platform                            │
│                                                             │
│  ┌──────────────────────────────────────────────────────┐  │
│  │         Bivro Admin Portal (app.bivro.io/admin)       │  │
│  │         Internal Bivro staff only                     │  │
│  │                                                       │  │
│  │  ● AI system health and performance metrics           │  │
│  │  ● Per-tenant token budget management                 │  │
│  │  ● AI cost attribution across all tenants             │  │
│  │  ● Prompt version management and deployment           │  │
│  │  ● Anonymized aggregate benchmarks                    │  │
│  │  ● AI incident investigation (with audit log)         │  │
│  │  ✗ NEVER raw company data, quotes, customers          │  │
│  └──────────────────────────────────────────────────────┘  │
│                                                             │
│  ┌──────────────────────────────────────────────────────┐  │
│  │       Company Tenant Portals (app.bivro.io/login)     │  │
│  │       One isolated portal per customer company        │  │
│  │                                                       │  │
│  │  ┌─────────────────┐   ┌──────────────────────────┐  │  │
│  │  │   Owner Login   │   │     Office Login         │  │  │
│  │  │  (unrestricted) │   │  (permission-gated AI)   │  │  │
│  │  │                 │   │                          │  │  │
│  │  │ ● All AI feats  │   │ ● AI features gated by   │  │  │
│  │  │ ● AI settings   │   │   Permission Groups       │  │  │
│  │  │ ● AI reports    │   │ ● Cannot configure AI     │  │  │
│  │  │ ● Monthly brief │   │   settings                │  │  │
│  │  │ ● Simulations   │   │ ● Cannot view AI costs   │  │  │
│  │  └─────────────────┘   └──────────────────────────┘  │  │
│  └──────────────────────────────────────────────────────┘  │
└─────────────────────────────────────────────────────────────┘
```

### 3.2 Bivro Admin Portal — AI Access

The Bivro Admin Portal is the internal control plane for Bivro staff (engineers, support, operations). It is a completely separate authentication domain from the company tenant portals.

**Bivro Admin users authenticate via a separate identity system.** They do not use the same Supabase Auth pool as company users. Admin sessions are short-lived, MFA-required, and every access is logged.

**What Bivro Admin can see in the AI layer:**

| Capability | Access Level | Notes |
|-----------|-------------|-------|
| System-wide AI request volume | Aggregated, no company names | Requests/hour across all tenants |
| Per-tenant token budget usage | Tenant ID + usage only, no content | To manage billing and quotas |
| AI error rates and failure types | Anonymized — no prompts or outputs visible | For system health monitoring |
| Prompt version deployment | Full access — prompts are system assets | Prompts contain no company data |
| AI cost by tenant | Tenant ID + cost only | For billing and quota enforcement |
| Individual AI log entry | Only with explicit incident flag + audit justification | Break-glass access for debugging a specific reported incident |

**What Bivro Admin can NEVER see without explicit audit-logged justification:**
- Customer names, addresses, or contact information
- Quote contents or pricing
- Job details
- AI-generated company recommendations
- Company AI memory patterns
- Any `ai_logs.prompt_content` or `ai_logs.response_content` without an incident flag

**Incident investigation access:**
When a company reports an AI error, Bivro support can request access to the specific AI log entry. This access:
- Requires entering an incident justification
- Is logged in `platform_audit_log` with the admin's identity, timestamp, and reason
- Expires after 24 hours (re-justification required for extended investigations)
- Is visible to the company owner upon request ("your data was accessed by Bivro support on [date] for [reason]")

### 3.3 Company Tenant Portal — AI Access by Role

**Owner (unrestricted)**

The Owner has access to every AI feature and every AI configuration option. No AI capability is ever hidden from the Owner.

| AI Capability | Owner |
|--------------|-------|
| AI Quote Engine (generate) | ✅ Always |
| AI Quote Engine (view reasoning) | ✅ Always |
| CEO Daily Brief | ✅ Always |
| AI Profit Analysis | ✅ Always |
| Post-Job Replay | ✅ Always |
| AI Simulations | ✅ Always |
| AI Memory (view patterns) | ✅ Always |
| AI Memory (confirm/dismiss observations) | ✅ Always |
| AI Settings (token budget, model preferences) | ✅ Always |
| Monthly Learning Report | ✅ Always |
| AI Cost Dashboard | ✅ Always |

**Office (permission-gated)**

Office users access AI features only if their Permission Group grants the corresponding permission. The permission key format follows `ai.{feature}`.

| AI Feature Permission Key | Controls |
|--------------------------|---------|
| `ai.quote_generate` | Can trigger AI quote generation |
| `ai.quote_view_reasoning` | Can see AI reasoning panel on quotes |
| `ai.lead_score_view` | Can see AI lead scores on leads list |
| `ai.email_draft` | Can use AI email drafting |
| `ai.replay_view` | Can view post-job replay analyses |
| `ai.coach_brief_view` | Can view the daily CEO brief |
| `ai.profit_analysis_view` | Can view profit analysis reports |
| `ai.simulation_run` | Can run business simulations |
| `ai.observations_manage` | Can confirm or dismiss AI observations |

AI settings, token budget, cost dashboards, and monthly learning reports are Owner-only and are never grantable to Office users.

### 3.4 Tenant Routing

When a user visits the Bivro login page, tenant routing ensures they are authenticated into the correct company context.

**Tenant identification methods (in priority order):**
1. **Subdomain routing:** `{company_slug}.app.bivro.io` — company is identified from the subdomain before the user logs in
2. **Login form:** User enters their email address; Bivro identifies the company from the email domain or from an email-to-tenant lookup table
3. **Invite link:** Onboarding links are tenant-scoped (`app.bivro.io/invite/{token}` where the token encodes the company)

Once authenticated, the Supabase JWT `app_metadata` contains:
```json
{
  "company_id": "uuid",
  "role": "owner" | "office",
  "permission_groups": ["uuid", "uuid"]
}
```

This JWT is the primary tenant identity carrier for every request, including AI requests. The AI Engine reads `company_id` from the JWT and uses it to scope all memory and context operations. Cross-tenant access is structurally impossible from the application layer.

### 3.5 AI Access Audit Logging

Every AI request made by an authenticated user is logged in `ai_logs` with the actor's identity:

```
ai_logs fields relevant to audit:
  company_id         — which tenant
  acting_user_id     — who triggered the request
  acting_user_role   — owner | office | bivro_admin
  task_type          — what AI capability was used
  created_at         — when
  ip_address         — client IP (for security audit)
```

For Bivro Admin access to company AI data, a separate `platform_audit_log` records every access with mandatory justification. These records are immutable (no UPDATE or DELETE) and retained for 7 years.

---

## 4. Tenant Isolation and Privacy

### 4.1 The Foundational Rule

**Company data never trains, informs, or influences any other company's AI.**

This is not a policy — it is an architectural constraint enforced at every layer.

| Layer | How Isolation Is Enforced |
|-------|--------------------------|
| Database | RLS policies restrict all AI memory tables to `company_id` |
| Context Builder | Context is compiled exclusively from that company's data. No other company's data is injected. |
| Prompt | System prompts require a `company_id` binding. Validated before dispatch. |
| AI Logs | Every AI call records `company_id`. Logs are never used for cross-company analysis without explicit anonymization. |
| Admin Access | Admin can see tenant ID and usage metrics, never prompt or response content without break-glass justification. |
| Model Fine-tuning (V2+) | Each fine-tuned model is trained on a single company's data. No shared training data. |

### 4.2 What IS Shared (System-Level Knowledge Only)

The base Claude model carries general moving industry knowledge that is not company-specific:

- Furniture types, box sizes, cubic footage estimates, standard terminology
- Distance and time calculations (geography, not pricing)
- Moving industry best practices (access challenges, stair charges, elevator waits)
- No company's pricing, customer data, or financial patterns

### 4.3 Future: Opt-In Anonymized Benchmarking

In V2+, companies may opt in to an anonymized benchmark program. Participation is:
- Explicit opt-in only — not enabled by default
- Limited to aggregated, anonymized statistics ("average margin for 2BR local moves in this region")
- Never includes customer names, addresses, job details, or company identifiers
- Governed by a separate data processing agreement

Companies that do not participate receive no degradation in AI quality.

---

## 5. AI Memory System

### 5.1 Purpose

The AI Memory System is the mechanism by which Bivro's AI accumulates company-specific knowledge over time. It transforms a generic AI model into an expert that knows this specific moving company better than any general-purpose assistant can.

Without memory: every AI call starts from scratch. The AI knows general industry knowledge, nothing specific.

With memory: the AI knows that this company always adds packing material for 3BR+ homes, always sends a furniture lift crew to fourth-floor apartments without an elevator, and typically discounts the rate by 5% for repeat customers.

### 5.2 Memory Architecture

AI Memory is structured in four tiers:

```
Tier 1 — Confirmed Patterns (highest trust)
  Operator-confirmed behavioral rules
  Example: "Always include furniture lift for floor 4+ without elevator"
  Storage: ai_company_patterns (is_confirmed = true)

Tier 2 — Observed Patterns (pending confirmation)
  AI-detected patterns not yet confirmed
  Example: "This company adds stair surcharge in 8/10 jobs with stairs"
  Storage: ai_company_observations (status = 'pending')

Tier 3 — Statistical Baselines (computed dynamically)
  Aggregated statistics from historical data
  Example: avg crew = 2.8 for 2BR local moves (from 47 jobs)
  NOT stored separately — compiled by Context Builder from existing data

Tier 4 — Episodic Memory (raw events)
  Every individual correction, override, and outcome
  Storage: ai_learning_events
  Used by Memory Updater to calibrate Tier 1 and Tier 2
```

### 5.3 Memory Categories

**Pricing Memory**
- Preferred hourly rate for each service type
- Typical margin per move type and property size
- Common discounts and conditions under which they are applied
- Historical price acceptance rate

**Operational Memory**
- Crew size by property type, move type, and floor
- Job duration by property size and distance
- Vehicle type and count by inventory size
- Jobs that historically run over estimate and by how much

**Service Memory**
- Services most frequently added together
- Services almost always included for certain job types
- Services the company rarely sells
- Customer segments that buy specific services

**Customer Memory**
- Repeat customer preferences
- Customers with known access challenges
- Customers who have price-negotiated
- Customers with high satisfaction records

**Correction Memory**
- Which AI recommendations the operator changes most frequently
- Magnitude and direction of typical changes
- Fields almost never corrected (high-confidence areas)
- Fields almost always corrected (low-confidence — prioritize for improvement)

**Seasonal Memory**
- Revenue and volume by month
- Crew availability by month
- Price sensitivity by season

### 5.4 Memory Update Triggers

| Event | Memory Effect |
|-------|--------------|
| Quote accepted without modification | Strong positive signal — pricing was well-received |
| Quote accepted after operator reduced price | Pricing was above market; learn the delta |
| Quote declined by customer | Potential over-pricing signal |
| Operator changed AI crew suggestion | Correction — learn adjustment magnitude |
| Operator changed AI hours suggestion | Correction — learn adjustment magnitude |
| Operator added a service AI didn't suggest | Service affinity signal |
| Operator removed a service AI suggested | Negative affinity signal |
| Job ran over estimate | Time estimation correction |
| AI Observation confirmed by operator | Elevate from Tier 2 to Tier 1 |
| AI Observation rejected by operator | Discard; reduce sensitivity for this pattern type |

### 5.5 Memory Decay

- **Confirmed patterns** persist until explicitly revoked by the operator
- **Statistical baselines** computed from a rolling 90-day window
- **Pricing patterns** computed from a 6-month window with recency weighting
- **Correction patterns** decay after sustained non-correction (the AI has learned correctly)

---

## 6. AI Observation Engine

### 6.1 Purpose

The Observation Engine is a passive, always-on pattern recognition layer. It continuously watches business activity and surfaces insights to the operator — without interrupting their workflow.

The Observation Engine does not make recommendations in real-time. It accumulates evidence, builds confidence, and surfaces a finding only when it is statistically significant.

### 6.2 Observation Generation

An observation is created when the engine detects a pattern that:
- Has occurred in at least 5 recent instances
- Has a consistency rate above 70%
- Represents something not already in the confirmed pattern set

**Observation structure:**
```
pattern_type:        service_affinity | crew_adjustment | time_adjustment | pricing_adjustment
description:         human-readable description of the detected pattern
evidence_count:      how many times observed
consistency_rate:    % of applicable cases where the pattern held
example_job_ids:     references to specific jobs showing the pattern
confidence:          evidence_count × consistency_rate × recency
recommendation:      "Should I apply this automatically in future?"
```

**Examples of generated observations:**

> *"You have included furniture lift on 9 of the last 11 jobs where the destination was floor 4 or higher without an elevator. Should I add furniture lift automatically for these cases?"*

> *"On 7 of your last 8 moves for 3-bedroom homes, you added packing material to the quote. Should I include packing material automatically when the inventory is 3BR or larger?"*

> *"You typically add 45 minutes to AI-estimated job time for moves involving staircases at both origin and destination. Should I build this into future estimates automatically?"*

### 6.3 Observation Surfacing

**Passive — AI Insights Card (Dashboard)**
A card on the dashboard lists pending observations. The operator reviews at their own pace. Each observation has three actions: **Confirm** (add to memory), **Dismiss** (not relevant), or **Remind Me Later**.

**Active — Inline Suggestion (Context-Triggered)**
When the operator is creating a quote that matches a pending observation's trigger conditions (e.g., floor 4, no elevator), the observation is surfaced inline in the quote builder with a one-click action. This delivers the insight at the moment of maximum relevance.

### 6.4 Observation → Confirmed Pattern

When an operator confirms an observation, it becomes a Confirmed Pattern (Tier 1 memory):

```
trigger_conditions:  {floor >= 4, has_elevator: false}
action:              auto_add_service("furniture_lift")
confirmed_at:        timestamp
confirmed_by:        user_id
evidence_at_time:    {count: 11, rate: 0.82}
```

From this point, the AI automatically applies the pattern when creating quotes that meet the trigger conditions. The result is always visible to the operator and always editable.

---

## 7. AI Quote Engine

### 7.1 Purpose

The AI Quote Engine transforms job details — inventory, addresses, access conditions — into a complete, accurate quote in under 60 seconds. It is not a calculator with an AI label. It is a reasoning system that understands the moving industry, knows this specific company, and produces an output that reflects how an experienced estimator would price this job.

### 7.2 Input Sources

**Required inputs:**
- Inventory (natural language or structured list)
- Pickup address (floor, elevator, stair count, parking situation)
- Delivery address (floor, elevator, stair count, parking situation)
- Move date
- Move type (local, long-distance, commercial, international)

**Optional inputs that improve accuracy:**
- Customer notes
- Property size category
- Walking distance from truck to door
- Room-by-room inventory
- Photos or video of the property (V2+)

**Company context (always injected):**
- Confirmed patterns from AI Memory (Tier 1)
- Statistical baselines per property type
- Company rate matrix and service pricing
- Day-of-week and seasonal factors

### 7.3 Estimation Components

**Operational Estimates:**

| Estimate | Description | Unit |
|---------|-------------|------|
| Crew size | Total movers required | Count |
| Crew composition | Foremen vs. movers | Roles |
| Vehicle type | Recommended category | Enum |
| Vehicle count | Number of vehicles | Count |
| Loading time | Time to load at origin | Hours |
| Travel time | Origin to destination (with traffic factor) | Hours |
| Unloading time | Time to unload at destination | Hours |
| Packing time | If packing service requested | Hours |
| Long carry effort | Extra time for long walking distance | Hours |
| Stair carry factor | Additional time multiplier for stairs | Factor |
| Elevator wait time | Estimated wait for shared elevator | Hours |
| Buffer time | Recommended safety buffer | Hours |
| Total estimated hours | Sum of all components | Hours |

**Financial Estimates:**

| Estimate | Description |
|---------|-------------|
| Labor cost | crew_size × hours × company_hourly_rate |
| Vehicle cost | vehicle_count × duration × vehicle_rate |
| Service costs | Per service (packing, furniture lift, specialty) |
| Surcharge costs | Stair, long carry, fuel, toll |
| Subtotal | Sum of all service costs |
| Recommended deposit | Based on company default deposit % |
| Estimated total cost (internal) | Company cost basis |
| Recommended sell price | Informed by company margin targets |
| Estimated margin | (sell − cost) / sell |
| Confidence score | 0–100 |

### 7.4 Confidence Score Calculation

```
Input completeness         (0–30 points)
  30 = full structured inventory
  20 = well-described natural language
  10 = brief description only
   0 = no inventory

Pattern match strength     (0–30 points)
  30 = >10 similar jobs in company history
  20 = 5–10 similar jobs
  10 = 1–4 similar jobs
   0 = no comparable history

Access condition clarity   (0–20 points)
  20 = all conditions specified
  10 = partial information
   0 = no access information

Seasonal/timing match      (0–10 points)
  10 = well-represented time period in data
   0 = unusual date/time with no comparable data

Historical correction rate (0–10 points)
  10 = AI estimates for this job type rarely corrected
   0 = this job type is frequently corrected

Total: 0–100. Displayed as "AI Confidence: 72/100"
```

A confidence score below 40 triggers a prominent advisory: **"Low confidence — recommend an in-person survey before sending to customer."**

### 7.5 Inventory Parsing

Natural language inventory is parsed into a structured item list before estimation begins.

**Input:** *"King bed with headboard, 2 dressers, sectional sofa, 42-inch TV, dining table with 6 chairs, washer/dryer, about 30 boxes, and some plants"*

**Output (structured):**
```
Furniture:
  king_bed_with_headboard   ×1   (58 cuft, 180 lbs)
  dresser_large             ×2   (32 cuft, 150 lbs each)
  sectional_sofa            ×1   (110 cuft, 400 lbs)
  tv_42_with_stand          ×1   (8 cuft, 60 lbs) ⚠ fragile
  dining_table_large        ×1   (42 cuft, 150 lbs)
  dining_chair              ×6   (8 cuft, 30 lbs each)

Appliances:
  washer_dryer_pair         ×1   (32 cuft, 250 lbs) ⚠ appliance service

Boxes:
  medium_box                ×30  (3 cuft, 30 lbs each)

Plants (estimated):
  plant_large               ×3   (6 cuft) ⚠ cannot stack

Total estimated volume:   ~540 cuft
Total estimated weight:   ~5,800 lbs
Property size assessment: 2BR–3BR

Flags:
  ⚠ Washer/dryer: confirm disconnection/reconnection service
  ⚠ TV: recommend TV crate or wardrobe box
  ⚠ Plants: require dedicated space; cannot be under heavy items
```

Every item is editable. The operator can add items, change quantities, adjust volume estimates, and flag special handling before the quote is sent.

### 7.6 Reasoning Output

Every Quote Engine result includes a reasoning panel visible to the operator:

```
AI Quote Reasoning
─────────────────────────────────────────────────────────────
Crew: 3 movers + 1 foreman (4 total)

Your company averages 3.8 crew for similar 2BR–3BR jobs.
Stair access at origin (3rd floor, no elevator) adds loading time
significantly. 4 crew reduces total time by ~1.2h vs. 3 crew,
which improves margin and customer experience.

Time: 6.5h (loading 2.5h + travel 0.5h + unloading 2.0h +
stair factor 1.0h + buffer 0.5h)

7 comparable jobs in your history (2BR–3BR, stair access) averaged
6.1h. Adding 0.4h buffer for washer/dryer handling and plant logistics.

Price: $1,890

6.5h × 4 crew × $68/hr = $1,768 labor.
Stair surcharge: $80 (your rate) × 3 flights at origin = $80.
Raw total: $1,848. Rounded to $1,890 — you typically round up ~2.3%.

Confidence: 73/100
Low factor: parking at origin not confirmed. Recommend verifying.
─────────────────────────────────────────────────────────────
```

### 7.7 Service Catalog Interaction Rules

The AI Quote Engine selects services from the company's catalog when generating a quote draft. The following rules govern all AI interactions with the service catalog.

**Rule 1 — Recommend only; never act unilaterally.**
The AI never creates, activates, modifies, deactivates, or archives a service catalog entry. Every AI recommendation about the service catalog requires explicit human approval before any catalog change occurs.

**Rule 2 — Service selection priority.**
When generating a quote, the AI selects services in this order:
1. **Active services** in the company's catalog — the primary pool
2. **Inactive seeded services** — if the AI determines a standard service is applicable but has been deactivated, it surfaces a suggestion to the operator: "This job may need [Service Name], which your company currently has deactivated. Would you like to add it to this quote, or reactivate it in your catalog?" The AI does not reactivate the service; it proposes.
3. **Free-text custom line item** — if neither an active nor an inactive seeded service covers the need, the AI adds a custom line item with a descriptive name and prompts the operator to review

**Rule 3 — Custom service pattern recommendation.**
If the AI observes a recurring free-text line item pattern across multiple quotes (e.g., operators manually adding "Gym Equipment Move" as a custom description 8 times in 3 months), it surfaces a recommendation: "You've manually added a similar service [N] times. Would you like to add 'Gym Equipment Move' to your service catalog?" The operator accepts or dismisses. If accepted, the catalog change is made by the operator, not by the AI.

**Rule 4 — Historical line items are immutable.**
The AI never modifies service names, prices, or configurations on historical quote items. If the AI detects that a historical quote used a price that has since changed in the catalog, it may surface this as a profit analysis observation — but never edits the historical record.

**Rule 5 — Inactive service transparency.**
When recommending an inactive service for reactivation, the AI always explains why: "Based on 5 of your recent quotes that manually included stair surcharges, reactivating the Stair Surcharge service would streamline this workflow." The operator decides.

---

## 8. AI Business Coach

### 8.1 The Daily CEO Brief

Every morning, the AI generates a **CEO Brief** — a synthesized, actionable view of the business for that day. It is delivered to the owner's dashboard and by email if configured.

The CEO Brief is not a report. It is a prioritized list of things that need the owner's attention, organized by urgency and opportunity value.

### 8.2 CEO Brief Structure

```
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  Bivro AI Brief — Monday, June 30, 2026
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

TODAY'S OPERATIONS
  ✅ 4 jobs scheduled. 3 crews assigned. 1 vehicle unassigned.
  ⚠️  Job JB-2026-0041 has no crew — scheduled in 3 days.
  ⚠️  Truck 2 registration expires in 8 days.

FOLLOW-UP REQUIRED
  📋 Quote QT-2026-0087 sent 3 days ago — not opened. Customer: Maria Santos.
     [Send Reminder] [Archive]
  📋 Quote QT-2026-0082 opened 4 times — no response in 2 days. Hot lead.
     [Call Now] [Send Follow-up]

REVENUE SNAPSHOT
  Month-to-date: $18,400 (on track for $26,000 projected)
  Outstanding invoices: $4,200 (oldest: 14 days overdue)
  Pipeline value (open quotes): $31,500

OPPORTUNITIES AI SPOTTED
  💡 3 jobs this week near the same destination area.
     Combining travel for Truck 1 could save ~2h of drive time.
  💡 Customer John Lee hasn't booked since March. He usually books
     every 4 months. Consider a check-in.
  💡 June is historically your busiest month (+23% vs. average).
     You have 6 open crew slots next week. Consider contacting
     part-time crew now.

RISKS
  🔴 Invoice INV-2026-0031 ($1,800) is 21 days past due. No response
     to 2 reminders. Consider a direct call.
  🟡 Quote acceptance rate dropped to 31% this month (vs. 45% average).
     3 recent declines mentioned "price was too high." Review rate matrix?
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
```

### 8.3 CEO Brief Categories

**Operational Alerts:** Jobs without crew, expiring compliance documents, double-booked resources, jobs approaching without confirmed details.

**Follow-Up Queue:** Quotes opened but not acted on (sorted by engagement intensity). Leads gone cold. Customers with outstanding invoices.

**Revenue Summary:** Month-to-date vs. projected. Outstanding receivables with aging. Pipeline value.

**Opportunities:** Route optimization. Repeat customer booking timing signals. Underutilized crew or vehicle days. Services that could have been added to recent jobs.

**AI Insights:** New Observations from the Observation Engine awaiting confirmation.

**Risks:** Overdue invoices needing escalation. Declining KPIs (acceptance rate, conversion rate, satisfaction). Compliance risks. Scheduling risks.

### 8.4 Brief Generation

Generated every morning at a configurable time (default: 7:00 AM in company timezone) via Vercel Cron. Uses `claude-sonnet-4-6` for narrative synthesis. Stored in `ai_coaching_briefs` for historical review.

---

## 9. AI Profit Analysis Engine

### 9.1 Purpose

The Profit Analysis Engine continuously monitors the financial performance of every job and surfaces insights that would otherwise require an accountant or a spreadsheet. It identifies profit leakage — the gap between what the company could have earned and what they actually earned.

### 9.2 Post-Job Profit Snapshot

After every job is complete and invoiced, the AI generates a Job Profit Snapshot:

```
Job JB-2026-0041 — Profit Snapshot
─────────────────────────────────────────────────────────────
Invoice total:    $1,890
Cost basis:       $1,210  (labor: $980, vehicle: $180, fuel: $50)
Gross margin:     36.0%   (target: 38%)

⚠️  Margin 2% below target (= $38 on this job)

Time analysis:
  Quoted: 6.5h → Actual: 7.8h  (overrun: +1.3h / +20%)
  Cost of overrun: $354 unbilled crew time

Unbilled potential:
  + $80   stair surcharge at destination (not quoted — access not confirmed)
  + $120  disposal service (crew removed 3 large items, not charged)
  Total missed: $200

Recommendations:
  → Add destination stair access to pre-job survey checklist
  → Add disposal service to quotes where customer notes mention
    "getting rid of" or "disposing of" items
─────────────────────────────────────────────────────────────
```

### 9.3 Aggregate Profit Analysis

**Lost Profit Categories:**

| Category | Description |
|----------|-------------|
| Time overruns (unbilled) | Jobs that ran longer than quoted and customers were not charged the difference |
| Forgotten services | Services needed but not quoted — discovered on job day |
| Low-margin job types | Job categories where margins are consistently below company target |
| Pricing inconsistency | Same service type priced differently with no discernible reason |
| Discount overuse | Discounts applied too frequently without a qualifying condition |

Each finding includes:
- The specific issue
- Estimated annual revenue impact if addressed
- The specific action to take
- The data the AI used

---

## 10. AI Replay Engine

### 10.1 Purpose

After every completed move, the AI performs a structured post-mortem comparing what was planned with what actually happened. This is the primary mechanism through which the AI improves its operational accuracy over time.

### 10.2 The Post-Job Replay

A Replay is triggered when a job is marked `completed` and actual start/end times are recorded.

```
Job Replay — JB-2026-0041 — Smith Family Move
─────────────────────────────────────────────────────────────
WHAT WENT WELL
  ✅ Crew arrived on time (scheduled 8:00 AM, arrived 7:55 AM)
  ✅ Customer satisfaction: 5/5
  ✅ No damage reported
  ✅ Invoice paid within 24h

WHAT COULD IMPROVE
  ⏱️  Time overrun: +1.3h (+20%)
     Quoted 6.5h → Actual 7.8h

     Additional time breakdown:
     - Destination spiral staircase, slower than estimated     +45 min
     - Parking search (no loading zone, parked 3 blocks away) +15 min
     - King-size bookcase not in customer inventory            +15 min

  💰 Revenue opportunity: $200
     - Stair surcharge not applied at destination
     - Disposal items removed but not charged

AI LEARNING APPLIED
  → Updated time estimate for "3rd floor, spiral staircase" access
  → Added "parking at destination" to pre-job checklist prompt
  → Flagged "bookcase" as commonly omitted from inventory descriptions

FOR NEXT SIMILAR JOB
  → Send pre-job survey 48h before to confirm access conditions
  → Specifically ask: "Is parking available within 50 feet of the entrance?"
  → Add 30-min buffer for 3+ floors without elevator
─────────────────────────────────────────────────────────────
```

### 10.3 Replay Learning Integration

| Replay Finding | Learning Event | Memory Update |
|---------------|---------------|---------------|
| Time overrun on stair jobs | Time estimation correction | Increase stair time factor |
| Missing furniture item type | Inventory prompt gap | Add to inventory prompting list |
| Missed surcharge | Billing gap pattern | Add to pre-job checklist |
| Parking delay | Access condition gap | Add parking field to quote form |
| Actual time within estimate | Positive reinforcement | Increase confidence for this job type |

---

## 11. AI Simulation Engine

### 11.1 Purpose

The Simulation Engine allows operators to ask **what-if questions** about their business and receive AI-powered analysis of projected outcomes. This is a strategic planning tool — operator-triggered, not automatic.

### 11.2 Supported Simulations (V1)

| Question | What the AI Analyzes |
|---------|---------------------|
| "What if I buy another truck?" | Vehicle utilization, declined jobs, projected revenue capacity |
| "What if I hire two more crew?" | Crew utilization, declined jobs, additional labor cost vs. revenue |
| "What if I raise my hourly rate 10%?" | Historical acceptance rate, estimated booking impact, revenue tradeoff |
| "What if I add storage as a service?" | Customer segment needing storage, revenue opportunity |
| "What if fuel prices rise 30%?" | Fuel as % of cost basis, margin impact, fuel surcharge recommendation |
| "What if my top employee is unavailable 2 weeks?" | Coverage analysis, revenue at risk |

**V2+ adds:** Monte Carlo probabilistic simulation with confidence intervals, seasonal demand modeling, growth scenario modeling.

### 11.3 Simulation Output Format

```
Simulation: "What if I buy another truck?"
─────────────────────────────────────────────────────────────
CURRENT STATE (last 90 days)
  Vehicle utilization: 87% (Truck 1), 92% (Truck 2)
  Jobs declined — vehicle unavailable: 4 (est. revenue: $3,600)
  Jobs delayed 1+ day due to vehicle shortage: 7

PROJECTED IMPACT (adding 24ft box truck)
  Additional jobs per month: +6 to +9
  Additional monthly revenue: +$5,400 to +$8,100
  Vehicle cost (amortized): -$2,200/month
  Net impact: +$3,200 to +$5,900/month

BREAK-EVEN
  Pays for itself at: 3.2 additional jobs/month
  At current lead volume: achievable from month 1

CAVEATS
  ⚠️  Assumes current lead volume is maintained
  ⚠️  Requires at least 1 Class B license driver (you currently have 2)
  ⚠️  Seasonal variance not modeled (V2+)

Confidence: 71/100
Data: 90-day job history, vehicle assignment records, declined job logs
─────────────────────────────────────────────────────────────
```

---

## 12. AI Digital Twin

### 12.1 Vision

The AI Digital Twin is the long-term culmination of every capability in this document. It is not a V1 feature. It is the 3–5 year destination that the V1 architecture is specifically designed to grow toward.

A Digital Twin is a complete AI model of the company. When fully realized, an owner can ask any question about their business in natural language and receive an accurate, data-driven answer.

### 12.2 What the Digital Twin Enables

**Natural language business intelligence:**
> *"How did my margins compare in Q1 vs. Q4 last year?"*  
> *"Which crew member gets the highest satisfaction scores on long-distance jobs?"*  
> *"What percentage of my revenue comes from repeat customers?"*  
> *"What would revenue have been if I charged $10 more per hour all year?"*

**Predictive operations:**
> *"I have 3 jobs booked for the first week of August. Should I hire temp crew?"*  
> *"My lead volume is 40% above this time last year. Do I have capacity?"*  
> *"Which open quotes are most likely to close this week?"*

**Autonomous monitoring (with approval):**
The AI proactively alerts the owner when something unexpected emerges in the data — a sudden drop in acceptance rate, a surge in time overruns, a customer segment that stopped booking — before the owner needs to ask.

### 12.3 Architectural Foundation

Every V1 decision is made with the Digital Twin in mind:

- `ai_company_patterns` accumulates the AI's model of the company
- `activity_logs` provides a complete history of everything that happened
- Domain events capture every state change with full context
- `ai_replay_analyses` accumulates job-level operational intelligence
- The feedback loop continuously refines the AI's understanding

When data volume and use case sophistication justify it, the Digital Twin layer is built on top of this foundation — not instead of it.

---

## 13. AI Safety Framework

### 13.1 The Non-Negotiable Rules

**Rule 1: No autonomous execution.**  
No AI recommendation executes automatically without human approval, unless the operator has explicitly configured an automation rule. Even configured automations can always be disabled.

**Rule 2: Every recommendation is explainable.**  
Every AI output must come with a reasoning summary, the data it is based on, the assumptions it made, and the confidence score. Operators never receive a number without knowing why.

**Rule 3: Every recommendation is editable.**  
No value — no price, no estimate, no suggested crew size — can be locked. Every field the AI touches is a field the human can change.

**Rule 4: Errors are safe.**  
When the AI fails (API unavailable, low confidence, malformed response), the system falls back gracefully to manual input. No critical workflow is blocked by an AI failure.

**Rule 5: AI actions are fully audited.**  
Every AI call, its inputs, its outputs, and the human decision that followed are recorded in `ai_logs`. The operator can always see what the AI did and why.

### 13.2 The AI Output Card

Every AI recommendation in the UI must display an **AI Output Card**:

```
┌────────────────────────────────────────────────────┐
│  AI Recommendation                    73/100 ⚡     │
├────────────────────────────────────────────────────┤
│  Crew: 4 movers  |  Hours: 6.5h  |  Price: $1,890  │
├────────────────────────────────────────────────────┤
│  Why this recommendation                            │
│  Based on 9 similar jobs (2BR–3BR, stair access).  │
│  Avg crew: 3.8 → rounded to 4.                      │
│  Avg hours: 6.1 + 0.4h stair/buffer.                │
│                                                    │
│  Assumptions                                       │
│  • Parking within 100ft — not yet confirmed         │
│  • No fragile art items                             │
│                                                    │
│  [Override all]  [Edit individually]  [Accept ✓]  │
└────────────────────────────────────────────────────┘
```

The card is always collapsible. The operator can work with just the values.

### 13.3 Confidence Thresholds

| Score | UI Treatment |
|-------|-------------|
| 80–100 | Normal display. No warning. |
| 60–79 | Yellow indicator: "Good confidence" |
| 40–59 | Orange indicator: "Moderate confidence — review carefully" |
| 0–39 | Red indicator: "Low confidence — recommend manual review or survey before sending" |

Below 40: the quote cannot be sent through any configured automation. The operator must manually trigger the send.

### 13.4 AI Failure Handling

**API unavailable (timeout, outage)**  
→ Surface manual input form immediately.  
→ Log failure in `ai_logs` (`status = 'failed'`).  
→ Notify operator: "AI quoting unavailable — using manual mode."  
→ No data is lost; operator completes the quote manually.

**Invalid response (malformed output)**  
→ Retry with correction prompt (up to 2 retries).  
→ If still invalid: fall back to manual mode.  
→ Log full prompt and response for debugging.  
→ Alert engineering if this pattern recurs.

**Low confidence output**  
→ Deliver the output with a prominent confidence warning.  
→ Do not suppress it — even a low-confidence estimate gives useful context.  
→ Recommend additional information gathering or in-person survey.

**Cost budget exceeded**  
→ Disable AI features for the company until budget resets or credits are added.  
→ All workflows fall back to manual mode.  
→ Notify owner with clear explanation and one-click credit purchase link.

---

## 14. AI Model Strategy

### 14.1 The Model Hierarchy

Bivro uses a three-tier model strategy:

| Tier | Model | Use Cases | Characteristics |
|------|-------|-----------|----------------|
| Tier 1 — Fast | `claude-haiku-4-5` | Lead scoring, simple classifications, real-time suggestions | Latency < 2s, low cost |
| Tier 2 — Standard | `claude-sonnet-4-6` | Quote generation, email drafting, replay, CEO brief, profit analysis | Latency 3–8s, balanced cost/quality |
| Tier 3 — Deep | `claude-opus-4-8` | Complex simulations, digital twin queries, business strategy analysis | Latency 10–30s, highest reasoning — Enterprise tier only |

### 14.2 Task-to-Model Assignment

| Task | Model | Rationale |
|------|-------|-----------|
| Inventory parsing | claude-sonnet-4-6 | Structured extraction from ambiguous natural language |
| Quote estimation | claude-sonnet-4-6 | Core business value; accuracy justifies the cost |
| Lead scoring | claude-haiku-4-5 | Classification task; speed matters; runs on every new lead |
| Email draft (customer-facing) | claude-sonnet-4-6 | Customer impression depends on quality |
| CEO Brief generation | claude-sonnet-4-6 | Multi-source synthesis; needs narrative quality |
| Post-job replay | claude-sonnet-4-6 | Nuanced comparison of planned vs. actual |
| Observation detection (nightly batch) | claude-haiku-4-5 | Pattern classification from structured data |
| Profit analysis | claude-sonnet-4-6 | Financial reasoning requires reliability |
| Simulation (basic) | claude-sonnet-4-6 | Analytical reasoning from structured data |
| Simulation (complex, V2+) | claude-opus-4-8 | Deep multi-step probabilistic reasoning |
| Digital twin queries (V2+) | claude-opus-4-8 | Complex natural language business intelligence |

### 14.3 Streaming

Long AI tasks (quote generation, CEO brief, replay) use Claude's streaming API to deliver output progressively to the UI. This prevents a loading spinner experience for responses that take more than 2 seconds.

- Inventory parsing: stream item list as items are identified
- Quote generation: stream reasoning summary, then final values
- CEO Brief: stream section by section

### 14.4 Structured Output

All AI calls that produce actionable data use Claude's structured output mode to return JSON validated against a Zod schema. Raw text from the AI is never stored in the database or displayed in the UI without parsing and validation. The AI is structurally constrained to return data in a defined format.

---

## 15. Prompt Architecture

### 15.1 The Prompt as a First-Class Artifact

A prompt is not a string. It is a versioned, tested, documented module with known inputs and expected outputs.

Every prompt in Bivro is:
- **Versioned:** `inventory-parser.v3.ts` supersedes `.v2.ts`; old versions are never deleted
- **Typed:** Input parameters are TypeScript types; the prompt accepts only typed inputs
- **Tested:** Every prompt has a test suite with golden examples and expected outputs
- **Traceable:** The prompt version used in every AI call is recorded in `ai_logs.prompt_template`

### 15.2 Prompt Structure

Every prompt follows a three-layer structure:

```
Layer 1 — System Identity (constant per task type)
  Who Bivro is, what task is being performed, required output format.
  Does not change between calls of the same type.

Layer 2 — Company Context (variable, per-tenant)
  The compiled Company AI Brain context (Section 2.3).
  Compiled fresh for every call from the Context Builder.
  This is what makes each output company-specific.

Layer 3 — Task Input (variable, per-call)
  The specific data for this request:
  the inventory text, the job address, the question being asked.
```

### 15.3 Prompt Registry

All prompt templates live in `/modules/ai/prompts/`. The registry enforces:
- One file per prompt type per version
- TypeScript input parameter type
- Zod schema for output validation
- Changelog explaining what changed from the prior version and why
- A set of golden test cases with expected outputs

### 15.4 Prompt Deployment

New prompt versions are deployed independently of application code. Before a new version reaches production:
1. Regression tests run against all historical golden test cases
2. The new version must match or improve on all existing test outputs
3. Optional A/B test with a sample of live traffic (see ARCHITECTURE.md §15)
4. Version is tagged and deployed via the PromptRegistry

---

## 16. The Learning Feedback Loop

### 16.1 The Loop Architecture

The feedback loop is the mechanism by which every interaction with the AI improves future performance for that company.

```
Job Created
     │
     ▼
AI generates recommendation
     │
     ▼
AI Output Card shown to operator
     │
     ├── ACCEPTED without change
     │      → positive learning event recorded
     │      → confidence calibration: +1
     │
     ├── EDITED (operator changes values)
     │      → correction learning event recorded
     │      → delta recorded (what changed, direction, magnitude)
     │      → calibration: adjust toward correction direction
     │
     └── REJECTED entirely
            → rejection event recorded
            → analyze reason if provided
            → reduce confidence for this job type

After job completes:
     Actual hours, satisfaction, invoice paid collected
     Post-job Replay generated
     Replay learning events recorded
     Memory updated with outcome data
```

### 16.2 Implicit Feedback Signals

| Behavior | Signal |
|---------|--------|
| Quote accepted as generated | Strong positive |
| Operator raises price before sending | AI was priced too low |
| Operator lowers price before sending | AI was priced too high |
| Operator adds a service AI didn't suggest | Service gap |
| Operator removes a service AI suggested | Over-suggestion |
| Customer accepts first-time | Market price validation |
| Customer declines | Potential over-pricing |
| Job runs exactly to estimate | Accuracy reward |
| Job significantly overruns | Time estimation gap |

### 16.3 Explicit Feedback

The operator can rate any AI recommendation:
- **Thumbs up** — "This was accurate and helpful"
- **Thumbs down** — "This was off" (optional short reason form)

Explicit feedback carries higher weight than implicit in the learning model. An explicit "wrong crew size" override is a stronger signal than observing a field change.

### 16.4 The Monthly Learning Report

Every month the AI generates a **Learning Report** — a transparent summary of how the AI changed and why:

```
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  What Your AI Learned in June 2026
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

📈 IMPROVEMENTS
  Time estimation accuracy: 78% → 84%
  Why: You corrected stair-carry time estimates 9 times in April–May.
  I now add 15 min per stair flight at destination (was 8 min).

  Lead scoring more accurate.
  Why: You marked 4 medium-scored leads as high priority. All 4 converted.
  I now score higher for referred leads with urgent move dates.

🆕 NEW PATTERNS LEARNED
  I automatically include packing material for 3BR+ inventory.
  You confirmed this in May (8 of 10 observations). ✅

  I add 30-min buffer for spiral staircases.
  You corrected me 3 times on this in May–June. ✅

📊 ACCURACY SUMMARY
  Quote accepted without editing:   62%  (↑ from 54%)
  Time estimate within ±10%:        84%  (↑ from 78%)
  Crew size correct first try:      91%  (steady)
  Service suggestions accepted:     73%  (↑ from 68%)

📋 NEXT MONTH FOCUS
  Long-distance acceptance rate: 32% (vs. 47% local).
  I need more context on recent long-distance declines to learn faster.
  [Add context]
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
```

---

## 17. AI Task Catalogue

Complete list of every AI task in V1, with model, trigger, and output:

| Task ID | Task Name | Trigger | Model | Output |
|---------|-----------|---------|-------|--------|
| AI-001 | Inventory Parse | User inputs text in quote builder | claude-sonnet-4-6 | Structured item list + volume/weight |
| AI-002 | Quote Estimation | Quote estimation requested | claude-sonnet-4-6 | Crew, hours, vehicle, price, confidence, reasoning |
| AI-003 | Lead Scoring | New lead created | claude-haiku-4-5 | Score 0–100 + rationale |
| AI-004 | Email Draft | User requests AI email | claude-sonnet-4-6 | Subject + body + tone |
| AI-005 | CEO Brief | Morning cron (7 AM) | claude-sonnet-4-6 | Structured brief → rendered |
| AI-006 | Post-Job Replay | Job marked complete | claude-sonnet-4-6 | Replay report + learning events |
| AI-007 | Pattern Observation | Nightly batch cron | claude-haiku-4-5 | Candidate observation list |
| AI-008 | Profit Analysis | Weekly batch cron | claude-sonnet-4-6 | Profit gaps + recommendations |
| AI-009 | Simulation | Operator triggers in UI | claude-sonnet-4-6 | Scenario analysis report |
| AI-010 | Learning Report | Monthly cron (1st of month) | claude-sonnet-4-6 | Formatted monthly summary |
| AI-011 | Quote Follow-up Draft | Quote unopened 24h+ | claude-haiku-4-5 | Follow-up email draft |
| AI-012 | Scheduling Conflict Alert | Job created with overlap | claude-haiku-4-5 | Alert severity + suggestion |
| AI-013 | Invoice Risk Flag | Invoice 7+ days unpaid | claude-haiku-4-5 | Risk score + recommended action |
| AI-014 | Service Suggestion (inline) | Observation matches active quote | claude-haiku-4-5 | Service to add + reason |

---

## 18. AI Database Schema

### 18.1 `ai_company_patterns`

Confirmed patterns in AI Memory — Tier 1, highest trust.

```sql
ai_company_patterns
──────────────────────────────────────────────────────────────────
id                    uuid         PRIMARY KEY DEFAULT gen_uuid_v7()
company_id            uuid         NOT NULL REFERENCES companies(id) ON DELETE CASCADE

-- Classification
pattern_type          text         NOT NULL
  -- service_affinity | crew_preference | time_buffer | price_rounding
  -- discount_rule | stair_factor | elevator_factor | seasonal_adjustment

-- Trigger (when this pattern applies)
trigger_conditions    jsonb        NOT NULL
  -- {"floor_min": 4, "has_elevator": false}
  -- {"property_size": ["3BR","4BR"], "move_type": "local"}

-- Action (what the pattern causes)
action_type           text         NOT NULL
  -- auto_add_service | adjust_time_factor | adjust_price | auto_discount
action_value          jsonb        NOT NULL
  -- {"service": "furniture_lift", "quantity": 1}
  -- {"field": "estimated_hours", "multiplier": 1.25}

-- Evidence at time of confirmation
evidence_count        integer      NOT NULL DEFAULT 0
evidence_consistency  numeric(5,2) NOT NULL DEFAULT 0

-- Confirmation
confirmed_by          uuid         REFERENCES profiles(id) ON DELETE SET NULL
confirmed_at          timestamptz

-- Status
is_active             boolean      NOT NULL DEFAULT true
deactivated_at        timestamptz
deactivated_by        uuid         REFERENCES profiles(id) ON DELETE SET NULL

created_at            timestamptz  NOT NULL DEFAULT now()
updated_at            timestamptz  NOT NULL DEFAULT now()
──────────────────────────────────────────────────────────────────
INDEXES:
  idx_ai_patterns_company      (company_id, is_active)
  idx_ai_patterns_type         (company_id, pattern_type) WHERE is_active = true
RLS:
  SELECT  company_id = jwt_company_id()
  INSERT  company_id = jwt_company_id() AND role = 'owner'
  UPDATE  company_id = jwt_company_id() AND role = 'owner'
```

### 18.2 `ai_company_observations`

Candidate patterns pending operator confirmation — Tier 2.

```sql
ai_company_observations
──────────────────────────────────────────────────────────────────
id                    uuid         PRIMARY KEY DEFAULT gen_uuid_v7()
company_id            uuid         NOT NULL REFERENCES companies(id) ON DELETE CASCADE

pattern_type          text         NOT NULL
description           text         NOT NULL
evidence_count        integer      NOT NULL
evidence_consistency  numeric(5,2) NOT NULL
evidence_job_ids      uuid[]       NOT NULL
confidence            smallint     NOT NULL CHECK (confidence BETWEEN 0 AND 100)

trigger_conditions    jsonb        NOT NULL
action_type           text         NOT NULL
action_value          jsonb        NOT NULL

-- Surfacing tracking
first_surfaced_at     timestamptz
last_surfaced_at      timestamptz
surface_count         integer      NOT NULL DEFAULT 0

-- Operator decision
status                text         NOT NULL DEFAULT 'pending'
  -- pending | confirmed | dismissed | snoozed
decided_by            uuid         REFERENCES profiles(id) ON DELETE SET NULL
decided_at            timestamptz
snooze_until          timestamptz

-- If confirmed: the resulting pattern
resulting_pattern_id  uuid         REFERENCES ai_company_patterns(id) ON DELETE SET NULL

created_at            timestamptz  NOT NULL DEFAULT now()
updated_at            timestamptz  NOT NULL DEFAULT now()
──────────────────────────────────────────────────────────────────
INDEXES:
  idx_ai_observations_pending  (company_id, status) WHERE status = 'pending'
```

### 18.3 `ai_learning_events`

Every individual feedback signal. Append-only — no UPDATE, no DELETE.

```sql
ai_learning_events
──────────────────────────────────────────────────────────────────
id                    uuid         PRIMARY KEY DEFAULT gen_uuid_v7()
company_id            uuid         NOT NULL

ai_log_id             uuid         -- the AI call this event came from
entity_type           text         NOT NULL  -- 'quote' | 'job' | 'lead' | 'invoice'
entity_id             uuid         NOT NULL

event_type            text         NOT NULL
  -- recommendation_accepted | recommendation_edited | recommendation_rejected
  -- job_time_overrun | job_time_underrun | quote_declined | quote_accepted
  -- service_added_manually | service_removed
  -- explicit_feedback_positive | explicit_feedback_negative
  -- pattern_confirmed | pattern_dismissed

field_name            text            -- which field was corrected (if edit event)
ai_value              jsonb           -- what AI recommended
human_value           jsonb           -- what human set
delta                 jsonb           -- computed difference for numeric fields
signal_strength       text            -- 'strong' | 'moderate' | 'weak'

acting_user           uuid
user_role             user_role

created_at            timestamptz  NOT NULL DEFAULT now()
──────────────────────────────────────────────────────────────────
INDEXES:
  idx_ai_learning_company     (company_id, event_type)
  idx_ai_learning_entity      (entity_type, entity_id)
  idx_ai_learning_created_at  (company_id, created_at DESC)
NOTE: No RLS UPDATE/DELETE. Append-only enforced at application layer.
```

### 18.4 `ai_coaching_briefs`

Stored CEO Brief records.

```sql
ai_coaching_briefs
──────────────────────────────────────────────────────────────────
id                    uuid         PRIMARY KEY DEFAULT gen_uuid_v7()
company_id            uuid         NOT NULL REFERENCES companies(id) ON DELETE CASCADE

brief_date            date         NOT NULL
brief_type            text         NOT NULL DEFAULT 'daily'  -- 'daily' | 'weekly'

content               jsonb        NOT NULL   -- structured brief data
rendered_html         text                    -- pre-rendered for email delivery

delivered_at          timestamptz
email_sent            boolean      NOT NULL DEFAULT false
viewed_at             timestamptz
view_count            integer      NOT NULL DEFAULT 0

ai_log_id             uuid         REFERENCES ai_logs(id) ON DELETE SET NULL
model_used            text

created_at            timestamptz  NOT NULL DEFAULT now()
──────────────────────────────────────────────────────────────────
CONSTRAINTS:
  UNIQUE(company_id, brief_date, brief_type)
INDEXES:
  idx_coaching_briefs_company  (company_id, brief_date DESC)
```

### 18.5 `ai_replay_analyses`

Post-job replay records.

```sql
ai_replay_analyses
──────────────────────────────────────────────────────────────────
id                      uuid         PRIMARY KEY DEFAULT gen_uuid_v7()
company_id              uuid         NOT NULL REFERENCES companies(id) ON DELETE CASCADE
job_id                  uuid         NOT NULL REFERENCES jobs(id) ON DELETE CASCADE

went_well               jsonb        -- positive findings
went_wrong              jsonb        -- issues identified
time_analysis           jsonb        -- estimated vs. actual time breakdown
revenue_analysis        jsonb        -- quoted vs. actual revenue, missed opportunities
learning_events_created integer      NOT NULL DEFAULT 0

summary_text            text         -- AI narrative summary
recommendations         jsonb        -- actionable items for next time

ai_log_id               uuid         REFERENCES ai_logs(id) ON DELETE SET NULL
viewed_at               timestamptz
viewed_by               uuid

created_at              timestamptz  NOT NULL DEFAULT now()
──────────────────────────────────────────────────────────────────
CONSTRAINTS:
  UNIQUE(job_id)  -- one replay per job
INDEXES:
  idx_ai_replay_company  (company_id, created_at DESC)
  idx_ai_replay_job      (job_id)
```

### 18.6 `ai_simulation_runs`

Stored simulation results.

```sql
ai_simulation_runs
──────────────────────────────────────────────────────────────────
id                    uuid         PRIMARY KEY DEFAULT gen_uuid_v7()
company_id            uuid         NOT NULL REFERENCES companies(id) ON DELETE CASCADE
created_by            uuid         REFERENCES profiles(id) ON DELETE SET NULL

scenario_type         text         NOT NULL
  -- add_vehicle | add_employee | change_pricing | fuel_price_change
  -- add_service_type | key_employee_unavailable | custom
scenario_parameters   jsonb        NOT NULL   -- the "what if" inputs
scenario_description  text         NOT NULL   -- human-readable question

analysis_result       jsonb        NOT NULL   -- full structured output
summary_text          text         NOT NULL   -- AI narrative
confidence_score      smallint     CHECK (confidence_score BETWEEN 0 AND 100)

ai_log_id             uuid         REFERENCES ai_logs(id) ON DELETE SET NULL
data_window_days      integer      NOT NULL DEFAULT 90

viewed_at             timestamptz
created_at            timestamptz  NOT NULL DEFAULT now()
──────────────────────────────────────────────────────────────────
INDEXES:
  idx_ai_simulation_company  (company_id, created_at DESC)
```

### 18.7 `ai_monthly_learning_reports`

Monthly learning summaries.

```sql
ai_monthly_learning_reports
──────────────────────────────────────────────────────────────────
id                      uuid         PRIMARY KEY DEFAULT gen_uuid_v7()
company_id              uuid         NOT NULL REFERENCES companies(id) ON DELETE CASCADE

report_month            date         NOT NULL  -- first day of month: 2026-06-01

improvements            jsonb        -- accuracy improvements this month
new_patterns_learned    jsonb        -- patterns confirmed this month
accuracy_metrics        jsonb        -- acceptance rate, time accuracy, etc.
comparison_to_prior     jsonb        -- deltas vs. prior month
focus_areas_next_month  jsonb        -- suggestions for further improvement

summary_text            text
email_sent              boolean      NOT NULL DEFAULT false
viewed_at               timestamptz

ai_log_id               uuid         REFERENCES ai_logs(id) ON DELETE SET NULL
created_at              timestamptz  NOT NULL DEFAULT now()
──────────────────────────────────────────────────────────────────
CONSTRAINTS:
  UNIQUE(company_id, report_month)
```

### 18.8 `platform_audit_log` (AI-relevant rows)

Immutable record of every Bivro staff access to company AI data. This is a reference to the canonical `platform_audit_log` table defined in `PLATFORM_ADMIN.md` §11.12. Separate from the company-side `activity_logs` table. Retained 7 years.

```sql
platform_audit_log  (AI-access rows — see full schema in PLATFORM_ADMIN.md §11.12)
──────────────────────────────────────────────────────────────────
id                    uuid         PRIMARY KEY DEFAULT gen_uuid_v7()

-- Who accessed
admin_user_id         uuid         NOT NULL  -- Bivro staff member identity
admin_email           text         NOT NULL  -- snapshotted at time of access
admin_ip_address      inet         NOT NULL

-- What was accessed
resource_type         text         NOT NULL
  -- 'ai_log_entry' | 'ai_coaching_brief' | 'ai_simulation_run' | 'tenant_token_usage'
resource_id           uuid                   -- specific record accessed (if applicable)
target_company_id     uuid                   -- which tenant's data was accessed

-- Why
incident_id           text         NOT NULL   -- ticket or incident reference
access_justification  text         NOT NULL   -- mandatory reason text

-- Scope and expiry
access_granted_at     timestamptz  NOT NULL DEFAULT now()
access_expires_at     timestamptz  NOT NULL   -- default: 24h after grant

created_at            timestamptz  NOT NULL DEFAULT now()
──────────────────────────────────────────────────────────────────
NOTE: No UPDATE, no DELETE. Not exposed via RLS to any company user.
Accessible only by Bivro internal tooling with separate auth.
```

---

## 19. Cost Management

### 19.1 Token Budget Architecture

Every company has a monthly AI token budget based on subscription tier:

| Tier | Monthly Token Budget | Overage Behavior |
|------|---------------------|-----------------|
| Free | 50,000 tokens | Hard stop — manual mode only |
| Pro | 500,000 tokens | Alert at 80%; hard stop at 100% |
| Business | 2,000,000 tokens | Alert at 80%; stop at 100% (or add credits) |
| Enterprise | Custom | Custom thresholds; no automatic hard stop |

### 19.2 Approximate Cost Per Task

Based on current Claude model pricing:

| Task | Model | Est. Input Tokens | Est. Output Tokens | Est. Cost |
|------|-------|------------------|--------------------|-----------|
| Inventory parse | claude-sonnet-4-6 | ~800 | ~400 | ~$0.004 |
| Quote estimation | claude-sonnet-4-6 | ~1,200 | ~600 | ~$0.006 |
| Lead scoring | claude-haiku-4-5 | ~400 | ~100 | ~$0.001 |
| CEO Brief | claude-sonnet-4-6 | ~2,000 | ~800 | ~$0.009 |
| Post-job replay | claude-sonnet-4-6 | ~1,500 | ~700 | ~$0.007 |
| Monthly report | claude-sonnet-4-6 | ~3,000 | ~1,200 | ~$0.013 |

A company processing 100 jobs/month with AI quoting will consume approximately 100,000–200,000 tokens — well within the Pro tier budget.

### 19.3 Cost Attribution

Every `ai_logs` row records:
- `input_tokens` and `output_tokens` — from Anthropic API response
- `cost_millicents` — computed: tokens × model rate × 1000 (integer; avoids float precision issues)
- `company_id` — for per-tenant aggregation and billing
- `task_type` — for per-feature cost analysis

---

## 20. V1 Implementation vs. V2+ Vision

### V1 — Foundation

| Capability | V1 Implementation |
|-----------|------------------|
| Company AI Brain | Compiled at request time from DB; no separate memory store |
| AI Memory | `ai_company_patterns` and `ai_learning_events` tables; batch nightly updates |
| Observation Engine | Nightly Vercel Cron batch analysis |
| Quote Engine | Claude API + company context injection; structured output with Zod |
| CEO Brief | Morning Vercel Cron; claude-sonnet-4-6 synthesis |
| Post-Job Replay | Triggered on job completion via Supabase webhook → async processing |
| Simulation | On-demand, claude-sonnet-4-6, deterministic analysis |
| Digital Twin | Not implemented — data accumulated to support this in the future |
| Learning Feedback | `ai_learning_events` table; Memory Updater batch job (nightly) |
| Admin Access | Break-glass access with mandatory justification + `platform_audit_log` |

### V2+ — Evolution

| Capability | V2+ Enhancement |
|-----------|----------------|
| Company AI Brain | Real-time context compilation; Redis cache for warm patterns |
| AI Memory | Vector embeddings (pgvector → dedicated vector DB) for semantic job similarity |
| Observation Engine | Real-time via domain events; near-instant detection |
| Quote Engine | Retrieval Augmented Generation — semantically similar past jobs inform new estimates |
| Simulation | Monte Carlo probabilistic modeling with confidence intervals |
| Digital Twin | Natural language query interface over company data |
| Learning Feedback | Real-time model calibration; fine-tuned embeddings on company history |
| Multi-modal | Photo/video inventory parsing |
| Admin Access | Dedicated admin dashboard with real-time system health and cost dashboards |

### The Continuity Principle

Every V1 data decision is made with V2+ in mind. Data collected in V1 becomes the corpus for V2+. Tables defined in V1 remain the foundation in V2+ — new columns and tables are additive, never destructive.

- `ai_learning_events` → training dataset for V2+ fine-tuned embeddings
- `ai_company_patterns` → seed for V2+ real-time context builder
- `ai_replay_analyses` → labeled outcome data for V2+ simulation models
- `activity_logs` → event log for V2+ digital twin

The intelligence compounds. Every job processed in V1 makes the V2+ system smarter from day one.

---

*This document defines the intelligence architecture of Bivro. The AI Engine is not a feature — it is the operating layer that makes Bivro fundamentally different from every other platform in the moving industry. Every implementation decision must preserve the principles in Section 1, the isolation guarantees in Sections 3 and 4, and the safety contracts in Section 13.*
