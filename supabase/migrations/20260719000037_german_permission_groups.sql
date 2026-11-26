-- =============================================================
-- 037 — Predefined permission groups in German
-- =============================================================
-- Provisioning creates these four groups per company; existing companies
-- get the same German names (only where the English default is unchanged).

UPDATE permission_groups g
   SET name = v.de_name, description = v.de_description, updated_at = now()
  FROM (VALUES
    ('Dispatcher',     'Disposition',          'Teilt Teams und Fahrzeuge ein, plant Aufträge und koordiniert den Tag.'),
    ('Estimator',      'Offerten und Verkauf', 'Bearbeitet Anfragen, erstellt und sendet Offerten.'),
    ('Office Manager', 'Büroleitung',          'Alles im Tagesgeschäft, ausser Bankverbindung und Finanzexporte.'),
    ('Billing',        'Buchhaltung',          'Rechnungen, Zahlungen und Mahnungen.')
  ) AS v(en_name, de_name, de_description)
 WHERE g.name = v.en_name
   AND g.deleted_at IS NULL
   AND NOT EXISTS (
     SELECT 1 FROM permission_groups other
      WHERE other.company_id = g.company_id AND other.name = v.de_name AND other.deleted_at IS NULL
   );
