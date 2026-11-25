"use client"

import { labelOf } from "@/app/(dashboard)/_lib/labels"
import { useEffect, useState } from "react"
import Link from "next/link"
import { useRouter } from "next/navigation"
import { useForm, useWatch, Controller } from "react-hook-form"
import { zodResolver } from "@hookform/resolvers/zod"
import type { z } from "zod"
import { AlertTriangle, ArrowLeft } from "lucide-react"
import { trpc } from "@/lib/trpc/client"
import { Button } from "@/app/(dashboard)/_components/ui/button"
import {
  Input,
  Select,
  Textarea,
  FieldLabel,
  FieldError,
  FieldHint,
} from "@/app/(dashboard)/_components/ui/field"
import { Card, CardContent, CardHeader } from "@/app/(dashboard)/_components/ui/card"
import { useToast } from "@/app/(dashboard)/_components/ui/toast"
import { useUnsavedChangesGuard } from "@/app/(dashboard)/_lib/active-company"
import { acquisitionSourceEnum } from "@/modules/leads/interface"
import {
  createCustomerInput,
  customerLanguageEnum,
  type Customer,
} from "@/modules/customers/interface"
import { LANGUAGE_LABELS, SALUTATION_LABELS } from "../_lib/labels"

type FormValues = z.input<typeof createCustomerInput>

const EMPTY: FormValues = {
  customerType: "private",
  salutation: null,
  firstName: "",
  lastName: "",
  companyName: "",
  email: "",
  phone: "",
  secondaryPhone: "",
  preferredLanguage: "de",
  billingStreet: "",
  billingPostalCode: "",
  billingCity: "",
  billingCountry: "CH",
  source: null,
  referralSource: "",
  internalNotes: "",
}

function customerToFormValues(c: Customer): FormValues {
  return {
    customerType: c.customerType,
    salutation: c.salutation,
    firstName: c.firstName,
    lastName: c.lastName,
    companyName: c.companyName ?? "",
    email: c.email ?? "",
    phone: c.phone ?? "",
    secondaryPhone: c.secondaryPhone ?? "",
    preferredLanguage: c.preferredLanguage,
    billingStreet: c.billingStreet ?? "",
    billingPostalCode: c.billingPostalCode ?? "",
    billingCity: c.billingCity ?? "",
    billingCountry: c.billingCountry,
    source: c.source as FormValues["source"],
    referralSource: c.referralSource ?? "",
    internalNotes: c.internalNotes ?? "",
  }
}

function useDebounced<T>(value: T, delayMs: number): T {
  const [debounced, setDebounced] = useState(value)
  useEffect(() => {
    const timer = setTimeout(() => setDebounced(value), delayMs)
    return () => clearTimeout(timer)
  }, [value, delayMs])
  return debounced
}

