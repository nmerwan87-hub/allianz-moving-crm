import { createServiceRoleClient } from "@/lib/supabase/service-role"
import { portalDocument } from "@/lib/portal/service"

export const dynamic = "force-dynamic"

export async function GET(_req: Request, { params }: { params: Promise<{ token: string }> }) {
  const { token } = await params
  const doc = await portalDocument(createServiceRoleClient(), "invoice", token)
  if (!doc) return new Response("Nicht gefunden", { status: 404 })
  return new Response(doc.pdf, {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `inline; filename="${encodeURIComponent(doc.fileName)}"`,
      "Cache-Control": "private, no-store",
      "X-Robots-Tag": "noindex",
    },
  })
}
