"use client"

import { useRef, useState } from "react"
import { ImageUp, Trash2 } from "lucide-react"
import { trpc } from "@/lib/trpc/client"
import { formatIban } from "@/lib/format/iban"
import { formatPhone } from "@/lib/format/phone"
import { PageHeader } from "@/app/(dashboard)/_components/ui/page-header"
import { Button } from "@/app/(dashboard)/_components/ui/button"
import { Badge } from "@/app/(dashboard)/_components/ui/badge"
import { Card, CardContent, CardHeader } from "@/app/(dashboard)/_components/ui/card"
import {
  Input,
  Select,
  FieldLabel,
  FieldError,
  FieldHint,
} from "@/app/(dashboard)/_components/ui/field"
import { Skeleton } from "@/app/(dashboard)/_components/ui/skeleton"
import { useToast } from "@/app/(dashboard)/_components/ui/toast"
import { useHasPermission } from "@/app/(dashboard)/_lib/permissions"
import { useUnsavedChangesGuard } from "@/app/(dashboard)/_lib/active-company"
import { companyColour, companyInitials } from "@/app/(dashboard)/_lib/active-company"
import { companyProfileInput, type CompanyProfile } from "@/modules/company/interface"

type ProfileForm = Record<
  | "name"
  | "legalName"
  | "vatNumber"
  | "registrationNumber"
  | "addressLine1"
  | "addressLine2"
  | "postalCode"
  | "city"
  | "country"
  | "email"
  | "phone"
  | "website",
  string
> & { accentColor: string }

function toProfileForm(p: CompanyProfile): ProfileForm {
  return {
    name: p.name,
    legalName: p.legalName ?? "",
    vatNumber: p.vatNumber ?? "",
    registrationNumber: p.registrationNumber ?? "",
    addressLine1: p.addressLine1 ?? "",
    addressLine2: p.addressLine2 ?? "",
    postalCode: p.postalCode ?? "",
    city: p.city ?? "",
    country: p.country,
    email: p.email ?? "",
    phone: formatPhone(p.phone),
    website: p.website ?? "",
    accentColor: p.accentColor ?? "",
  }
}

function TextField({
  id,
  label,
  value,
  onChange,
  disabled,
  required,
  placeholder,
  hint,
  error,
}: {
  id: string
  label: string
  value: string
  onChange: (value: string) => void
  disabled: boolean
  required?: boolean
  placeholder?: string
  hint?: string
  error?: string | undefined
}) {
  return (
    <div>
      <FieldLabel htmlFor={id} required={required ?? false}>
        {label}
      </FieldLabel>
      <Input
        id={id}
        value={value}
        {...(placeholder ? { placeholder } : {})}
        disabled={disabled}
        hasError={!!error}
        onChange={(e) => onChange(e.target.value)}
      />
      <FieldError message={error} />
      {hint && <FieldHint>{hint}</FieldHint>}
    </div>
  )
}

