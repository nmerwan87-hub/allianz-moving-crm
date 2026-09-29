"use client"

import { useRouter } from "next/navigation"
import { useForm, Controller } from "react-hook-form"
import { zodResolver } from "@hookform/resolvers/zod"
import type { z } from "zod"
import { ArrowLeft } from "lucide-react"
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
import {
  createLeadInput,
  moveTypeEnum,
  propertySizeEnum,
  acquisitionSourceEnum,
} from "@/modules/leads/interface"
import type { Lead } from "@/modules/leads/interface"

// Reuse the create schema shape for editing (omit nothing — all fields are optional in edit mode)
const formSchema = createLeadInput

type FormValues = z.input<typeof formSchema>

interface LeadFormProps {
  mode: "create" | "edit"
  lead?: Lead
}

const EMPTY: FormValues = {
  firstName: "",
  lastName: "",
  email: "",
  phone: "",
  moveType: null,
  requestedDate: "",
  dateFlexible: false,
  propertySize: null,
  originAddress: "",
  originCity: "",
  originState: "",
  originPostalCode: "",
  originCountry: "US",
  originFloor: null,
  originHasElevator: false,
  originHasStairs: false,
  originParkingNotes: "",
  destAddress: "",
  destCity: "",
  destState: "",
  destPostalCode: "",
  destCountry: "US",
  destFloor: null,
  destHasElevator: false,
  destHasStairs: false,
  destParkingNotes: "",
  estimatedVolumeCuft: null,
  estimatedDistanceMiles: null,
  source: "manual",
  utmSource: "",
  utmMedium: "",
  utmCampaign: "",
  referrerUrl: "",
  internalNotes: "",
}

function leadToFormValues(lead: Lead): FormValues {
  return {
    firstName: lead.firstName,
    lastName: lead.lastName,
    email: lead.email ?? "",
    phone: lead.phone ?? "",
    moveType: lead.moveType as FormValues["moveType"],
    requestedDate: lead.requestedDate ?? "",
    dateFlexible: lead.dateFlexible,
    propertySize: lead.propertySize as FormValues["propertySize"],
    originAddress: lead.originAddress ?? "",
    originCity: lead.originCity ?? "",
    originState: lead.originState ?? "",
    originPostalCode: lead.originPostalCode ?? "",
    originCountry: lead.originCountry ?? "US",
    originFloor: lead.originFloor,
    originHasElevator: lead.originHasElevator,
    originHasStairs: lead.originHasStairs,
    originParkingNotes: lead.originParkingNotes ?? "",
    destAddress: lead.destAddress ?? "",
    destCity: lead.destCity ?? "",
    destState: lead.destState ?? "",
    destPostalCode: lead.destPostalCode ?? "",
    destCountry: lead.destCountry ?? "US",
    destFloor: lead.destFloor,
    destHasElevator: lead.destHasElevator,
    destHasStairs: lead.destHasStairs,
    destParkingNotes: lead.destParkingNotes ?? "",
    estimatedVolumeCuft: lead.estimatedVolumeCuft,
    estimatedDistanceMiles: lead.estimatedDistanceMiles,
    source: lead.source as FormValues["source"],
    utmSource: lead.utmSource ?? "",
    utmMedium: lead.utmMedium ?? "",
    utmCampaign: lead.utmCampaign ?? "",
    referrerUrl: lead.referrerUrl ?? "",
    internalNotes: lead.internalNotes ?? "",
  }
}

