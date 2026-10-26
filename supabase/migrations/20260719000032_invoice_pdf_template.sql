-- =============================================================
-- Migration 032: Invoice / reminder PDF template v1 (all languages)
-- =============================================================
-- Same letterhead and window-envelope layout as the quote (migration 029).
-- The last page carries the Swiss QR-bill payment part (210 × 105 mm,
-- receipt + payment part, perforation line) at the bottom of an otherwise
-- empty A4 page without margins or page footer, as required by the Swiss
-- Payment Standards for print and PDF.
--
-- {{{ qr_bill_svg }}} is produced by swissqrbill (lib/documents/qr-bill.ts);
-- all other raw fragments are built from escaped values
-- (lib/documents/invoice-document.ts).
-- =============================================================

INSERT INTO document_templates (
  document_type, language, jurisdiction_profile, name, version, is_current,
  template_html, variables_required, released_at, released_by
) VALUES (
  'invoice_pdf', 'all', 'CH', 'Invoice with QR-bill — Swiss standard', '1', true,
$tpl$<!doctype html>
<html lang="{{ language }}">
<head>
<meta charset="utf-8">
<title>{{ document_title }} {{ invoice_number }}</title>
<style>
  /* Page footer as CSS margin boxes (renderer option cssPages); the QR-bill
     page has no margins and therefore no footer. */
  @page {
    size: A4;
    margin: 16mm 0 18mm;
    @bottom-left { content: "{{ page_footer_text }}"; padding-left: 18mm; font: 7.5pt Helvetica, Arial, sans-serif; color: #6b7280; }
    @bottom-right { content: "{{ label_page }} " counter(page) " {{ label_of }} " counter(pages); padding-right: 18mm; font: 7.5pt Helvetica, Arial, sans-serif; color: #6b7280; }
  }
  @page qrbill { size: A4; margin: 0; }
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
  .intro { margin: 0 0 5mm; }
  .totals .due td { font-weight: 700; font-size: 11pt; border-top: 1.2pt solid #111827; padding-top: 2mm; }
  .qr-page { page: qrbill; break-before: page; position: relative; width: 210mm; height: 297mm; }
  .qr-page .qr-head { padding: 16mm 18mm 0; font-size: 9.5pt; color: #4b5563; }
  .qr-page .qr-head strong { color: #111827; }
  .qr-page .slip { position: absolute; left: 0; bottom: 0; width: 210mm; height: 105mm; }
  .qr-page .slip svg { display: block; width: 210mm; height: 105mm; }
</style>
</head>
<body>
<div class="page">
  <div class="header">
    <div class="logo">{{{ logo_html }}}</div>
    <div class="company">{{{ company_block_html }}}</div>
  </div>

  <div class="address-row">
    <table class="meta">{{{ meta_rows }}}</table>
    <div class="recipient">
      <div class="sender-line">{{ sender_line }}</div>
      {{{ recipient_html }}}
    </div>
  </div>

  <h1>{{ document_title }} <span class="number">{{ invoice_number }}</span></h1>
  <div class="subtitle">{{ invoice_title }}</div>

  {{{ intro_html }}}

  {{{ move_details_html }}}

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

  {{{ cost_cap_html }}}
  {{{ notes_html }}}

  <div class="box">
    <strong>{{ label_payment }}</strong>
    {{ payment_text }}
  </div>
  <p>{{ closing_text }}</p>

  <div class="footer-block">{{{ footer_html }}}</div>
</div>

<section class="qr-page">
  <div class="qr-head"><strong>{{ document_title }} {{ invoice_number }}</strong> · {{ qr_head_text }}</div>
  <div class="slip">{{{ qr_bill_svg }}}</div>
</section>
</body>
</html>$tpl$,
  ARRAY['invoice_number', 'document_title', 'accent_color', 'language', 'qr_bill_svg', 'page_footer_text'],
  now(),
  'migration-032'
);
