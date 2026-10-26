// Public API for the Company module (profile, bank details, logo).
// Client components import from here, so it must not re-export the server router
// (lib/trpc/router.ts imports it from ./router directly).

export type { CompanyProfile } from "./schema"
export { companyProfileInput, companyBankInput } from "./schema"
