// Public API for the Leads module. Import only from this file outside the module.
// Client components import from here, so it must not re-export the server router
// (lib/trpc/router.ts imports it from ./router directly).

export type { Lead, LeadListResult } from "./schema"
export {
  leadStatusEnum,
  acquisitionSourceEnum,
  moveTypeEnum,
  propertySizeEnum,
  createLeadInput,
  updateLeadInput,
  updateLeadStatusInput,
  listLeadsInput,
} from "./schema"
