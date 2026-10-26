import type { Browser } from "puppeteer-core"

/**
 * HTML → PDF with headless Chrome (PDF_ENGINE.md §11.1: Puppeteer).
 *
 * Browser source, in order:
 *   1. BROWSERLESS_WS_ENDPOINT — managed Chrome (production on serverless)
 *   2. CHROME_EXECUTABLE_PATH  — a local Chrome/Chromium binary
 *   3. the default Google Chrome location on macOS (local development)
 */

const MAC_CHROME = "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome"

export const RENDERER_VERSION = "puppeteer-core@24/chrome"

async function openBrowser(): Promise<Browser> {
  const puppeteer = await import("puppeteer-core")
  const endpoint = process.env["BROWSERLESS_WS_ENDPOINT"]
  if (endpoint) return puppeteer.connect({ browserWSEndpoint: endpoint })

  return puppeteer.launch({
    executablePath: process.env["CHROME_EXECUTABLE_PATH"] ?? MAC_CHROME,
    headless: true,
    args: ["--no-sandbox", "--disable-dev-shm-usage", "--font-render-hinting=none"],
  })
}

export interface RenderOptions {
  /** Text in the page footer, e.g. "Offerte QT-2026-0001 · Version 1". */
  footerText: string
  pageLabel: string
  ofLabel: string
}

export async function renderPdf(html: string, options: RenderOptions): Promise<Buffer> {
  const browser = await openBrowser()
  try {
    const page = await browser.newPage()
    // Documents load only their own logo from our storage; nothing else may
    // run or load (no scripts, no requests to other hosts).
    await page.setJavaScriptEnabled(false)
    const storagePrefix = `${process.env["NEXT_PUBLIC_SUPABASE_URL"] ?? ""}/storage/v1/object/public/`
    await page.setRequestInterception(true)
    page.on("request", (request) => {
      const url = request.url()
      if (url.startsWith("data:") || url === "about:blank" || url.startsWith(storagePrefix)) {
        void request.continue()
      } else {
        void request.abort()
      }
    })
    await page.setContent(html, { waitUntil: "load", timeout: 20_000 })

    const footer = `
      <div style="width:100%;font-family:Helvetica,Arial,sans-serif;font-size:7.5pt;color:#6b7280;padding:0 18mm;display:flex;justify-content:space-between;">
        <span>${options.footerText.replace(/[<>&]/g, "")}</span>
        <span>${options.pageLabel} <span class="pageNumber"></span> ${options.ofLabel} <span class="totalPages"></span></span>
      </div>`

    const pdf = await page.pdf({
      format: "A4",
      printBackground: true,
      displayHeaderFooter: true,
      headerTemplate: "<span></span>",
      footerTemplate: footer,
      margin: { top: "16mm", bottom: "18mm", left: "0", right: "0" },
    })

    const buffer = Buffer.from(pdf)
    if (buffer.subarray(0, 5).toString("ascii") !== "%PDF-") {
      throw new Error("Renderer did not produce a PDF")
    }
    return buffer
  } finally {
    await browser.close()
  }
}
