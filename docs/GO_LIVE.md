# Live-Betrieb — Bivro für die eigenen Firmen

Checkliste, um Bivro für die drei eigenen Firmen live zu schalten (ohne Abo-Abrechnung, ohne KI).
Punkte mit **(du)** brauchen ein Konto, eine Zahlung oder eine DNS-Änderung; alles andere ist im
Code vorbereitet.

## 1. Konten (du)

| Dienst | Wofür | Plan / Hinweis |
|---|---|---|
| **Supabase** | Datenbank, Login, Dateien | **Pro** (tägliche Backups, schläft nicht ein). Region: Zürich (`eu-central-2`), falls angeboten, sonst Frankfurt (`eu-central-1`). |
| **Vercel** | Hosting der App | **Pro** — die Ereignis-Verarbeitung läuft jede Minute (`vercel.json`); der Gratis-Plan erlaubt nur tägliche Cron-Jobs. Region `fra1` ist eingestellt. |
| **Domain** | z. B. `app.deine-domain.ch` und `mail.deine-domain.ch` | beim Domain-Anbieter |
| **Resend** | E-Mails (Offerten, Rechnungen, Automatik, Einladungen) | `mail.deine-domain.ch` verifizieren (SPF/DKIM-Einträge beim Domain-Anbieter) |
| **Browserless** | PDFs (Offerten, Rechnungen mit QR-Zahlteil) | verwaltetes Chrome, europäische Region; liefert `BROWSERLESS_WS_ENDPOINT` |
| Sentry (optional) | Fehlermeldungen | `SENTRY_DSN` |

## 2. Datenbank (einmalig)

```bash
pnpm exec supabase link --project-ref <project-ref>
pnpm exec supabase db push
```

`db push` spielt alle Migrationen aus `supabase/migrations` ein (001–037).
`supabase/seed-local.ts` **nie** gegen die Produktion laufen lassen.

Im Supabase-Dashboard:

- **Authentication → URL Configuration:** Site URL `https://app.deine-domain.ch`;
  Redirect URLs `https://app.deine-domain.ch/**`.
- **Authentication → Emails → Reset Password:** Betreff «Neues Passwort für Bivro», Text aus
  `supabase/templates/recovery.html`.
- **Authentication → SMTP:** Resend-SMTP (`smtp.resend.com`, Benutzer `resend`, Passwort = API-Key,
  Absender `bivro@mail.deine-domain.ch`), damit Passwort-E-Mails von deiner Domain kommen.
- **Database → Backups:** tägliche Backups sind in Pro dabei; Point-in-Time-Recovery ist ein
  Zusatz (empfohlen, sobald echte Kunden drin sind).

## 3. Umgebungsvariablen (Vercel → Settings → Environment Variables)

Vorlage ist `.env.example`. Für den Live-Betrieb nötig (mit dem Skript unten prüfen):

`NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY`,
`NEXT_PUBLIC_APP_URL`, `CRON_SECRET`, `PORTAL_TOKEN_SECRET`, `RESEND_API_KEY`,
`EMAIL_SENDER_DOMAIN`, `BROWSERLESS_WS_ENDPOINT`, optional `SENTRY_DSN`.

```bash
openssl rand -base64 48   # je einmal für CRON_SECRET und PORTAL_TOKEN_SECRET
npx tsx --env-file=.env.production.local scripts/check-env.ts
```

`PORTAL_TOKEN_SECRET` nach dem Start **nie mehr ändern** — sonst funktionieren alle Kundenlinks
nicht mehr. Stripe-, Anthropic- und Plattform-Admin-Variablen braucht es für die eigene Nutzung
nicht.

## 4. Veröffentlichen

In Vercel das GitHub-Repository verbinden, Branch `main`. Vercel baut mit `pnpm build` und legt die
Cron-Jobs aus `vercel.json` an. `app.deine-domain.ch` per CNAME auf Vercel zeigen lassen.

## 5. Deine drei Firmen

Einmal pro Firma (gleiche Inhaber-E-Mail → ein Login mit Firmenwechsler):

```bash
npx tsx --env-file=.env.production.local scripts/create-company.ts \
  --name "Firma A" --legal-name "Firma A Umzüge GmbH" \
  --owner-email du@deine-domain.ch --first-name Vorname --last-name Nachname
```

Beim ersten Mal gibt das Skript einen Link aus, mit dem du dein Passwort festlegst. Danach in
Bivro pro Firma: Einstellungen → Firmendaten (Adresse, UID, Logo, Farbe), Bankverbindung
(IBAN / QR-IBAN), Ansätze und Bedingungen, Leistungen; Team und Rechte → Mitarbeitende einladen;
E-Mail-Automatik → einschalten, was du willst.

## 6. Kurztest nach dem Start

1. Einloggen, zwischen den drei Firmen wechseln.
2. Neue Anfrage → Offerte → an **deine eigene** E-Mail senden → Link in der E-Mail auf dem Handy
   öffnen → annehmen → Auftrag erscheint unter Aufträge und im Kalender.
3. Auftrag: Team einteilen → erledigt → Schlussabrechnung → Rechnung an deine E-Mail → PDF mit
   QR-Zahlteil in der Banking-App scannen → Zahlung erfassen.
4. Mitarbeitende einladen (deine zweite E-Mail) → Passwort festlegen → sieht nur, was die Gruppe
   erlaubt.
5. `https://app.deine-domain.ch/api/health` antwortet `{"status":"ok"}` (für eine
   Verfügbarkeits-Überwachung verwenden).

## Im Code schon vorbereitet

- Sicherheits-Header (HSTS, kein Einbetten, kein MIME-Sniffing; Kundenportal ohne Referrer und
  nicht in Suchmaschinen).
- Cron-Jobs nur für vorhandene Routen; jeder Aufruf braucht `CRON_SECRET`.
- Kundenportal-Links: nur Hashes gespeichert, Ablaufdatum, kein Login nötig
  (`docs/CUSTOMER_PORTAL.md`).
- Automatische E-Mails erst nach dem Einschalten, nie doppelt, Abmeldungen werden respektiert.
