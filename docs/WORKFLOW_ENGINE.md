# Bivro — Workflow Engine (State Machines, Domain Events, System Tasks)

Status: **Implemented** (migration 025) · 2026-10-26

The backend process model from `COMPETITOR_BIXIN.md §5`, made concrete. Three parts, all enforced in the database so that no route, script or future module can bypass them.

---

## 1. State Machines

Entities with a lifecycle: `lead`, `appointment`, `quote`, `job`, `invoice`, `payment`.

- **`workflow_transitions`** (read-only configuration) lists every allowed `from → to` per entity, plus:
  - `system_only` — only the backend may perform it (e.g. `quote sent → viewed`, `invoice → overdue`, `lead → booked`).
  - `reason_column` — the column that must be filled (e.g. `leads.lost_reason`, `jobs.cancellation_reason`).
- **Trigger `enforce_status_transition`** (BEFORE UPDATE OF status) on all six tables:
  1. rejects any transition not in the table (`check_violation`, message `invalid_transition: quote draft -> accepted`);
  2. rejects `system_only` transitions made with a user JWT (`authenticated` role);
  3. checks the reason column;
  4. checks entity guards (§1.1);
  5. stamps lifecycle timestamps (`sent_at`, `accepted_at`, `declined_at`, `converted_at`, `completed_at`, `cancelled_at`, `actual_start_at`, `actual_end_at`, `paid_at`).
- **Trigger `record_status_change`** (AFTER INSERT / UPDATE OF status) writes:
  - one row to **`status_history`** (append-only: entity, from, to, actor, reason, time);
  - domain events `<entity>.created` / `<entity>.status_changed` and `<entity>.<new_status>` (e.g. `quote.accepted`) into **`domain_events`** — in the same transaction, so an event exists if and only if the change was committed (transactional outbox).
- **`transition_status(entity, id, to_status, reason)`** — the one function the app calls. Runs with the caller's rights (RLS applies), writes the reason into the reason column when the entity has one, and passes it to `status_history`.

### 1.1 Guards

| Transition | Guard |
|---|---|
| quote → `sent` | customer set, `total_amount_cents > 0` |
| job → `in_progress` | at least one crew assignment |
| invoice → `sent` | `total_amount_cents > 0`, `invoice_number` set |
| invoice → `paid` | `balance_due_cents = 0` |

### 1.2 Transitions

| Entity | Allowed (→ system only in *italics*) |
|---|---|
| lead | new → contacted, surveyed, quoted, lost, duplicate · contacted → surveyed, quoted, lost, duplicate · surveyed → quoted, lost · quoted → *booked*, lost · lost → new (reopen) |
| appointment | scheduled → confirmed, completed, no_show, cancelled · confirmed → completed, no_show, cancelled |
| quote | draft → sent, cancelled · sent → *viewed*, accepted, declined, *expired*, cancelled · viewed → accepted, declined, *expired*, cancelled |
| job | scheduled → confirmed, on_hold, cancelled · confirmed → in_progress, on_hold, cancelled · in_progress → completed, on_hold · on_hold → scheduled, confirmed, cancelled |
| invoice | draft → sent, void · sent → *viewed*, partially_paid, paid, *overdue*, void, write_off · viewed → partially_paid, paid, *overdue*, void, write_off · partially_paid → paid, *overdue*, write_off · overdue → partially_paid, paid, write_off |
| payment | pending → completed, failed, cancelled · completed → refunded |

Terminal: lead `booked`/`duplicate`, quote `accepted`/`declined`/`expired`/`cancelled` (a changed offer is a new version), job `completed`/`cancelled`, invoice `paid`/`void`/`write_off`.

---

## 2. Domain Events

`domain_events` is the outbox. Processing columns added: `attempts`, `next_attempt_at`, `locked_until`, `dead_at`.

- **`claim_domain_events(limit)`** — `FOR UPDATE SKIP LOCKED`, locks a batch for 5 minutes; safe with several workers.
- **`complete_domain_event(id)`** / **`fail_domain_event(id, error)`** — failures retry with exponential backoff (1, 2, 4 … 256 min); after 8 attempts the event is marked dead and surfaces in monitoring.
- **`domain_event_handler_runs`** — one row per (event, handler) once a handler succeeded. A retried event skips handlers that already ran: every handler runs at most once per event.
- Processor: `lib/events/processor.ts`, run by `GET /api/cron/process-events` (every minute, `CRON_SECRET`).

### 2.1 Handlers (V1)

| Event | Handler | Effect |
|---|---|---|
| `quote.sent` | `leads.mark_quoted` | Lead `new`/`contacted`/`surveyed` → `quoted` |
| `quote.accepted` | `jobs.create_from_quote` | Creates the job (number `JB-…`, addresses, date, amounts from the quote); skipped when the quote lacks a date or addresses — the task rule `quote.accepted_without_job` then asks a person. A unique index allows only one job per quote. |
| `quote.accepted` | `leads.mark_booked` | Lead → `booked` (via `quoted` if needed); the database stamps `converted_at` |

After each batch the processor runs `sync_system_tasks` for every company the batch touched, so tasks follow status changes within one processing cycle.

Cron schedule (`vercel.json`): `process-events` every minute (needs a Vercel plan with per-minute crons; on Hobby, run it from Supabase `pg_cron` or an external scheduler instead), `sync-tasks` every 15 minutes. The placeholder entries `quote-expiry` and `overdue-invoices` were removed — `sync-tasks` covers both.

---

## 3. System Tasks

`tasks` gains `source` (`manual` / `system`), `rule_key` and `auto_resolved_at`. A unique index guarantees at most one open system task per (company, rule, entity).

**`sync_system_tasks(company_id)`** evaluates every rule, opens missing tasks and closes tasks whose condition no longer holds (`completed`, `auto_resolved_at`). Manual tasks are never touched.

| Rule | Condition | Priority |
|---|---|---|
| `lead.uncontacted` | lead `new` for more than 24 h | high |
| `appointment.unconfirmed` | appointment `scheduled` within the next 48 h | medium |
| `quote.draft_not_sent` | quote `draft` for more than 24 h | medium |
| `quote.follow_up` | quote `sent` for more than 48 h, not viewed | medium |
| `quote.expiring` | quote `sent`/`viewed`, expires within 48 h | high |
| `quote.accepted_without_job` | quote `accepted`, no job | urgent |
| `job.unassigned` | job `scheduled`/`confirmed` within 2 days, no crew | urgent |
| `job.completed_without_invoice` | job `completed`, no non-void invoice | high |
| `invoice.overdue` | invoice `overdue` | high |

**`apply_time_based_transitions()`** runs before every sync: sent/viewed quotes past `expires_at` → `expired`; open invoices past `due_at` → `overdue`.

Cron: `GET /api/cron/sync-tasks` every 15 minutes (time-based transitions + all companies). Event-driven sync keeps tasks current between runs.

---

## 4. Not in this step

- Final settlement (`Abrechnung`) entity with Kostendach enforcement — designed in `COMPETITOR_BIXIN.md §5`, built with the quote/job modules.
- Notifications and e-mails from events — handlers are added with the communications module.
