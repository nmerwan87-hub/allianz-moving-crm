-- =============================================================
-- 036 — E-mail automation (V1, no AI)
-- =============================================================
-- Six automatic customer e-mails per company, all off until the company
-- switches them on: quote follow-up, quote expiry warning, booking
-- confirmation, move reminder, thank-you after the move, payment received.
-- A run is recorded once per automation and record, so nothing is sent twice.

ALTER TABLE email_automations ADD COLUMN activated_at timestamptz;

-- One run per automation and record (sent, waiting for approval, skipped …)
CREATE UNIQUE INDEX idx_email_automation_runs_once
  ON email_automation_runs(automation_id, entity_id);

CREATE INDEX idx_email_automation_runs_company_created
  ON email_automation_runs(company_id, created_at DESC);

-- German names and sensible timing for the automations Bivro uses.
-- Delay: seconds after the trigger (negative = before the move/expiry).
UPDATE email_automations a
   SET name = v.name,
       description = v.description,
       trigger_delay_seconds = v.delay,
       mode = 'auto_send'
  FROM email_templates t,
       (VALUES
         ('quote-follow-up-1',    'Offerte nachfassen',          'Freundliche Nachfrage, wenn der Kunde noch nicht geantwortet hat.', 3 * 86400),
         ('quote-expiry-warning', 'Offerte läuft bald ab',       'Hinweis kurz bevor die Offerte abläuft.',                           -2 * 86400),
         ('booking-confirmed',    'Buchungsbestätigung',         'Bestätigung, sobald die Offerte angenommen ist.',                   0),
         ('move-reminder',        'Erinnerung vor dem Umzug',    'Erinnerung mit Datum, Zeit und Adressen vor dem Umzugstag.',        -2 * 86400),
         ('post-move-thank-you',  'Dankeschön nach dem Umzug',   'Dank nach dem erledigten Auftrag.',                                 86400),
         ('payment-confirmed',    'Zahlung erhalten',            'Bestätigung, wenn die Rechnung vollständig bezahlt ist.',           0)
       ) AS v(slug, name, description, delay)
 WHERE t.id = a.template_id
   AND t.slug = v.slug;

-- Runs belong to their automation and template (also lets the API join the name)
ALTER TABLE email_automation_runs
  ADD CONSTRAINT email_automation_runs_automation_fk
    FOREIGN KEY (automation_id) REFERENCES email_automations(id) ON DELETE CASCADE,
  ADD CONSTRAINT email_automation_runs_template_fk
    FOREIGN KEY (template_id) REFERENCES email_templates(id) ON DELETE CASCADE;
