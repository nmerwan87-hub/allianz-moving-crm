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
import { useUnsavedChangesGuard } from "@/app/(dashboard)/_lib/active-company"
import { createLeadInput, moveTypeEnum, acquisitionSourceEnum } from "@/modules/leads/interface"
import type { Lead } from "@/modules/leads/interface"
import { labelOf } from "@/app/(dashboard)/_lib/labels"

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
  rooms: null,
  originAddress: "",
  originCity: "",
  originState: "",
  originPostalCode: "",
  originCountry: "CH",
  originFloor: null,
  originHasElevator: false,
  originHasStairs: false,
  originParkingNotes: "",
  destAddress: "",
  destCity: "",
  destState: "",
  destPostalCode: "",
  destCountry: "CH",
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
    rooms: lead.rooms,
    originAddress: lead.originAddress ?? "",
    originCity: lead.originCity ?? "",
    originState: lead.originState ?? "",
    originPostalCode: lead.originPostalCode ?? "",
    originCountry: lead.originCountry ?? "CH",
    originFloor: lead.originFloor,
    originHasElevator: lead.originHasElevator,
    originHasStairs: lead.originHasStairs,
    originParkingNotes: lead.originParkingNotes ?? "",
    destAddress: lead.destAddress ?? "",
    destCity: lead.destCity ?? "",
    destState: lead.destState ?? "",
    destPostalCode: lead.destPostalCode ?? "",
    destCountry: lead.destCountry ?? "CH",
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
    formState: { errors, isSubmitting, isDirty },
  } = useForm<FormValues>({
    resolver: zodResolver(formSchema),
    defaultValues: lead ? leadToFormValues(lead) : EMPTY,
  })
  useUnsavedChangesGuard(isDirty && !isSubmitting)

  const onSubmit = handleSubmit(async (values) => {
    try {
      if (mode === "create") {
        const result = await createMutation.mutateAsync(values)
        toast.success("Anfrage erfasst")
        router.push(`/leads/${result.id}`)
      } else if (mode === "edit" && lead) {
        await updateMutation.mutateAsync({ id: lead.id, ...values })
        toast.success("Anfrage gespeichert")
        router.push(`/leads/${lead.id}`)
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : "Etwas ist schiefgelaufen"
      toast.error(message)
    }
  })

  return (
    <form onSubmit={onSubmit} className="space-y-4">
      <Card>
        <CardHeader>Kontakt</CardHeader>
        <CardContent className="grid gap-4 sm:grid-cols-2">
          <div>
            <FieldLabel required htmlFor="firstName">
              Vorname
            </FieldLabel>
            <Input id="firstName" hasError={!!errors.firstName} {...register("firstName")} />
            <FieldError message={errors.firstName?.message} />
          </div>
          <div>
            <FieldLabel required htmlFor="lastName">
              Nachname
            </FieldLabel>
            <Input id="lastName" hasError={!!errors.lastName} {...register("lastName")} />
            <FieldError message={errors.lastName?.message} />
          </div>
          <div>
            <FieldLabel htmlFor="email">E-Mail</FieldLabel>
            <Input id="email" type="email" hasError={!!errors.email} {...register("email")} />
            <FieldError message={errors.email?.message} />
          </div>
          <div>
            <FieldLabel htmlFor="phone">Telefon</FieldLabel>
            <Input id="phone" type="tel" placeholder="079 123 45 67" {...register("phone")} />
            <FieldError message={errors.phone?.message} />
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>Umzug</CardHeader>
        <CardContent className="grid gap-4 sm:grid-cols-2">
          <div>
            <FieldLabel htmlFor="requestedDate">Gewünschtes Datum</FieldLabel>
            <Input
              id="requestedDate"
              type="date"
              hasError={!!errors.requestedDate}
              {...register("requestedDate")}
            />
            <FieldError message={errors.requestedDate?.message} />
            <label className="text-text-secondary mt-2 flex items-center gap-2 text-sm">
              <input type="checkbox" className="h-4 w-4" {...register("dateFlexible")} />
              Datum flexibel
            </label>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <FieldLabel htmlFor="moveType">Art</FieldLabel>
              <Controller
                control={control}
                name="moveType"
                render={({ field }) => (
                  <Select
                    id="moveType"
                    value={field.value ?? ""}
                    onChange={(e) => field.onChange(e.target.value === "" ? null : e.target.value)}
                  >
                    <option value="">—</option>
                    {moveTypeEnum.options.map((opt) => (
                      <option key={opt} value={opt}>
                        {labelOf(opt)}
                      </option>
                    ))}
                  </Select>
                )}
              />
            </div>
            <div>
              <FieldLabel htmlFor="rooms">Anzahl Zimmer</FieldLabel>
              <Controller
                control={control}
                name="rooms"
                render={({ field }) => (
                  <Select
                    id="rooms"
                    value={field.value == null ? "" : String(field.value)}
                    onChange={(e) =>
                      field.onChange(e.target.value === "" ? null : Number(e.target.value))
                    }
                  >
                    <option value="">—</option>
                    {Array.from({ length: 16 }, (_, i) => 1 + i * 0.5).map((r) => (
                      <option key={r} value={String(r)}>
                        {r}
                      </option>
                    ))}
                  </Select>
                )}
              />
            </div>
          </div>

          {(["origin", "dest"] as const).map((side) => (
            <div key={side} className="space-y-2">
              <p className="text-text-primary text-xs font-semibold tracking-wide uppercase">
                {side === "origin" ? "Von" : "Nach"}
              </p>
              <Input
                aria-label={side === "origin" ? "Von Strasse" : "Nach Strasse"}
                placeholder="Strasse und Nr."
                {...register(`${side}Address`)}
              />
              <div className="grid grid-cols-[90px_minmax(0,1fr)] gap-2">
                <Input
                  aria-label={side === "origin" ? "Von PLZ" : "Nach PLZ"}
                  placeholder="PLZ"
                  {...register(`${side}PostalCode`)}
                />
                <Input
                  aria-label={side === "origin" ? "Von Ort" : "Nach Ort"}
                  placeholder="Ort"
                  {...register(`${side}City`)}
                />
              </div>
              <div className="flex items-center gap-3">
                <Controller
                  control={control}
                  name={`${side}Floor`}
                  render={({ field }) => (
                    <Select
                      aria-label={side === "origin" ? "Von Stockwerk" : "Nach Stockwerk"}
                      className="w-40"
                      value={
                        field.value === null || field.value === undefined ? "" : String(field.value)
                      }
                      onChange={(e) =>
                        field.onChange(e.target.value === "" ? null : Number(e.target.value))
                      }
                    >
                      <option value="">Stockwerk …</option>
                      <option value="0">Erdgeschoss</option>
                      {Array.from({ length: 12 }, (_, i) => i + 1).map((f) => (
                        <option key={f} value={String(f)}>
                          {f}. Stock
                        </option>
                      ))}
                    </Select>
                  )}
                />
                <label className="text-text-secondary flex items-center gap-1.5 text-sm">
                  <input type="checkbox" className="h-4 w-4" {...register(`${side}HasElevator`)} />
                  Lift
                </label>
              </div>
            </div>
          ))}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>Weitere Angaben</CardHeader>
        <CardContent className="grid gap-4 sm:grid-cols-2">
          <div>
            <FieldLabel htmlFor="source">Quelle</FieldLabel>
            <Controller
              control={control}
              name="source"
              render={({ field }) => (
                <Select
                  id="source"
                  value={field.value ?? "manual"}
                  onChange={(e) => field.onChange(e.target.value)}
                >
                  {acquisitionSourceEnum.options.map((opt) => (
                    <option key={opt} value={opt}>
                      {labelOf(opt)}
                    </option>
                  ))}
                </Select>
              )}
            />
            <FieldHint>Wie die Anfrage zu euch kam</FieldHint>
          </div>
          <div className="sm:col-span-2">
            <FieldLabel htmlFor="internalNotes">Interne Notiz</FieldLabel>
            <Textarea id="internalNotes" rows={3} {...register("internalNotes")} />
            <FieldHint>Nur für euer Team sichtbar</FieldHint>
          </div>
        </CardContent>
      </Card>

      <div className="flex justify-end gap-2">
        <Button type="button" variant="secondary" onClick={() => router.back()}>
          <ArrowLeft className="h-4 w-4" />
          Abbrechen
        </Button>
        <Button type="submit" disabled={isSubmitting}>
          {isSubmitting
            ? "Speichern …"
            : mode === "create"
              ? "Anfrage erfassen"
              : "Änderungen speichern"}
        </Button>
      </div>
    </form>
  )
}
