// Public API for the fleet module.
// Client components import from here, so it must not re-export the server router.

export type { Vehicle } from "./schema"
export { vehicleTypeEnum, vehicleStatusEnum, createVehicleInput } from "./schema"
