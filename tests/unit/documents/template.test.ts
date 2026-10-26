import { describe, it, expect } from "vitest"
import {
  compileTemplate,
  escapeHtml,
  escapeMultiline,
  UnresolvedTemplateTokenError,
} from "@/lib/documents/template"
import { formatDocumentDate } from "@/lib/documents/labels"

describe("compileTemplate", () => {
  it("escapes values and inserts raw fragments", () => {
    const html = compileTemplate(
      "<p>{{ name }}</p><table>{{{ rows }}}</table>",
      { name: `<script>alert("x")</script>` },
      { rows: "<tr><td>1</td></tr>" },
    )
    expect(html).toBe(
      "<p>&lt;script&gt;alert(&quot;x&quot;)&lt;/script&gt;</p><table><tr><td>1</td></tr></table>",
    )
  })

  it("never treats a value as a raw fragment", () => {
    expect(() => compileTemplate("{{{ name }}}", { name: "<b>x</b>" })).toThrow(
      UnresolvedTemplateTokenError,
    )
  })

  it("fails on unresolved tokens instead of printing them", () => {
    try {
      compileTemplate("{{ a }} {{ b }}", { a: "1" })
      expect.unreachable()
    } catch (err) {
      expect(err).toBeInstanceOf(UnresolvedTemplateTokenError)
      expect((err as UnresolvedTemplateTokenError).tokens).toEqual(["b"])
    }
  })

  it("renders empty values as empty strings", () => {
    expect(compileTemplate("[{{ a }}]", { a: null })).toBe("[]")
  })
})

describe("escaping helpers", () => {
  it("escapes all HTML special characters", () => {
    expect(escapeHtml(`&<>"'`)).toBe("&amp;&lt;&gt;&quot;&#39;")
  })

  it("keeps line breaks", () => {
    expect(escapeMultiline("a\n<b>")).toBe("a<br>&lt;b&gt;")
  })
})

describe("formatDocumentDate", () => {
  it("formats per language without time-zone shift", () => {
    expect(formatDocumentDate("2026-11-30", "de")).toBe("30. November 2026")
    expect(formatDocumentDate("2026-11-30T23:30:00Z", "fr")).toBe("30 novembre 2026")
    expect(formatDocumentDate(null, "de")).toBe("")
  })
})
