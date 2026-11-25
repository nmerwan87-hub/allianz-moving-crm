"use client"

import { useRef, useState } from "react"
import { FileText, Film, Image as ImageIcon, Trash2, Upload } from "lucide-react"
import { trpc } from "@/lib/trpc/client"
import { createClient } from "@/lib/supabase/client"
import { Button } from "@/app/(dashboard)/_components/ui/button"
import { useToast } from "@/app/(dashboard)/_components/ui/toast"
import { cn } from "@/app/(dashboard)/_lib/cn"
import {
  ALLOWED_MIME_TYPES,
  MAX_ATTACHMENT_BYTES,
  type Attachment,
} from "@/modules/attachments/interface"

type EntityType = "lead" | "customer" | "quote" | "job"

function sizeLabel(bytes: number): string {
  return bytes >= 1024 * 1024
    ? `${(bytes / 1024 / 1024).toFixed(1)} MB`
    : `${Math.max(1, Math.round(bytes / 1024))} KB`
}

function Icon({ mime }: { mime: string }) {
  if (mime.startsWith("image/")) return <ImageIcon className="h-4 w-4" />
  if (mime.startsWith("video/")) return <Film className="h-4 w-4" />
  return <FileText className="h-4 w-4" />
}

/** Photos, videos and PDFs (Bixin: "Medien"): drop or pick files, open, remove. */
export function AttachmentsBlock({
  entityType,
  entityId,
  canEdit,
}: {
  entityType: EntityType
  entityId: string
  canEdit: boolean
}) {
  const toast = useToast()
  const utils = trpc.useUtils()
  const list = trpc.attachments.list.useQuery({ entityType, entityId })
  const createUpload = trpc.attachments.createUpload.useMutation()
  const confirmUpload = trpc.attachments.confirmUpload.useMutation()
  const remove = trpc.attachments.remove.useMutation()
  const input = useRef<HTMLInputElement>(null)
  const [busy, setBusy] = useState(false)
  const [over, setOver] = useState(false)

  async function upload(files: FileList | File[]) {
    const supabase = createClient()
    setBusy(true)
    let added = 0
    for (const file of Array.from(files)) {
      if (!(ALLOWED_MIME_TYPES as readonly string[]).includes(file.type)) {
        toast.error(`${file.name}: nur Fotos, Videos und PDF`)
        continue
      }
      if (file.size > MAX_ATTACHMENT_BYTES) {
        toast.error(`${file.name}: grösser als 25 MB`)
        continue
      }
      try {
        const meta = {
          entityType,
          entityId,
          fileName: file.name,
          mimeType: file.type as (typeof ALLOWED_MIME_TYPES)[number],
          sizeBytes: file.size,
        }
        const { path, token } = await createUpload.mutateAsync(meta)
        const { error } = await supabase.storage
          .from("attachments")
          .uploadToSignedUrl(path, token, file, { contentType: file.type })
        if (error) throw new Error(error.message)
        await confirmUpload.mutateAsync({ ...meta, path })
        added++
      } catch (err) {
        toast.error(
          `${file.name}: ${err instanceof Error ? err.message : "Hochladen fehlgeschlagen"}`,
        )
      }
    }
    setBusy(false)
    if (added) {
      await utils.attachments.list.invalidate({ entityType, entityId })
      toast.success(added === 1 ? "Datei hinzugefügt" : `${added} Dateien hinzugefügt`)
    }
  }

  async function open(a: Attachment) {
    try {
      const { url } = await utils.attachments.url.fetch({ id: a.id })
      window.open(url, "_blank", "noopener")
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Öffnen fehlgeschlagen")
    }
  }

  const files = list.data ?? []
  return (
    <div className="space-y-3">
      {canEdit && (
        <div
          onDragOver={(e) => {
            e.preventDefault()
            setOver(true)
          }}
          onDragLeave={() => setOver(false)}
          onDrop={(e) => {
            e.preventDefault()
            setOver(false)
            void upload(e.dataTransfer.files)
          }}
          className={cn(
            "border-surface-divider flex flex-col items-center gap-2 rounded-[var(--radius-md)] border border-dashed px-4 py-6 text-center",
            over && "border-signal-600 bg-signal-100/40",
          )}
        >
          <Upload className="text-text-muted h-5 w-5" />
          <Button
            size="sm"
            variant="secondary"
            disabled={busy}
            onClick={() => input.current?.click()}
          >
            {busy ? "Wird hochgeladen …" : "Fotos, Videos oder PDF hinzufügen"}
          </Button>
          <p className="text-text-muted text-xs">oder Dateien hierher ziehen · bis 25 MB</p>
          <input
            ref={input}
            type="file"
            multiple
            accept={ALLOWED_MIME_TYPES.join(",")}
            className="hidden"
            onChange={(e) => {
              if (e.target.files?.length) void upload(e.target.files)
              e.target.value = ""
            }}
          />
        </div>
      )}
      {files.length > 0 && (
        <ul className="divide-surface-divider divide-y">
          {files.map((a) => (
            <li key={a.id} className="flex items-center gap-3 py-2 text-sm">
              <span className="text-text-muted">
                <Icon mime={a.mimeType} />
              </span>
              <button
                type="button"
                onClick={() => open(a)}
                className="text-text-primary min-w-0 flex-1 truncate text-left hover:underline"
              >
                {a.fileName}
              </button>
              <span className="text-text-muted text-xs whitespace-nowrap">
                {sizeLabel(a.sizeBytes)}
              </span>
              {canEdit && (
                <button
                  type="button"
                  aria-label={`${a.fileName} entfernen`}
                  className="text-text-muted hover:text-danger-700"
                  onClick={async () => {
                    await remove.mutateAsync({ id: a.id })
                    await utils.attachments.list.invalidate({ entityType, entityId })
                  }}
                >
                  <Trash2 className="h-4 w-4" />
                </button>
              )}
            </li>
          ))}
        </ul>
      )}
      {!canEdit && files.length === 0 && <p className="text-text-muted text-sm">Keine Dateien.</p>}
    </div>
  )
}
