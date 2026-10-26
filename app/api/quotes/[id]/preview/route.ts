import { NextResponse } from "next/server"
import { createContext } from "@/lib/trpc/context"
import { createServiceRoleClient } from "@/lib/supabase/service-role"
import { getCachedPermissions } from "@/modules/iam/lib/permissions"
import { buildQuoteDocument, renderQuotePdf } from "@/lib/documents/quote-document"

// Puppeteer needs the Node.js runtime
export const runtime = "nodejs"

/**
 * Renders the current state of a quote as PDF without storing it — the
 * preview before sending. Sent quotes are served from their stored document
 * (iam: quotes.documentUrl), not re-rendered.
 */
export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  if (!/^[0-9a-f-]{36}$/i.test(id)) return new NextResponse("Not found", { status: 404 })

  const ctx = await createContext()
  if (!ctx.user || !ctx.companyId) return new NextResponse("Unauthorized", { status: 401 })
  if (ctx.role !== "owner") {
    const perms = await getCachedPermissions(ctx.user.id, ctx.companyId)
    if (!perms.keys.has("quotes.view")) return new NextResponse("Forbidden", { status: 403 })
  }

  // Visibility check with the user's own client (RLS: active company only)
  const { data: visible } = await ctx.supabase
    .from("quotes")
    .select("id")
    .eq("id", id)
    .maybeSingle()
  if (!visible) return new NextResponse("Not found", { status: 404 })

  try {
    const document = await buildQuoteDocument(createServiceRoleClient(), id)
    const pdf = await renderQuotePdf(document)
    return new NextResponse(new Uint8Array(pdf), {
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": `inline; filename="preview-${document.quote.quote_number}.pdf"`,
        "Cache-Control": "no-store",
      },
    })
  } catch (err) {
    console.error("[quotes:preview]", err)
    return new NextResponse("Preview failed", { status: 500 })
  }
}
