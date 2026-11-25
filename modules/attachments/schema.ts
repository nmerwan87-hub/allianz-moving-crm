import { z } from "zod"

export const attachmentEntityEnum = z.enum(["lead", "customer", "quote", "job"])
export const ALLOWED_MIME_TYPES = [
  "image/jpeg",
  "image/png",
  "image/webp",
  "image/heic",
  "application/pdf",
  "video/mp4",
  "video/quicktime",
] as const
export const MAX_ATTACHMENT_BYTES = 25 * 1024 * 1024

const target = {
  entityType: attachmentEntityEnum,
  entityId: z.string().uuid(),
}

export const listAttachmentsInput = z.object(target)

export const createUploadInput = z.object({
  ...target,
  fileName: z.string().trim().min(1).max(255),
  mimeType: z.enum(ALLOWED_MIME_TYPES, { message: "Erlaubt sind Fotos, Videos und PDF." }),
  sizeBytes: z.number().int().positive().max(MAX_ATTACHMENT_BYTES, "Höchstens 25 MB pro Datei."),
})

export const confirmUploadInput = createUploadInput.extend({ path: z.string().min(1).max(500) })
export const attachmentIdInput = z.object({ id: z.string().uuid() })

export interface Attachment {
  id: string
  fileName: string
  mimeType: string
  sizeBytes: number
  createdAt: string
}
