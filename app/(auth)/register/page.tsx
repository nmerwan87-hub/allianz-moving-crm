"use client"

import { useState } from "react"
import { useRouter } from "next/navigation"
import { useForm } from "react-hook-form"
import { zodResolver } from "@hookform/resolvers/zod"
import { trpc } from "@/lib/trpc/client"
import { registrationInput, type RegistrationInput } from "@/modules/iam/router/registration"
import { getVatFieldConfig, validateVat } from "@/modules/iam/lib/vat"

const COUNTRIES = [
  { code: "CH", name: "Switzerland" },
  { code: "DE", name: "Germany" },
  { code: "AT", name: "Austria" },
  { code: "FR", name: "France" },
  { code: "IT", name: "Italy" },
  { code: "NL", name: "Netherlands" },
  { code: "BE", name: "Belgium" },
  { code: "ES", name: "Spain" },
  { code: "PT", name: "Portugal" },
  { code: "SE", name: "Sweden" },
  { code: "NO", name: "Norway" },
  { code: "DK", name: "Denmark" },
  { code: "FI", name: "Finland" },
  { code: "PL", name: "Poland" },
  { code: "GB", name: "United Kingdom" },
  { code: "US", name: "United States" },
  { code: "CA", name: "Canada" },
  { code: "AU", name: "Australia" },
  { code: "NZ", name: "New Zealand" },
  { code: "ZA", name: "South Africa" },
  { code: "OTHER", name: "Other" },
]

