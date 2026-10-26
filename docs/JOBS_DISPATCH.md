# Bivro — Phase 3: Jobs, Dispatch, Crew, Fleet

Status: **Implemented** (migration 030) · 2026-10-26

Features F015–F020 and the crew/fleet records (PRODUCT_REQUIREMENTS Modules 3–5) for V1 without a crew app: the office plans, crew members are records without login.

---

## 1. Jobs

- Created automatically when a quote is accepted (`jobs.create_from_quote`, WORKFLOW_ENGINE.md), or manually for small jobs agreed by phone (`/jobs` → New job).
- Schedule: date, start time (default 07:00), duration (default 8 h), crew size needed, instructions for the crew, internal notes.
- Status (workflow engine): Planned → Confirmed → In progress → Completed; On hold / Resume; Cancel with required reason. Start needs at least one crew member; completion stores notes and the actual start/end time.

## 2. Dispatch Board (`/jobs`)

Week view, one column per day: start time, status, customer, route, crew (assigned/needed — orange when short), vehicles, conflict count (red), and who is absent that day. Week navigation; today highlighted.

## 3. Crew and Vehicle Assignment

- Crew: any number of employees, one crew lead. Vehicles: any number per job (`job_vehicles`; the old per-employee vehicle column is deprecated).
- **Conflicts** — `job_resource_conflicts()` checks the proposed crew and vehicles against the job's time window (date + start + duration, Europe/Zurich):

| Conflict | Meaning |
|---|---|
| `employee_double_booked` | overlapping active job (same day, non-overlapping hours is fine) |
| `employee_absent` | vacation / sick / other on that date |
| `employee_inactive` | employee not active |
| `vehicle_double_booked` | vehicle on an overlapping active job |
| `vehicle_unavailable` | vehicle in maintenance or retired |
| `vehicle_inspection_due` | inspection (MFK) date before the job date |

- Saving with conflicts is refused and the conflicts are shown; the dispatcher can **assign anyway** — the override is recorded in the activity log with the conflict types.
- Every assignment is audited; system tasks ("assign crew to job …") update immediately.

## 4. Crew (`/employees`)

Name, role (foreman, mover, driver, specialist), mobile, e-mail, driving licence class and expiry, status, notes, hourly cost (owners only; others never see or overwrite it). Absences with type and date range; shown on the board and checked on assignment.

## 5. Fleet (`/vehicles`)

Name, licence plate (normalised `ZH 123456`), type (Swiss labels: delivery van, truck 3.5 t / 7.5 t / 12 t / 18 t+), load volume m³, payload kg, status, next inspection (MFK), insurance expiry, make/model, notes. Dates within 30 days are highlighted.

## 6. System Tasks (new rules)

| Rule | Condition |
|---|---|
| `vehicle.inspection_due` | MFK within 30 days |
| `vehicle.insurance_expiring` | insurance expires within 30 days |
| `employee.licence_expiring` | driving licence expires within 30 days |

## 7. Permissions

| Action | Permission |
|---|---|
| See jobs and board | `jobs.view` |
| Create job | `jobs.create` |
| Schedule, confirm, start, hold | `jobs.edit` |
| Assign crew and vehicles | `jobs.assign` |
| Complete | `jobs.complete` |
| Cancel | `jobs.cancel` |
| Employees / absences | `employees.view / create / edit / delete` |
| Vehicles | `vehicles.view / create / edit / delete` |

## 8. Not in this phase

Drag-and-drop on the board, crew mobile app (clock in/out, photos, signatures), multi-stop jobs, capacity check against inventory volume. The final settlement (Abrechnung) is part of invoicing (docs/INVOICES.md).

## 9. Local Development

`instrumentation.ts` starts a development-only loop (`lib/events/dev-loop.ts`) that processes domain events every 3 seconds and re-evaluates tasks every minute, so effects like "quote accepted → job created" appear immediately. Production uses the Vercel cron routes. `DEV_EVENT_LOOP=off` disables the loop.
