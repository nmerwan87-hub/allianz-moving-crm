# Bivro — UX Principles

Status: **Applied** (branch feature/ux-simplify, migration 033) · 2026-10-26

The owner's verdict on the first version: it looked unorganised and creating a quote was too complicated. Bivro must be as simple as Bixin and still more complete.

## Rules

1. **German everywhere** (Swiss terms: Offerte, Auftrag, Rechnung, Anfrage, MWST, Kostendach, Zügelmann). Enum values are shown through `app/(dashboard)/_lib/labels.ts`; database rule errors are translated in `modules/workflow/transitions.ts` (the database keeps English messages for developers and tests of the raw DB).
2. **One page per task, numbered steps**, live totals on the right. Advanced fields sit behind «Weitere Angaben» or a detail view, never in the main flow.
3. **The system fills what it can**: VAT from the company settings, cost prices from catalog and team rates, addresses from the inquiry, customer from the inquiry.
4. **Money**: always `CHF 1'234.50`, right-aligned, tabular figures, never wrapped.
5. **Calm design**: flat cards with hairline borders, small section headings, table headers in normal case, pill badges with a clear meaning (grey = draft/neutral, blue = open, amber = attention, green = done, red = problem).
6. **No dead ends**: the menu shows only pages that exist; every list has a German empty state with the next action.

## Quote form (Bixin-style)

Customer → Umzug (date, rooms, type, from/to with floor and lift) → Preis («Nach Aufwand»: team, hourly rate, estimated hours, optional Kostendach; «Pauschal»: one amount) → Zusatzleistungen (catalog chips, quantity, «inklusive») → Bemerkung → Total. The form writes ordinary quote lines; `quotes.pricing_kind`, `crew_size`, `rooms` and `rate_card_id` (migration 033) remember how it was entered. Discounts, VAT rates and cost prices remain available in «Positionen im Detail bearbeiten».

From an inquiry, «Offerte erstellen» opens the quote directly; the customer is created from the inquiry when missing.

## Overview page

Start page for daily work: open and overdue invoice amounts, jobs in the next 7 days (crew assigned/needed), system tasks (German titles), open quotes.