function passwordStrength(pwd: string): { score: number; label: string; color: string } {
  let score = 0
  if (pwd.length >= 12) score++
  if (/\d/.test(pwd)) score++
  if (/[!@#$%^&*()_+\-=[\]{}|;':",.<>?/]/.test(pwd)) score++
  if (pwd.length >= 20) score++

  if (score <= 1) return { score, label: "Weak", color: "bg-red-500" }
  if (score === 2) return { score, label: "Fair", color: "bg-yellow-500" }
  if (score === 3) return { score, label: "Strong", color: "bg-green-500" }
  return { score, label: "Very Strong", color: "bg-emerald-600" }
}

export default function RegisterPage() {
  const router = useRouter()
  const [serverError, setServerError] = useState<string | null>(null)
  const [watchedCountry, setWatchedCountry] = useState("CH")
  const [watchedPassword, setWatchedPassword] = useState("")

  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
    setValue,
  } = useForm<RegistrationInput>({
    resolver: zodResolver(registrationInput),
    defaultValues: { country: "CH" },
  })

  const registerMutation = trpc.iam.register.useMutation({
    onSuccess: () => {
      router.push("/register/check-email")
    },
    onError: (err) => {
      const msg = err.message
      if (msg.includes("already exists")) {
        setServerError("An account already exists for this email. Please sign in.")
      } else if (msg.includes("previous application")) {
        setServerError(
          "This email is associated with a previous application. Please contact support@bivro.io.",
        )
      } else {
        setServerError(msg || "Registration failed. Please try again.")
      }
    },
  })

  const vatConfig = getVatFieldConfig(watchedCountry)

  async function onSubmit(data: RegistrationInput) {
    setServerError(null)

    // Client-side VAT validation
    if (data.vatNumber) {
      const vatError = validateVat(data.country, data.vatNumber)
      if (vatError) {
        setServerError(vatError)
        return
      }
    }

    await registerMutation.mutateAsync(data)
  }

  const strength = passwordStrength(watchedPassword)

  return (
    <div className="flex min-h-screen">
      {/* Left branding panel */}
      <div className="hidden flex-col justify-between bg-slate-900 p-12 text-white lg:flex lg:w-1/2">
        <span className="text-xl font-semibold tracking-tight">Bivro</span>
        <div>
          <p className="text-3xl leading-snug font-bold">
            Start your moving
            <br />
            company&apos;s journey.
          </p>
          <p className="mt-4 text-sm text-slate-400">
            Register your company and get approved within 1 business day.
          </p>
        </div>
        <p className="text-xs text-slate-500">© 2026 Bivro. All rights reserved.</p>
      </div>

      {/* Right form panel */}
      <div className="flex flex-1 flex-col items-center justify-center bg-white px-6 py-12">
        <div className="mb-8 lg:hidden">
          <span className="text-xl font-semibold tracking-tight text-slate-900">Bivro</span>
        </div>

        <div className="w-full max-w-md">
          <div className="mb-8">
            <h1 className="text-2xl font-bold text-slate-900">Register your company</h1>
            <p className="mt-1 text-sm text-slate-500">
              Already have an account?{" "}
              <a href="/login" className="font-medium text-violet-600 hover:text-violet-700">
                Sign in
              </a>
            </p>
          </div>

          {serverError ? (
            <div className="mb-6 rounded-md border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
              {serverError}
            </div>
          ) : null}

          <form onSubmit={handleSubmit(onSubmit)} className="space-y-5" noValidate>
            {/* Company Information */}
            <div className="space-y-4">
              <h2 className="text-xs font-semibold tracking-wide text-slate-400 uppercase">
                Company Information
              </h2>

              <div>
                <label className="mb-1 block text-sm font-medium text-slate-700">
                  Company legal name <span className="text-red-500">*</span>
                </label>
                <input
                  type="text"
                  {...register("companyLegalName")}
                  placeholder="Alpine Moving GmbH"
                  className={inputClass(!!errors.companyLegalName)}
                />
                {errors.companyLegalName ? (
                  <p className="mt-1 text-xs text-red-600">{errors.companyLegalName.message}</p>
                ) : null}
              </div>

              <div>
                <label className="mb-1 block text-sm font-medium text-slate-700">
                  Trading name{" "}
                  <span className="font-normal text-slate-400">(optional — if different)</span>
                </label>
                <input
                  type="text"
                  {...register("tradingName")}
                  placeholder="Alpine Moving"
                  className={inputClass(false)}
                />
              </div>

              <div>
                <label className="mb-1 block text-sm font-medium text-slate-700">
                  Country <span className="text-red-500">*</span>
                </label>
                <select
                  {...register("country")}
                  onChange={(e) => {
                    setValue("country", e.target.value)
                    setWatchedCountry(e.target.value)
                    setValue("vatNumber", "")
                  }}
                  className={inputClass(!!errors.country)}
                >
                  {COUNTRIES.map((c) => (
                    <option key={c.code} value={c.code}>
                      {c.name}
                    </option>
                  ))}
                </select>
                {errors.country ? (
                  <p className="mt-1 text-xs text-red-600">{errors.country.message}</p>
                ) : null}
              </div>

              <div>
                <label className="mb-1 block text-sm font-medium text-slate-700">
                  {vatConfig.label} <span className="font-normal text-slate-400">(optional)</span>
                </label>
                <input
                  type="text"
                  {...register("vatNumber")}
                  placeholder={vatConfig.placeholder}
                  className={inputClass(!!errors.vatNumber)}
                />
                {errors.vatNumber ? (
                  <p className="mt-1 text-xs text-red-600">{errors.vatNumber.message}</p>
                ) : null}
              </div>

              <div>
                <label className="mb-1 block text-sm font-medium text-slate-700">
                  Company website <span className="font-normal text-slate-400">(optional)</span>
                </label>
                <input
                  type="url"
                  {...register("website")}
                  placeholder="https://yourcompany.com"
                  className={inputClass(false)}
                />
              </div>

              <div>
                <label className="mb-1 block text-sm font-medium text-slate-700">
                  Company phone <span className="font-normal text-slate-400">(optional)</span>
                </label>
                <input
                  type="tel"
                  {...register("phone")}
                  placeholder="+41 44 123 45 67"
                  className={inputClass(false)}
                />
              </div>
            </div>

            {/* Owner Information */}
            <div className="space-y-4 pt-2">
              <h2 className="text-xs font-semibold tracking-wide text-slate-400 uppercase">
                Account Owner
              </h2>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="mb-1 block text-sm font-medium text-slate-700">
                    First name <span className="text-red-500">*</span>
                  </label>
                  <input
                    type="text"
                    {...register("ownerFirstName")}
                    placeholder="Jane"
                    className={inputClass(!!errors.ownerFirstName)}
                    autoComplete="given-name"
                  />
                  {errors.ownerFirstName ? (
                    <p className="mt-1 text-xs text-red-600">{errors.ownerFirstName.message}</p>
                  ) : null}
                </div>

                <div>
                  <label className="mb-1 block text-sm font-medium text-slate-700">
                    Last name <span className="text-red-500">*</span>
                  </label>
                  <input
                    type="text"
                    {...register("ownerLastName")}
                    placeholder="Smith"
                    className={inputClass(!!errors.ownerLastName)}
                    autoComplete="family-name"
                  />
                  {errors.ownerLastName ? (
                    <p className="mt-1 text-xs text-red-600">{errors.ownerLastName.message}</p>
                  ) : null}
                </div>
              </div>

              <div>
                <label className="mb-1 block text-sm font-medium text-slate-700">
                  Email address <span className="text-red-500">*</span>
                </label>
                <input
                  type="email"
                  {...register("email")}
                  placeholder="jane@alpinemoving.ch"
                  className={inputClass(!!errors.email)}
                  autoComplete="email"
                />
                {errors.email ? (
                  <p className="mt-1 text-xs text-red-600">{errors.email.message}</p>
                ) : null}
              </div>

              <div>
                <label className="mb-1 block text-sm font-medium text-slate-700">
                  Password <span className="text-red-500">*</span>
                </label>
                <input
                  type="password"
                  {...register("password")}
                  placeholder="Minimum 12 characters"
                  className={inputClass(!!errors.password)}
                  autoComplete="new-password"
                  onChange={(e) => {
                    register("password").onChange(e)
                    setWatchedPassword(e.target.value)
                  }}
                />
                {watchedPassword.length > 0 ? (
                  <div className="mt-2">
                    <div className="flex gap-1">
                      {[1, 2, 3, 4].map((i) => (
                        <div
                          key={i}
                          className={`h-1 flex-1 rounded-full ${
                            i <= strength.score ? strength.color : "bg-slate-200"
                          }`}
                        />
                      ))}
                    </div>
                    <p className="mt-1 text-xs text-slate-500">{strength.label}</p>
                  </div>
                ) : null}
                {errors.password ? (
                  <p className="mt-1 text-xs text-red-600">{errors.password.message}</p>
                ) : null}
                <p className="mt-1 text-xs text-slate-400">
                  At least 12 characters, 1 number, and 1 special character
                </p>
              </div>
            </div>

            {/* Legal */}
            <div className="space-y-3 pt-2">
              <div className="flex items-start gap-3">
                <input
                  id="termsAccepted"
                  type="checkbox"
                  {...register("termsAccepted")}
                  className="mt-0.5 h-4 w-4 rounded border-slate-300 text-violet-600 focus:ring-violet-500"
                />
                <label htmlFor="termsAccepted" className="text-sm text-slate-600">
                  I accept the{" "}
                  <a href="/terms" className="font-medium text-violet-600 hover:text-violet-700">
                    Terms of Service
                  </a>{" "}
                  <span className="text-red-500">*</span>
                </label>
              </div>
              {errors.termsAccepted ? (
                <p className="text-xs text-red-600">{errors.termsAccepted.message}</p>
              ) : null}

              <div className="flex items-start gap-3">
                <input
                  id="privacyAccepted"
                  type="checkbox"
                  {...register("privacyAccepted")}
                  className="mt-0.5 h-4 w-4 rounded border-slate-300 text-violet-600 focus:ring-violet-500"
                />
                <label htmlFor="privacyAccepted" className="text-sm text-slate-600">
                  I accept the{" "}
                  <a href="/privacy" className="font-medium text-violet-600 hover:text-violet-700">
                    Privacy Policy
                  </a>{" "}
                  <span className="text-red-500">*</span>
                </label>
              </div>
              {errors.privacyAccepted ? (
                <p className="text-xs text-red-600">{errors.privacyAccepted.message}</p>
              ) : null}
            </div>

            <button
              type="submit"
              disabled={isSubmitting || registerMutation.isPending}
              className="mt-2 w-full rounded-md bg-slate-900 px-4 py-2.5 text-sm font-semibold text-white hover:bg-slate-800 focus:ring-2 focus:ring-violet-600/30 focus:ring-offset-2 focus:outline-none disabled:cursor-not-allowed disabled:opacity-50"
            >
              {isSubmitting || registerMutation.isPending
                ? "Creating your account…"
                : "Register company"}
            </button>
          </form>
        </div>
      </div>
    </div>
  )
}

function inputClass(hasError: boolean): string {
  return [
    "block w-full rounded-md border bg-slate-50 px-3 py-2 text-sm text-slate-900 placeholder:text-slate-400",
    "focus:outline-none focus:ring-2 focus:ring-violet-600/20",
    hasError ? "border-red-400 focus:border-red-500" : "border-slate-300 focus:border-violet-600",
  ].join(" ")
}
