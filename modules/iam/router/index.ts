import { createTRPCRouter } from "@/lib/trpc/init"
import { register, resendVerification, checkCompanyName } from "./registration"
import { lookupInvitation, acceptInvitation, inviteUser, revokeInvitation } from "./invitation"
import { forgotPassword, changePassword } from "./password"

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
})
