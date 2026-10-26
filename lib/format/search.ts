/**
 * Makes free-text search safe to embed in a PostgREST `.or()` filter.
 *
 * `.or("first_name.ilike.%x%,…")` is parsed by PostgREST: commas, dots in
 * operator position, parentheses and quotes in user input would change the
 * filter itself. ilike wildcards (% _) and the escape character are removed
 * too, so the user's text is matched literally. Returns null when nothing
 * searchable is left.
 */
export function sanitizeSearch(input: string | null | undefined): string | null {
  if (!input) return null
  const cleaned = input
    .replace(/[,()"'\\%_*:]/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 100)
  return cleaned.length > 0 ? cleaned : null
}
