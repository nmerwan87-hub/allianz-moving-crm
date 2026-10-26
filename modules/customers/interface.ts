// Public API for the Customers module. Import only from this file outside the module.
// Client components import from here, so it must not re-export the server router
// (lib/trpc/router.ts imports it from ./router directly).

export type { Customer, CustomerListResult, CustomerDuplicate } from "./schema"
export {
  customerTypeEnum,
  salutationEnum,
  customerLanguageEnum,
  createCustomerInput,
  updateCustomerInput,
  listCustomersInput,
} from "./schema"
