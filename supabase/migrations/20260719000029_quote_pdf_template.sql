-- =============================================================
-- Migration 029: Quote PDF template v1 (all languages)
-- =============================================================
-- PDF_ENGINE.md §11.2: templates are versioned HTML in the database.
-- One template serves all languages ('all'); fixed texts arrive as
-- label_* variables (lib/documents/labels.ts).
--
-- {{ x }} is escaped. {{{ x }}} is raw and only used for fragments the
-- server builds from escaped values (lib/documents/quote-document.ts).
-- Layout: A4, Swiss window envelope (recipient on the right, SN 010130).
-- =============================================================

INSERT INTO document_templates (
  document_type, language, jurisdiction_profile, name, version, is_current,
  template_html, variables_required, released_at, released_by
) VALUES (
  'quote_pdf', 'all', 'CH', 'Quote — Swiss standard', '1', true,
$tpl$<!doctype html>
<html lang="{{ language }}">
<head>
<meta charset="utf-8">
<title>{{ label_document_title }} {{ quote_number }}</title>
<style>
  @page { size: A4; }
  * { box-sizing: border-box; }
  body { margin: 0; font-family: "Helvetica Neue", Helvetica, Arial, sans-serif; font-size: 9.5pt; color: #1f2937; line-height: 1.45; }
  .page { padding: 0 18mm; }
  .accent { color: {{ accent_color }}; }
  .header { display: flex; justify-content: space-between; align-items: flex-start; min-height: 26mm; }
  .logo img { max-height: 20mm; max-width: 60mm; object-fit: contain; }
  .logo .name { font-size: 15pt; font-weight: 700; }
  .company { text-align: right; font-size: 8.5pt; color: #4b5563; }
  .company strong { color: #111827; font-size: 9.5pt; }
  .address-row { display: flex; justify-content: space-between; margin-top: 12mm; min-height: 38mm; }
  .sender-line { font-size: 7pt; color: #6b7280; border-bottom: 0.5pt solid #9ca3af; padding-bottom: 1mm; margin-bottom: 2mm; }
  .recipient { width: 85mm; margin-left: auto; }
  .meta { width: 70mm; font-size: 8.5pt; }
  .meta td { padding: 0.6mm 0; vertical-align: top; }
  .meta td:first-child { color: #6b7280; padding-right: 4mm; white-space: nowrap; }
  h1 { font-size: 17pt; margin: 8mm 0 1mm; font-weight: 700; }
  h1 .number { font-weight: 400; color: #6b7280; font-size: 12pt; }
  .subtitle { color: #4b5563; margin-bottom: 6mm; }
  h2 { font-size: 10pt; text-transform: uppercase; letter-spacing: 0.04em; margin: 7mm 0 2mm; padding-bottom: 1mm; border-bottom: 1.5pt solid {{ accent_color }}; }
  table { width: 100%; border-collapse: collapse; }
  .details td { padding: 1mm 0; vertical-align: top; }
  .details td:first-child { width: 38mm; color: #6b7280; }
  .items th { text-align: left; font-size: 8pt; color: #6b7280; font-weight: 600; padding: 1.5mm 1.5mm; border-bottom: 0.75pt solid #d1d5db; }
  .items th.num { text-align: right; }
  .items td { padding: 2mm 1.5mm; border-bottom: 0.5pt solid #e5e7eb; vertical-align: top; }
  .items tr { page-break-inside: avoid; }
  .num { text-align: right; white-space: nowrap; font-variant-numeric: tabular-nums; }
  .pos { width: 9mm; color: #6b7280; }
  .desc { color: #6b7280; font-size: 8.5pt; }
  .estimate { color: #6b7280; }
  .totals { width: 80mm; margin-left: auto; margin-top: 3mm; page-break-inside: avoid; }
  .totals td { padding: 1mm 1.5mm; }
  .totals .grand td { font-weight: 700; font-size: 11pt; border-top: 1.2pt solid #111827; padding-top: 2mm; }
  .totals .muted td { color: #6b7280; }
  .box { margin-top: 5mm; padding: 3mm 4mm; border-left: 2pt solid {{ accent_color }}; background: #f9fafb; page-break-inside: avoid; }
  .box strong { display: block; margin-bottom: 1mm; }
  .small { font-size: 8pt; color: #6b7280; }
  .footer-block { margin-top: 10mm; font-size: 8pt; color: #6b7280; border-top: 0.5pt solid #e5e7eb; padding-top: 3mm; page-break-inside: avoid; }
</style>
</head>
<body>
<div class="page">
  <div class="header">
    <div class="logo">{{{ logo_html }}}</div>
    <div class="company">{{{ company_block_html }}}</div>
  </div>

  <div class="address-row">
    <table class="meta">
      <tr><td>{{ label_quote_number }}</td><td>{{ quote_number }}</td></tr>
      <tr><td>{{ label_version }}</td><td>{{ quote_version }}</td></tr>
      <tr><td>{{ label_issue_date }}</td><td>{{ issue_date }}</td></tr>
      <tr><td>{{ label_valid_until }}</td><td>{{ valid_until }}</td></tr>
    </table>
    <div class="recipient">
      <div class="sender-line">{{ sender_line }}</div>
      {{{ recipient_html }}}
    </div>
  </div>

  <h1>{{ label_document_title }} <span class="number">{{ quote_number }}</span></h1>
  <div class="subtitle">{{ quote_title }}</div>

  <h2>{{ label_move_details }}</h2>
  <table class="details">{{{ move_details_rows }}}</table>

  <h2>{{ label_services }}</h2>
  <table class="items">
    <thead>
      <tr>
        <th class="pos">{{ label_col_pos }}</th>
        <th>{{ label_col_service }}</th>
        <th class="num">{{ label_col_quantity }}</th>
        <th class="num">{{ label_col_price }}</th>
        <th class="num">{{ label_col_amount }}</th>
      </tr>
    </thead>
    <tbody>{{{ item_rows }}}</tbody>
  </table>

  <table class="totals">{{{ totals_rows }}}</table>

  {{{ estimate_note_html }}}
  {{{ cost_cap_html }}}
  {{{ notes_html }}}

  <div class="box">
    <strong>{{ label_acceptance }}</strong>
    {{ label_acceptance_text }}
  </div>

  <div class="footer-block">{{{ footer_html }}}</div>
</div>
</body>
</html>$tpl$,
  ARRAY['quote_number', 'quote_version', 'issue_date', 'valid_until', 'accent_color', 'language'],
  now(),
  'migration-029'
);