function ProfileCard({ profile, canEdit }: { profile: CompanyProfile; canEdit: boolean }) {
  const toast = useToast()
  const utils = trpc.useUtils()
  const update = trpc.company.updateProfile.useMutation()
  const [form, setForm] = useState(() => toProfileForm(profile))
  const [errors, setErrors] = useState<Record<string, string>>({})
  const [dirty, setDirty] = useState(false)
  useUnsavedChangesGuard(dirty)

  const field = (key: keyof ProfileForm) => ({
    id: `company-${key}`,
    value: form[key],
    disabled: !canEdit,
    error: errors[key],
    onChange: (value: string) => {
      setForm((f) => ({ ...f, [key]: value }))
      setDirty(true)
    },
  })

  async function save() {
    const parsed = companyProfileInput.safeParse({
      ...form,
      accentColor: form.accentColor || null,
    })
    if (!parsed.success) {
      setErrors(Object.fromEntries(parsed.error.issues.map((i) => [String(i.path[0]), i.message])))
      return
    }
    setErrors({})
    try {
      await update.mutateAsync(parsed.data)
      await Promise.all([utils.company.profile.invalidate(), utils.iam.session.me.invalidate()])
      setDirty(false)
      toast.success("Company profile saved")
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to save profile")
    }
  }

  return (
    <Card>
      <CardHeader>Company</CardHeader>
      <CardContent className="space-y-6">
        <div className="grid gap-4 sm:grid-cols-2">
          <TextField
            {...field("name")}
            label="Display name"
            required
            hint="Shown in Bivro and on e-mails"
          />
          <TextField
            {...field("legalName")}
            label="Legal name"
            required
            hint="As in the commercial register, e.g. Muster Umzüge GmbH"
          />
          <TextField
            {...field("vatNumber")}
            label="UID / VAT number"
            placeholder="CHE-123.456.789"
          />
          <TextField
            {...field("registrationNumber")}
            label="Commercial register number"
            placeholder="CH-020.4.012.345-6"
          />
        </div>

        <div className="grid gap-4 sm:grid-cols-6">
          <div className="sm:col-span-6">
            <TextField {...field("addressLine1")} label="Street and number" />
          </div>
          <div className="sm:col-span-6">
            <TextField {...field("addressLine2")} label="Address line 2" />
          </div>
          <div className="sm:col-span-2">
            <TextField {...field("postalCode")} label="Postal code" />
          </div>
          <div className="sm:col-span-3">
            <TextField {...field("city")} label="City" />
          </div>
          <div className="sm:col-span-1">
            <FieldLabel htmlFor="company-country">Country</FieldLabel>
            <Select
              id="company-country"
              value={form.country}
              disabled={!canEdit}
              onChange={(e) => field("country").onChange(e.target.value)}
            >
              {["CH", "LI", "DE", "AT"].map((c) => (
                <option key={c} value={c}>
                  {c}
                </option>
              ))}
            </Select>
          </div>
        </div>

        <div className="grid gap-4 sm:grid-cols-3">
          <TextField {...field("email")} label="E-mail" />
          <TextField {...field("phone")} label="Phone" />
          <TextField {...field("website")} label="Website" placeholder="www.example.ch" />
        </div>

        <div className="border-surface-divider flex flex-wrap items-end gap-4 border-t pt-4">
          <div>
            <FieldLabel htmlFor="company-accent">Brand colour</FieldLabel>
            <div className="flex items-center gap-2">
              <input
                id="company-accent"
                type="color"
                disabled={!canEdit}
                value={form.accentColor || "#4f46e5"}
                onChange={(e) => field("accentColor").onChange(e.target.value)}
                className="border-surface-divider h-9 w-12 cursor-pointer rounded-[var(--radius-md)] border"
              />
              <Input
                aria-label="Brand colour hex"
                className="w-28"
                value={form.accentColor}
                placeholder="#4F46E5"
                disabled={!canEdit}
                hasError={!!errors["accentColor"]}
                onChange={(e) => field("accentColor").onChange(e.target.value)}
              />
            </div>
            <FieldError message={errors["accentColor"]} />
            <FieldHint>Used on offers and invoices</FieldHint>
          </div>
        </div>

        {canEdit && (
          <div className="flex justify-end">
            <Button onClick={save} disabled={!dirty || update.isPending}>
              {update.isPending ? "Saving..." : "Save profile"}
            </Button>
          </div>
        )}
      </CardContent>
    </Card>
  )
}

function LogoCard({ profile, canEdit }: { profile: CompanyProfile; canEdit: boolean }) {
  const toast = useToast()
  const utils = trpc.useUtils()
  const upload = trpc.company.uploadLogo.useMutation()
  const remove = trpc.company.removeLogo.useMutation()
  const inputRef = useRef<HTMLInputElement>(null)

  async function refresh() {
    await Promise.all([utils.company.profile.invalidate(), utils.iam.session.me.invalidate()])
  }

  function onFile(file: File | undefined) {
    if (!file) return
    if (file.size > 1024 * 1024) return toast.error("Logo must be 1 MB or smaller")
    const reader = new FileReader()
    reader.onload = async () => {
      try {
        await upload.mutateAsync({ dataUrl: String(reader.result) })
        await refresh()
        toast.success("Logo updated")
      } catch (err) {
        toast.error(err instanceof Error ? err.message : "Upload failed")
      }
    }
    reader.readAsDataURL(file)
  }

  return (
    <Card>
      <CardHeader>Logo</CardHeader>
      <CardContent className="flex flex-wrap items-center gap-6">
        {profile.logoUrl ? (
          // eslint-disable-next-line @next/next/no-img-element -- tenant logo from storage
          <img
            src={profile.logoUrl}
            alt={`${profile.name} logo`}
            className="border-surface-divider h-20 w-20 rounded-[var(--radius-md)] border object-contain"
          />
        ) : (
          <span
            className={`text-text-inverse flex h-20 w-20 items-center justify-center rounded-[var(--radius-md)] text-xl font-bold ${companyColour(profile.id)}`}
          >
            {companyInitials(profile.name)}
          </span>
        )}
        <div className="space-y-2">
          <p className="text-text-secondary text-sm">
            PNG, JPEG or WebP, up to 1 MB. Square logos work best.
          </p>
          {canEdit && (
            <div className="flex gap-2">
              <input
                ref={inputRef}
                type="file"
                accept="image/png,image/jpeg,image/webp"
                className="hidden"
                onChange={(e) => {
                  onFile(e.target.files?.[0])
                  e.target.value = ""
                }}
              />
              <Button
                variant="secondary"
                size="sm"
                onClick={() => inputRef.current?.click()}
                disabled={upload.isPending}
              >
                <ImageUp className="h-4 w-4" />
                {upload.isPending ? "Uploading..." : "Upload logo"}
              </Button>
              {profile.logoUrl && (
                <Button
                  variant="dangerGhost"
                  size="sm"
                  disabled={remove.isPending}
                  onClick={async () => {
                    await remove.mutateAsync()
                    await refresh()
                    toast.success("Logo removed")
                  }}
                >
                  <Trash2 className="h-4 w-4" />
                  Remove
                </Button>
              )}
            </div>
          )}
        </div>
      </CardContent>
    </Card>
  )
}

