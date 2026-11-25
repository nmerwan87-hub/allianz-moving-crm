// Public API for attachments (photos, videos, PDFs on inquiries, customers, quotes, jobs).
// Client components import from here; the router is imported by lib/trpc/router.ts directly.

export type { Attachment } from "./schema"
export { ALLOWED_MIME_TYPES, MAX_ATTACHMENT_BYTES, attachmentEntityEnum } from "./schema"