export function CustomerForm({ mode, customer }: { mode: "create" | "edit"; customer?: Customer }) {
  const router = useRouter()
  const toast = useToast()
  const createMutation = trpc.customers.create.useMutation()
  const updateMutation = trpc.customers.update.useMutation()

  const {
    register,
    handleSubmit,
    control,
    formState: { errors, isSubmitting, isDirty },
  } = useForm<FormValues>({
    resolver: zodResolver(createCustomerInput),
    defaultValues: customer ? customerToFormValues(customer) : EMPTY,
  })
  useUnsavedChangesGuard(isDirty && !isSubmitting)

  const customerType = useWatch({ control, name: "customerType" })
  const email = useDebounced(useWatch({ control, name: "email" }) ?? "", 400)
  const phone = useDebounced(useWatch({ control, name: "phone" }) ?? "", 400)

  const duplicates = trpc.customers.findDuplicates.useQuery(
    { email: email || null, phone: phone || null, ...(customer ? { excludeId: customer.id } : {}) },
    { enabled: Boolean(email.includes("@") || phone.replace(/\D/g, "").length >= 9) },
  )

  const onSubmit = handleSubmit(async (values) => {
    const input = createCustomerInput.parse(values)
    try {
      if (mode === "create") {
        const result = await createMutation.mutateAsync(input)
        toast.success("Kunde erfasst")
        router.push(`/customers/${result.id}`)
      } else if (customer) {
        await updateMutation.mutateAsync({ id: customer.id, ...input })
        toast.success("Kunde gespeichert")
        router.push(`/customers/${customer.id}`)
      }
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Speichern fehlgeschlagen")
    }
  })

  const matches = duplicates.data ?? []

  return (
    <form onSubmit={onSubmit} className="space-y-6">
      <Card>
        <CardHeader>Kunde</CardHeader>
        <CardContent className="grid gap-4 sm:grid-cols-2">
          <div>
            <FieldLabel htmlFor="customerType">Art</FieldLabel>
            <Select id="customerType" {...register("customerType")}>
              <option value="private">Privat</option>
              <option value="business">Firma</option>
            </Select>
          </div>
          {customerType === "business" ? (
            <div>
              <FieldLabel required htmlFor="companyName">
                Firmenname
              </FieldLabel>
              <Input
                id="companyName"
                hasError={!!errors.companyName}
                {...register("companyName")}
              />
              <FieldError message={errors.companyName?.message} />
            </div>
          ) : (
            <div className="hidden sm:block" />
          )}
          <div>
            <FieldLabel htmlFor="salutation">Anrede</FieldLabel>
            <Controller
              control={control}
              name="salutation"
              render={({ field }) => (
                <Select
                  id="salutation"
                  value={field.value ?? ""}
                  onChange={(e) => field.onChange(e.target.value === "" ? null : e.target.value)}
                >
                  <option value="">—</option>
                  {Object.entries(SALUTATION_LABELS).map(([value, label]) => (
                    <option key={value} value={value}>
                      {label}
                    </option>
                  ))}
                </Select>
              )}
            />
          </div>
          <div>
            <FieldLabel htmlFor="preferredLanguage">Korrespondenzsprache</FieldLabel>
            <Select id="preferredLanguage" {...register("preferredLanguage")}>
              {customerLanguageEnum.options.map((lang) => (
                <option key={lang} value={lang}>
                  {LANGUAGE_LABELS[lang]}
                </option>
              ))}
            </Select>
            <FieldHint>Für Offerten, Rechnungen und E-Mails</FieldHint>
          </div>
          <div>
            <FieldLabel required htmlFor="firstName">
              {customerType === "business" ? "Vorname Kontaktperson" : "Vorname"}
            </FieldLabel>
            <Input id="firstName" hasError={!!errors.firstName} {...register("firstName")} />
            <FieldError message={errors.firstName?.message} />
          </div>
          <div>
            <FieldLabel required htmlFor="lastName">
              {customerType === "business" ? "Nachname Kontaktperson" : "Nachname"}
            </FieldLabel>
            <Input id="lastName" hasError={!!errors.lastName} {...register("lastName")} />
            <FieldError message={errors.lastName?.message} />
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>Kontakt</CardHeader>
        <CardContent className="grid gap-4 sm:grid-cols-2">
          <div className="sm:col-span-2">
            <FieldLabel htmlFor="email">E-Mail</FieldLabel>
            <Input id="email" type="email" hasError={!!errors.email} {...register("email")} />
            <FieldError message={errors.email?.message} />
          </div>
          <div>
            <FieldLabel htmlFor="phone">Mobile</FieldLabel>
            <Input id="phone" type="tel" placeholder="079 123 45 67" {...register("phone")} />
          </div>
          <div>
            <FieldLabel htmlFor="secondaryPhone">Festnetz</FieldLabel>
            <Input id="secondaryPhone" type="tel" {...register("secondaryPhone")} />
          </div>
          {matches.length > 0 && (
            <div
              role="alert"
              className="border-warning-600/40 bg-warning-100 text-warning-700 flex gap-3 rounded-[var(--radius-md)] border p-4 text-sm sm:col-span-2"
            >
              <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
              <div>
                <p className="font-semibold">Möglicherweise doppelt</p>
                <ul className="mt-1 space-y-1">
                  {matches.map((d) => (
                    <li key={d.id}>
                      <Link href={`/customers/${d.id}`} target="_blank" className="underline">
                        {d.displayName}
                      </Link>{" "}
                      — gleiche{" "}
                      {d.matchedOn
                        .map((m) => (m === "email" ? "E-Mail" : "Telefonnummer"))
                        .join(" und ")}
                    </li>
                  ))}
                </ul>
                <p className="mt-1">
                  Speichern ist trotzdem möglich, wenn es eine andere Person ist.
                </p>
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>Rechnungsadresse</CardHeader>
        <CardContent className="grid gap-4 sm:grid-cols-6">
          <div className="sm:col-span-6">
            <FieldLabel htmlFor="billingStreet">Strasse und Nr.</FieldLabel>
            <Input id="billingStreet" {...register("billingStreet")} />
          </div>
          <div className="sm:col-span-2">
            <FieldLabel htmlFor="billingPostalCode">PLZ</FieldLabel>
            <Input id="billingPostalCode" {...register("billingPostalCode")} />
          </div>
          <div className="sm:col-span-3">
            <FieldLabel htmlFor="billingCity">Ort</FieldLabel>
            <Input id="billingCity" {...register("billingCity")} />
          </div>
          <div className="sm:col-span-1">
            <FieldLabel htmlFor="billingCountry">Land</FieldLabel>
            <Select id="billingCountry" {...register("billingCountry")}>
              {["CH", "LI", "DE", "AT", "FR", "IT"].map((code) => (
                <option key={code} value={code}>
                  {code}
                </option>
              ))}
            </Select>
          </div>
          <div className="sm:col-span-6">
            <FieldHint>Nötig für Rechnungen mit QR-Zahlteil</FieldHint>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>Weitere Angaben</CardHeader>
        <CardContent className="grid gap-4 sm:grid-cols-2">
          <div>
            <FieldLabel htmlFor="source">Wie auf euch aufmerksam geworden?</FieldLabel>
            <Controller
              control={control}
              name="source"
              render={({ field }) => (
                <Select
                  id="source"
                  value={field.value ?? ""}
                  onChange={(e) => field.onChange(e.target.value === "" ? null : e.target.value)}
                >
                  <option value="">—</option>
                  {acquisitionSourceEnum.options.map((opt) => (
                    <option key={opt} value={opt}>
                      {labelOf(opt)}
                    </option>
                  ))}
                </Select>
              )}
            />
          </div>
          <div>
            <FieldLabel htmlFor="referralSource">Empfohlen von</FieldLabel>
            <Input id="referralSource" {...register("referralSource")} />
          </div>
          <div className="sm:col-span-2">
            <FieldLabel htmlFor="internalNotes">Interne Notiz</FieldLabel>
            <Textarea id="internalNotes" rows={4} {...register("internalNotes")} />
            <FieldHint>Nur für euer Team sichtbar, nie für den Kunden</FieldHint>
          </div>
        </CardContent>
      </Card>

      <div className="flex items-center justify-end gap-3">
        <Button
          type="button"
          variant="secondary"
          onClick={() => router.back()}
          disabled={isSubmitting}
        >
          <ArrowLeft className="h-4 w-4" />
          Abbrechen
        </Button>
        <Button type="submit" disabled={isSubmitting}>
          {isSubmitting
            ? "Speichern …"
            : mode === "create"
              ? "Kunde erfassen"
              : "Änderungen speichern"}
        </Button>
      </div>
    </form>
  )
}