function BankCard({ profile, canEdit }: { profile: CompanyProfile; canEdit: boolean }) {
  const toast = useToast()
  const utils = trpc.useUtils()
  const update = trpc.company.updateBank.useMutation()
  const [form, setForm] = useState({
    bankName: profile.bankName ?? "",
    bankIban: formatIban(profile.bankIban),
    bankBic: profile.bankBic ?? "",
    bankPayeeName: profile.bankPayeeName ?? profile.legalName ?? "",
  })
  const [dirty, setDirty] = useState(false)
  useUnsavedChangesGuard(dirty)

  const set = (key: keyof typeof form) => (e: React.ChangeEvent<HTMLInputElement>) => {
    setForm((f) => ({ ...f, [key]: e.target.value }))
    setDirty(true)
  }

  async function save() {
    try {
      const result = await update.mutateAsync(form)
      await utils.company.profile.invalidate()
      setDirty(false)
      toast.success(result.isQrIban ? "Bank details saved (QR-IBAN)" : "Bank details saved")
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to save bank details")
    }
  }

  return (
    <Card>
      <CardHeader>Bank details</CardHeader>
      <CardContent className="space-y-4">
        <p className="text-text-secondary text-sm">
          Printed on invoices and used for the Swiss QR-bill.
        </p>
        <div className="grid gap-4 sm:grid-cols-2">
          <div className="sm:col-span-2">
            <FieldLabel htmlFor="bank-iban">IBAN / QR-IBAN</FieldLabel>
            <div className="flex items-center gap-2">
              <Input
                id="bank-iban"
                value={form.bankIban}
                disabled={!canEdit}
                placeholder="CH93 0076 2011 6238 5295 7"
                onChange={set("bankIban")}
                className="font-mono"
              />
              {profile.isQrIban && !dirty && <Badge variant="info">QR-IBAN</Badge>}
            </div>
          </div>
          <div>
            <FieldLabel htmlFor="bank-payee">Account holder</FieldLabel>
            <Input
              id="bank-payee"
              value={form.bankPayeeName}
              disabled={!canEdit}
              onChange={set("bankPayeeName")}
            />
          </div>
          <div>
            <FieldLabel htmlFor="bank-name">Bank</FieldLabel>
            <Input
              id="bank-name"
              value={form.bankName}
              disabled={!canEdit}
              onChange={set("bankName")}
            />
          </div>
          <div>
            <FieldLabel htmlFor="bank-bic">BIC</FieldLabel>
            <Input
              id="bank-bic"
              value={form.bankBic}
              disabled={!canEdit}
              onChange={set("bankBic")}
            />
          </div>
        </div>
        {canEdit && (
          <div className="flex justify-end">
            <Button onClick={save} disabled={!dirty || update.isPending}>
              {update.isPending ? "Saving..." : "Save bank details"}
            </Button>
          </div>
        )}
        {!canEdit && (
          <FieldHint>Changing bank details requires the “Banking” permission.</FieldHint>
        )}
      </CardContent>
    </Card>
  )
}

export default function CompanySettingsPage() {
  const profile = trpc.company.profile.useQuery()
  const canEditProfile = useHasPermission("settings.company")
  const canEditBank = useHasPermission("settings.banking")

  return (
    <div className="space-y-6">
      <PageHeader
        title="Company profile"
        description="Your company details as they appear on offers, invoices and e-mails."
      />
      {profile.data ? (
        <>
          <LogoCard profile={profile.data} canEdit={canEditProfile} />
          <ProfileCard key={profile.data.name} profile={profile.data} canEdit={canEditProfile} />
          <BankCard
            key={profile.data.bankIban ?? "none"}
            profile={profile.data}
            canEdit={canEditBank}
          />
        </>
      ) : (
        <Skeleton className="h-96 w-full rounded-[var(--radius-lg)]" />
      )}
    </div>
  )
}
