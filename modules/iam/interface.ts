// Public API for the IAM module. Import only from this file outside the module.

export {
  loadOfficePermissions,
  getCachedPermissions,
  hasPermission,
  invalidatePermissionCache,
} from "./lib/permissions"

export type { EffectivePermissions } from "./lib/permissions"

export { provisionCompany } from "./lib/provisioning"

export { iamRouter } from "./router/index"
