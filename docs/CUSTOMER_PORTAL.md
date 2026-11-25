# Customer portal

Customers open their quote or invoice through a secret link — no account, no login.

## Links

| Record  | URL             | Sent with                                  |
| ------- | --------------- | ------------------------------------------ |
| Quote   | `/p/o/<token>`  | Quote e-mail (button), «Kundenlink kopieren» |
| Invoice | `/p/r/<token>`  | Invoice and reminder e-mails, «Kundenlink kopieren» |

- The token is `HMAC-SHA256(PORTAL_TOKEN_SECRET, "<kind>:<id>")` (base64url, 43 characters),
  so the same link can be sent again without storing it (`lib/portal/token.ts`).
- The database stores only `sha256(token)` in `portal_token` plus `portal_token_expires_at`:
  quotes 60 days after their validity, invoices one year after the due date.
- Rotating `PORTAL_TOKEN_SECRET` invalidates every link. Without it (development only) the
  secret is derived from the service role key; production refuses to start a link without it.
- `/p/` is public in `middleware.ts`. Pages read through the service role and only by token
  (`lib/portal/service.ts`); drafts are never shown.

## What the customer can do

- **Quote:** see move, prices with calculation, total, cost cap, deposit, PDF; accept with typed
  name and confirmation (stored in `quotes.accepted_by_name`, `terms_accepted_at`) or decline
  with a reason. Accepting runs the normal workflow (`sent|viewed → accepted`), so the job is
  created exactly as when the office marks it accepted.
- **Invoice:** see the open amount, due date, IBAN, reference, lines and the PDF with QR-bill.
- Opening marks the record `viewed` (first time) and counts views. Accept/decline are logged in
  `activity_logs` with `actor_type = 'customer'`, the typed name, IP and user agent.

## Not yet

- Online payment (Stripe) — the invoice page shows the QR-bill details instead.
- Portal texts are German; the PDF and e-mail follow the quote language.
