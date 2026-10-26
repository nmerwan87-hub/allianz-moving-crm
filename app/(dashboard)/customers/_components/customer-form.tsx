"use client"

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

function formatLabel(value: string): string {
  return value.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase())
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
        toast.success("Customer created")
        router.push(`/customers/${result.id}`)
      } else if (customer) {
        await updateMutation.mutateAsync({ id: customer.id, ...input })
        toast.success("Customer updated")
        router.push(`/customers/${customer.id}`)
      }
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to save customer")
    }
  })

  const matches = duplicates.data ?? []

  return (
    <form onSubmit={onSubmit} className="space-y-6">
      <Card>
        <CardHeader>Customer</CardHeader>
        <CardContent className="grid gap-4 sm:grid-cols-2">
          <div>
            <FieldLabel htmlFor="customerType">Type</FieldLabel>
            <Select id="customerType" {...register("customerType")}>
              <option value="private">Private</option>
              <option value="business">Business</option>
            </Select>
          </div>
          {customerType === "business" ? (
            <div>
              <FieldLabel required htmlFor="companyName">
                Company name
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
            <FieldLabel htmlFor="salutation">Salutation</FieldLabel>
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
            <FieldLabel htmlFor="preferredLanguage">Correspondence language</FieldLabel>
            <Select id="preferredLanguage" {...register("preferredLanguage")}>
              {customerLanguageEnum.options.map((lang) => (
                <option key={lang} value={lang}>
                  {LANGUAGE_LABELS[lang]}
                </option>
              ))}
            </Select>
            <FieldHint>Used for offers, invoices and e-mails</FieldHint>
          </div>
          <div>
            <FieldLabel required htmlFor="firstName">
              {customerType === "business" ? "Contact first name" : "First name"}
            </FieldLabel>
            <Input id="firstName" hasError={!!errors.firstName} {...register("firstName")} />
            <FieldError message={errors.firstName?.message} />
          </div>
          <div>
            <FieldLabel required htmlFor="lastName">
              {customerType === "business" ? "Contact last name" : "Last name"}
            </FieldLabel>
            <Input id="lastName" hasError={!!errors.lastName} {...register("lastName")} />
            <FieldError message={errors.lastName?.message} />
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>Contact</CardHeader>
        <CardContent className="grid gap-4 sm:grid-cols-2">
          <div className="sm:col-span-2">
            <FieldLabel htmlFor="email">E-mail</FieldLabel>
            <Input id="email" type="email" hasError={!!errors.email} {...register("email")} />
            <FieldError message={errors.email?.message} />
          </div>
          <div>
            <FieldLabel htmlFor="phone">Mobile</FieldLabel>
            <Input id="phone" type="tel" placeholder="079 123 45 67" {...register("phone")} />
          </div>
          <div>
            <FieldLabel htmlFor="secondaryPhone">Landline</FieldLabel>
            <Input id="secondaryPhone" type="tel" {...register("secondaryPhone")} />
          </div>
          {matches.length > 0 && (
            <div
              role="alert"
              className="border-warning-600/40 bg-warning-100 text-warning-700 flex gap-3 rounded-[var(--radius-md)] border p-4 text-sm sm:col-span-2"
            >
              <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
              <div>
                <p className="font-semibold">Possible duplicate</p>
                <ul className="mt-1 space-y-1">
                  {matches.map((d) => (
                    <li key={d.id}>
                      <Link href={`/customers/${d.id}`} target="_blank" className="underline">
                        {d.displayName}
                      </Link>{" "}
                      — same {d.matchedOn.join(" and ")}
                    </li>
                  ))}
                </ul>
                <p className="mt-1">You can still save if this is a different person.</p>
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>Billing address</CardHeader>
        <CardContent className="grid gap-4 sm:grid-cols-6">
          <div className="sm:col-span-6">
            <FieldLabel htmlFor="billingStreet">Street and number</FieldLabel>
            <Input id="billingStreet" {...register("billingStreet")} />
          </div>
          <div className="sm:col-span-2">
            <FieldLabel htmlFor="billingPostalCode">Postal code</FieldLabel>
            <Input id="billingPostalCode" {...register("billingPostalCode")} />
          </div>
          <div className="sm:col-span-3">
            <FieldLabel htmlFor="billingCity">City</FieldLabel>
            <Input id="billingCity" {...register("billingCity")} />
          </div>
          <div className="sm:col-span-1">
            <FieldLabel htmlFor="billingCountry">Country</FieldLabel>
            <Select id="billingCountry" {...register("billingCountry")}>
              {["CH", "LI", "DE", "AT", "FR", "IT"].map((code) => (
                <option key={code} value={code}>
                  {code}
                </option>
              ))}
            </Select>
          </div>
          <div className="sm:col-span-6">
            <FieldHint>Required on invoices (QR-bill)</FieldHint>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>Additional information</CardHeader>
        <CardContent className="grid gap-4 sm:grid-cols-2">
          <div>
            <FieldLabel htmlFor="source">How did they find you?</FieldLabel>
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
                      {formatLabel(opt)}
                    </option>
                  ))}
                </Select>
              )}
            />
          </div>
          <div>
            <FieldLabel htmlFor="referralSource">Referred by</FieldLabel>
            <Input id="referralSource" {...register("referralSource")} />
          </div>
          <div className="sm:col-span-2">
            <FieldLabel htmlFor="internalNotes">Internal notes</FieldLabel>
            <Textarea id="internalNotes" rows={4} {...register("internalNotes")} />
            <FieldHint>Visible to your team only, never shown to the customer</FieldHint>
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
          Cancel
        </Button>
        <Button type="submit" disabled={isSubmitting}>
          {isSubmitting ? "Saving..." : mode === "create" ? "Create customer" : "Save changes"}
        </Button>
      </div>
    </form>
  )
}
