/**
 * Template compilation for document HTML (PDF_ENGINE.md §11.2).
 *
 *   {{ name }}   value, HTML-escaped — for everything that comes from users
 *   {{{ name }}} raw HTML — only for fragments built and escaped on the server
 *
 * Every token must resolve; an unresolved token aborts generation instead of
 * printing "{{ … }}" on a customer document.
 */

const ESCAPES: Record<string, string> = {
  "&": "&amp;",
  "<": "&lt;",
  ">": "&gt;",
  '"': "&quot;",
  "'": "&#39;",
}

export function escapeHtml(value: unknown): string {
  return String(value ?? "").replace(/[&<>"']/g, (c) => ESCAPES[c]!)
}

/** Escaped text with line breaks preserved as <br>. */
export function escapeMultiline(value: string | null | undefined): string {
  return escapeHtml(value ?? "").replace(/\r?\n/g, "<br>")
}

export class UnresolvedTemplateTokenError extends Error {
  constructor(public readonly tokens: string[]) {
    super(`Unresolved template tokens: ${tokens.join(", ")}`)
  }
}

export function compileTemplate(
  html: string,
  values: Record<string, string | number | null | undefined>,
  raw: Record<string, string> = {},
): string {
  const missing = new Set<string>()

  const withRaw = html.replace(/\{\{\{\s*([a-z0-9_]+)\s*\}\}\}/gi, (_, key: string) => {
    if (!(key in raw)) {
      missing.add(key)
      return ""
    }
    return raw[key]!
  })

  const output = withRaw.replace(/\{\{\s*([a-z0-9_]+)\s*\}\}/gi, (_, key: string) => {
    if (!(key in values)) {
      missing.add(key)
      return ""
    }
    return escapeHtml(values[key])
  })

  if (missing.size > 0) throw new UnresolvedTemplateTokenError([...missing])
  return output
}
