import { createTRPCRouter } from "@/lib/trpc/init"
import { register, resendVerification, checkCompanyName } from "./registration"
import { lookupInvitation, acceptInvitation, inviteUser, revokeInvitation } from "./invitation"
import { forgotPassword, changePassword } from "./password"
import { teamRouter } from "./team"
import { permissionGroupsRouter, permissionDefinitionsRouter } from "./permission-groups"
import { userPermissionsRouter } from "./user-permissions"

export const iamRouter = createTRPCRouter({
  register,
  resendVerification,
  checkCompanyName,
  lookupInvitation,
  acceptInvitation,
  inviteUser,
  revokeInvitation,
  forgotPassword,
  changePassword,
  team: teamRouter,
  permissionGroups: permissionGroupsRouter,
  permissionDefinitions: permissionDefinitionsRouter,
  userPermissions: userPermissionsRouter,
})
