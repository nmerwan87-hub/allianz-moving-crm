// Public API for the Catalog module (services, rate cards, pricing settings).
// Client components import from here, so it must not re-export the server router
// (lib/trpc/router.ts imports it from ./router directly).

export type { Service, RateCard, PricingSettings } from "./schema"
export {
  pricingModeEnum,
  vehicleTypeEnum,
  createServiceInput,
  createRateCardInput,
  pricingSettingsInput,
} from "./schema"
