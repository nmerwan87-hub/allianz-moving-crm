/**
 * Generates a URL-safe company slug from the legal name.
 * Strips diacritics, lowercases, replaces spaces/special chars with hyphens.
 */
export function generateBaseSlug(legalName: string): string {
  return legalName
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 63)
}

/**
 * Returns a unique slug by appending -2, -3, … until no match.
 * `existsFn` must return true if the given slug is already taken.
 */
export async function uniqueSlug(
  baseSlug: string,
  existsFn: (slug: string) => Promise<boolean>,
): Promise<string> {
  if (!(await existsFn(baseSlug))) return baseSlug

  let n = 2
  while (n <= 999) {
    const candidate = `${baseSlug}-${n}`
    if (!(await existsFn(candidate))) return candidate
    n++
  }

  throw new Error("Unable to generate a unique slug after 999 attempts")
}
