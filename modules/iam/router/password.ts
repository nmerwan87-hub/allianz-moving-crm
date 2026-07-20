import { z } from "zod"
import { TRPCError } from "@trpc/server"
import { createElement } from "react"
import { publicProcedure, protectedProcedure } from "@/lib/trpc/init"
import { createServiceRoleClient } from "@/lib/supabase/service-role"
import { sendPlatformEmail } from "@/lib/email/send"

const PASSWORD_REGEX = /^(?=.*\d)(?=.*[!@#$%^&*()_+\-=[\]{}|;':",.<>?/]).{12,128}$/

// ─── Forgot password ──────────────────────────────────────────────────────────

export const forgotPassword = publicProcedure
  .input(z.object({ email: z.string().email() }))
  .mutation(async ({ input, ctx }) => {
    const appUrl = process.env["NEXT_PUBLIC_APP_URL"] ?? "http://localhost:3000"

    // Always return the same response to prevent email enumeration
    await ctx.supabase.auth.resetPasswordForEmail(input.email, {
      redirectTo: `${appUrl}/reset-password`,
    })

    return {
      success: true,
      message: "If this email is registered, you'll receive a reset link.",
    }
  })

// ─── Change password (while authenticated) ───────────────────────────────────

export const changePassword = protectedProcedure
  .input(
    z.object({
      currentPassword: z.string().min(1),
      newPassword: z.string().min(12).max(128),
    }),
  )
  .mutation(async ({ input, ctx }) => {
    if (!PASSWORD_REGEX.test(input.newPassword)) {
      throw new TRPCError({
        code: "BAD_REQUEST",
        message:
          "New password must be at least 12 characters and contain at least one number and one special character.",
      })
    }

    // Re-authenticate to verify current password
    const { error: signInError } = await ctx.supabase.auth.signInWithPassword({
      email: ctx.user.email ?? "",
      password: input.currentPassword,
    })

    if (signInError) {
      throw new TRPCError({ code: "BAD_REQUEST", message: "Current password is incorrect." })
    }

    // Update password
    const { error: updateError } = await ctx.supabase.auth.updateUser({
      password: input.newPassword,
    })

    if (updateError) {
      throw new TRPCError({
        code: "INTERNAL_SERVER_ERROR",
        message: "Failed to update password. Please try again.",
      })
    }

    // Write activity log
    const svc = createServiceRoleClient()
    if (ctx.companyId) {
      await svc.from("activity_logs").insert({
        company_id: ctx.companyId,
        actor_id: ctx.user.id,
        actor_type: "user",
        actor_email: ctx.user.email ?? "",
        action: "user.password_changed",
        entity_type: "profile",
        entity_id: ctx.user.id,
      })
    }

    // Send password-changed confirmation email
    try {
      const { PlatformPasswordChanged } =
        await import("@/emails/platform/platform-password-changed")
      const now = new Date()
      await sendPlatformEmail({
        to: ctx.user.email ?? "",
        subject: "Your Bivro password has been changed",
        react: createElement(PlatformPasswordChanged, {
          email: ctx.user.email ?? "",
          changedAt: now.toUTCString(),
        }),
      })
    } catch {
      console.error("[password] Failed to send password-changed email")
    }

    return { success: true }
  })