export function LeadForm({ mode, lead }: LeadFormProps) {
  const router = useRouter()
  const toast = useToast()
  const createMutation = trpc.leads.create.useMutation()
  const updateMutation = trpc.leads.update.useMutation()

  const {
    register,
    handleSubmit,
    control,
    formState: { errors, isSubmitting },
  } = useForm<FormValues>({
    resolver: zodResolver(formSchema),
    defaultValues: lead ? leadToFormValues(lead) : EMPTY,
  })

  const onSubmit = handleSubmit(async (values) => {
    try {
      if (mode === "create") {
        const result = await createMutation.mutateAsync(values)
        toast.success("Lead created successfully")
        router.push(`/leads/${result.id}`)
      } else if (mode === "edit" && lead) {
        await updateMutation.mutateAsync({ id: lead.id, ...values })
        toast.success("Lead updated successfully")
        router.push(`/leads/${lead.id}`)
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : "Something went wrong"
      toast.error(message)
    }
  })

  return (
    <form onSubmit={onSubmit} className="space-y-6">
      {/* Contact */}
      <Card>
        <CardHeader>Contact Information</CardHeader>
        <CardContent className="grid gap-4 sm:grid-cols-2">
          <div>
            <FieldLabel required htmlFor="firstName">
              First name
            </FieldLabel>
            <Input id="firstName" hasError={!!errors.firstName} {...register("firstName")} />
            <FieldError message={errors.firstName?.message} />
          </div>
          <div>
            <FieldLabel required htmlFor="lastName">
              Last name
            </FieldLabel>
            <Input id="lastName" hasError={!!errors.lastName} {...register("lastName")} />
            <FieldError message={errors.lastName?.message} />
          </div>
          <div>
            <FieldLabel htmlFor="email">Email</FieldLabel>
            <Input id="email" type="email" hasError={!!errors.email} {...register("email")} />
            <FieldError message={errors.email?.message} />
          </div>
          <div>
            <FieldLabel htmlFor="phone">Phone</FieldLabel>
            <Input id="phone" type="tel" {...register("phone")} />
            <FieldError message={errors.phone?.message} />
          </div>
        </CardContent>
      </Card>

      {/* Move details */}
      <Card>
        <CardHeader>Move Details</CardHeader>
        <CardContent className="grid gap-4 sm:grid-cols-2">
          <div>
            <FieldLabel htmlFor="moveType">Move type</FieldLabel>
            <Controller
              control={control}
              name="moveType"
              render={({ field }) => (
                <Select
                  id="moveType"
                  value={field.value ?? ""}
                  onChange={(e) => field.onChange(e.target.value === "" ? null : e.target.value)}
                >
                  <option value="">Select type...</option>
                  {moveTypeEnum.options.map((opt) => (
                    <option key={opt} value={opt}>
                      {opt.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase())}
                    </option>
                  ))}
                </Select>
              )}
            />
          </div>
          <div>
            <FieldLabel htmlFor="propertySize">Property size</FieldLabel>
            <Controller
              control={control}
              name="propertySize"
              render={({ field }) => (
                <Select
                  id="propertySize"
                  value={field.value ?? ""}
                  onChange={(e) => field.onChange(e.target.value === "" ? null : e.target.value)}
                >
                  <option value="">Select size...</option>
                  {propertySizeEnum.options.map((opt) => (
                    <option key={opt} value={opt}>
                      {opt.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase())}
                    </option>
                  ))}
                </Select>
              )}
            />
          </div>
          <div>
            <FieldLabel htmlFor="requestedDate">Requested moving date</FieldLabel>
            <Input
              id="requestedDate"
              type="date"
              hasError={!!errors.requestedDate}
              {...register("requestedDate")}
            />
            <FieldError message={errors.requestedDate?.message} />
          </div>
          <div className="flex items-end">
            <label className="text-text-secondary flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                className="border-surface-divider h-4 w-4 rounded"
                {...register("dateFlexible")}
              />
              Date is flexible
            </label>
          </div>
          <div>
            <FieldLabel htmlFor="estimatedVolumeCuft">Estimated volume (cu ft)</FieldLabel>
            <Input
              id="estimatedVolumeCuft"
              type="number"
              step="any"
              hasError={!!errors.estimatedVolumeCuft}
              {...register("estimatedVolumeCuft", {
                setValueAs: (v) => (v === "" || v === null ? null : Number(v)),
              })}
            />
            <FieldError message={errors.estimatedVolumeCuft?.message} />
          </div>
          <div>
            <FieldLabel htmlFor="estimatedDistanceMiles">Estimated distance (miles)</FieldLabel>
            <Input
              id="estimatedDistanceMiles"
              type="number"
              step="any"
              hasError={!!errors.estimatedDistanceMiles}
              {...register("estimatedDistanceMiles", {
                setValueAs: (v) => (v === "" || v === null ? null : Number(v)),
              })}
            />
            <FieldError message={errors.estimatedDistanceMiles?.message} />
          </div>
        </CardContent>
      </Card>

      {/* Origin address */}
      <Card>
        <CardHeader>Origin Address</CardHeader>
        <CardContent className="grid gap-4 sm:grid-cols-2">
          <div className="sm:col-span-2">
            <FieldLabel htmlFor="originAddress">Street address</FieldLabel>
            <Input id="originAddress" {...register("originAddress")} />
          </div>
          <div>
            <FieldLabel htmlFor="originCity">City</FieldLabel>
            <Input id="originCity" {...register("originCity")} />
          </div>
          <div>
            <FieldLabel htmlFor="originState">State / Province</FieldLabel>
            <Input id="originState" {...register("originState")} />
          </div>
          <div>
            <FieldLabel htmlFor="originPostalCode">Postal code</FieldLabel>
            <Input id="originPostalCode" {...register("originPostalCode")} />
          </div>
          <div>
            <FieldLabel htmlFor="originCountry">Country (2-letter)</FieldLabel>
            <Input id="originCountry" maxLength={2} {...register("originCountry")} />
          </div>
          <div>
            <FieldLabel htmlFor="originFloor">Floor</FieldLabel>
            <Input
              id="originFloor"
              type="number"
              min={0}
              hasError={!!errors.originFloor}
              {...register("originFloor", {
                setValueAs: (v) => (v === "" || v === null ? null : Number(v)),
              })}
            />
          </div>
          <div className="flex items-end gap-6">
            <label className="text-text-secondary flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                className="border-surface-divider h-4 w-4 rounded"
                {...register("originHasElevator")}
              />
              Has elevator
            </label>
            <label className="text-text-secondary flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                className="border-surface-divider h-4 w-4 rounded"
                {...register("originHasStairs")}
              />
              Has stairs
            </label>
          </div>
          <div className="sm:col-span-2">
            <FieldLabel htmlFor="originParkingNotes">Parking notes</FieldLabel>
            <Textarea id="originParkingNotes" rows={2} {...register("originParkingNotes")} />
          </div>
        </CardContent>
      </Card>

      {/* Destination address */}
      <Card>
        <CardHeader>Destination Address</CardHeader>
        <CardContent className="grid gap-4 sm:grid-cols-2">
          <div className="sm:col-span-2">
            <FieldLabel htmlFor="destAddress">Street address</FieldLabel>
            <Input id="destAddress" {...register("destAddress")} />
          </div>
          <div>
            <FieldLabel htmlFor="destCity">City</FieldLabel>
            <Input id="destCity" {...register("destCity")} />
          </div>
          <div>
            <FieldLabel htmlFor="destState">State / Province</FieldLabel>
            <Input id="destState" {...register("destState")} />
          </div>
          <div>
            <FieldLabel htmlFor="destPostalCode">Postal code</FieldLabel>
            <Input id="destPostalCode" {...register("destPostalCode")} />
          </div>
          <div>
            <FieldLabel htmlFor="destCountry">Country (2-letter)</FieldLabel>
            <Input id="destCountry" maxLength={2} {...register("destCountry")} />
          </div>
          <div>
            <FieldLabel htmlFor="destFloor">Floor</FieldLabel>
            <Input
              id="destFloor"
              type="number"
              min={0}
              hasError={!!errors.destFloor}
              {...register("destFloor", {
                setValueAs: (v) => (v === "" || v === null ? null : Number(v)),
              })}
            />
          </div>
          <div className="flex items-end gap-6">
            <label className="text-text-secondary flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                className="border-surface-divider h-4 w-4 rounded"
                {...register("destHasElevator")}
              />
              Has elevator
            </label>
            <label className="text-text-secondary flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                className="border-surface-divider h-4 w-4 rounded"
                {...register("destHasStairs")}
              />
              Has stairs
            </label>
          </div>
          <div className="sm:col-span-2">
            <FieldLabel htmlFor="destParkingNotes">Parking notes</FieldLabel>
            <Textarea id="destParkingNotes" rows={2} {...register("destParkingNotes")} />
          </div>
        </CardContent>
      </Card>

      {/* Acquisition */}
      <Card>
        <CardHeader>Acquisition &amp; Marketing</CardHeader>
        <CardContent className="grid gap-4 sm:grid-cols-2">
          <div>
            <FieldLabel htmlFor="source">Lead source</FieldLabel>
            <Controller
              control={control}
              name="source"
              render={({ field }) => (
                <Select
                  id="source"
                  value={field.value ?? ""}
                  onChange={(e) => field.onChange(e.target.value === "" ? null : e.target.value)}
                >
                  {acquisitionSourceEnum.options.map((opt) => (
                    <option key={opt} value={opt}>
                      {opt.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase())}
                    </option>
                  ))}
                </Select>
              )}
            />
            <FieldHint>How this lead found your company</FieldHint>
          </div>
          <div>
            <FieldLabel htmlFor="utmSource">UTM source</FieldLabel>
            <Input id="utmSource" {...register("utmSource")} />
          </div>
          <div>
            <FieldLabel htmlFor="utmMedium">UTM medium</FieldLabel>
            <Input id="utmMedium" {...register("utmMedium")} />
          </div>
          <div>
            <FieldLabel htmlFor="utmCampaign">UTM campaign</FieldLabel>
            <Input id="utmCampaign" {...register("utmCampaign")} />
          </div>
          <div className="sm:col-span-2">
            <FieldLabel htmlFor="referrerUrl">Referrer URL</FieldLabel>
            <Input id="referrerUrl" {...register("referrerUrl")} />
          </div>
        </CardContent>
      </Card>

      {/* Notes */}
      <Card>
        <CardHeader>Additional Information</CardHeader>
        <CardContent>
          <FieldLabel htmlFor="internalNotes">Internal notes</FieldLabel>
          <Textarea id="internalNotes" rows={4} {...register("internalNotes")} />
          <FieldHint>Visible to your team only, never shown to the customer</FieldHint>
        </CardContent>
      </Card>

      {/* Actions */}
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
          {isSubmitting ? "Saving..." : mode === "create" ? "Create Lead" : "Save Changes"}
        </Button>
      </div>
    </form>
  )
}
