import { z } from "zod"
import { TRPCError } from "@trpc/server"
import { createElement } from "react"
import { publicProcedure, ownerProcedure, protectedProcedure } from "@/lib/trpc/init"
import { createServiceRoleClient } from "@/lib/supabase/service-role"
import { sendPlatformEmail } from "@/lib/email/send"
import { sha256, generateRawToken } from "./registration"
import { getCompanyMember } from "@/modules/iam/lib/membership"

const PASSWORD_REGEX = /^(?=.*\d)(?=.*[!@#$%^&*()_+\-=[\]{}|;':",.<>?/]).{12,128}$/

// ─── Look up an invitation by raw token ──────────────────────────────────────

export const lookupInvitation = publicProcedure
  .input(z.object({ rawToken: z.string().min(1) }))
  .query(async ({ input }) => {
    const svc = createServiceRoleClient()
    const tokenHash = sha256(input.rawToken)

    const { data: invitation } = await svc
      .from("user_invitations")
      .select("id, company_id, email, role, permission_group_ids, status, expires_at, invited_by")
      .eq("token_hash", tokenHash)
      .maybeSingle()

    if (!invitation) {
      return { valid: false as const, reason: "not_found" as const }
    }

    if (invitation.status !== "pending") {
      return {
        valid: false as const,
        reason: invitation.status as "accepted" | "expired" | "revoked",
      }
    }

    if (new Date(invitation.expires_at as string) < new Date()) {
      // Expire it
      await svc.from("user_invitations").update({ status: "expired" }).eq("id", invitation.id)
      return { valid: false as const, reason: "expired" as const }
    }

    // Load company name, inviter name and whether the invitee already has an account
    const [{ data: company }, { data: inviter }, { data: existingAccount }] = await Promise.all([
      svc.from("companies").select("name").eq("id", invitation.company_id).maybeSingle(),
      svc
        .from("profiles")
        .select("first_name, last_name")
        .eq("id", invitation.invited_by as string)
        .maybeSingle(),
      svc
        .from("profiles")
        .select("id")
        .ilike("email", invitation.email as string)
        .is("deleted_at", null)
        .maybeSingle(),
    ])

    return {
      valid: true as const,
      invitation: {
        id: invitation.id,
        email: invitation.email,
        role: invitation.role,
        expiresAt: invitation.expires_at,
        companyName: company?.name ?? "your company",
        inviterName: inviter ? `${inviter.first_name} ${inviter.last_name}` : "your administrator",
        // Existing accounts join by signing in (joinInvitedCompany), never by setting a new password.
        accountExists: Boolean(existingAccount),
      },
    }
  })

// ─── Accept an invitation ─────────────────────────────────────────────────────

export const acceptInvitation = publicProcedure
  .input(
    z.object({
      rawToken: z.string().min(1),
      firstName: z.string().min(1).max(100),
      lastName: z.string().min(1).max(100),
      password: z.string().min(12).max(128),
    }),
  )
  .mutation(async ({ input }) => {
    const svc = createServiceRoleClient()

    // 1. Password validation
    if (!PASSWORD_REGEX.test(input.password)) {
      throw new TRPCError({
        code: "BAD_REQUEST",
        message:
          "Password must be at least 12 characters and contain at least one number and one special character.",
      })
    }

    // 2. Re-validate invitation
    const tokenHash = sha256(input.rawToken)
    const { data: invitation } = await svc
      .from("user_invitations")
      .select(
        "id, company_id, email, role, permission_group_ids, status, expires_at, invited_by, created_at",
      )
      .eq("token_hash", tokenHash)
      .maybeSingle()

    if (!invitation) {
      throw new TRPCError({ code: "NOT_FOUND", message: "Invitation not found." })
    }
    if (invitation.status !== "pending") {
      throw new TRPCError({
        code: "BAD_REQUEST",
        message: "This invitation has already been used or revoked.",
      })
    }
    if (new Date(invitation.expires_at as string) < new Date()) {
      await svc.from("user_invitations").update({ status: "expired" }).eq("id", invitation.id)
      throw new TRPCError({ code: "BAD_REQUEST", message: "This invitation has expired." })
    }

    // 3. New accounts only. An existing account must sign in and use
    //    joinInvitedCompany — an invitation link must never reset a password.
    const { data: existingProfile } = await svc
      .from("profiles")
      .select("id")
      .ilike("email", invitation.email as string)
      .maybeSingle()

    if (existingProfile) {
      throw new TRPCError({
        code: "CONFLICT",
        message: "An account with this email already exists. Sign in to accept the invitation.",
      })
    }

    const { data: newUser, error: createError } = await svc.auth.admin.createUser({
      email: invitation.email as string,
      password: input.password,
      email_confirm: true,
    })
    if (createError ?? !newUser.user) {
      throw new TRPCError({
        code: "INTERNAL_SERVER_ERROR",
        message: createError?.message ?? "Failed to create account",
      })
    }
    const authUserId = newUser.user.id

    // 4. Create profile — the profile insert trigger creates the company membership
    await svc.from("profiles").insert({
      id: authUserId,
      company_id: invitation.company_id,
      role: "office",
      first_name: input.firstName,
      last_name: input.lastName,
      email: invitation.email,
      is_active: true,
      invited_by: invitation.invited_by ?? null,
      invited_at: invitation.created_at ?? null,
    })

    await completeInvitation(svc, invitation, authUserId, `${input.firstName} ${input.lastName}`)

    return { success: true, email: invitation.email as string }
  })

// ─── Shared: permission groups, accepted status, audit ───────────────────────

interface AcceptedInvitation {
  id: string
  company_id: string
  email: string
  permission_group_ids: string[] | null
}

async function completeInvitation(
  svc: ReturnType<typeof createServiceRoleClient>,
  invitation: AcceptedInvitation,
  authUserId: string,
  actorName: string,
) {
  // 1. Create user_permission_groups for each group in the invitation
  const groupIds = (invitation.permission_group_ids as string[] | null) ?? []
  if (groupIds.length > 0) {
    const { data: existing } = await svc
      .from("user_permission_groups")
      .select("group_id")
      .eq("user_id", authUserId)
      .eq("company_id", invitation.company_id as string)

    const existingGroupIds = new Set((existing ?? []).map((e) => e.group_id))

    const newAssignments = groupIds
      .filter((gid) => !existingGroupIds.has(gid))
      .map((gid) => ({
        user_id: authUserId,
        company_id: invitation.company_id,
        group_id: gid,
      }))

    if (newAssignments.length > 0) {
      await svc.from("user_permission_groups").insert(newAssignments)
    }
  }

  // 2. Mark invitation accepted
  await svc
    .from("user_invitations")
    .update({
      status: "accepted",
      accepted_at: new Date().toISOString(),
      accepted_by_auth_uid: authUserId,
    })
    .eq("id", invitation.id)

  // 3. Write activity log
  await svc.from("activity_logs").insert({
    company_id: invitation.company_id,
    actor_id: authUserId,
    actor_type: "user",
    actor_email: invitation.email,
    actor_name: actorName,
    action: "user_invitation.accepted",
    entity_type: "user_invitation",
    entity_id: invitation.id,
    metadata: { role: "office", permission_groups: groupIds },
  })
}

// ─── Join a company with an existing account ─────────────────────────────────

export const joinInvitedCompany = protectedProcedure
  .input(z.object({ rawToken: z.string().min(1) }))
  .mutation(async ({ input, ctx }) => {
    const svc = createServiceRoleClient()
    const tokenHash = sha256(input.rawToken)

    const { data: invitation } = await svc
      .from("user_invitations")
      .select("id, company_id, email, role, permission_group_ids, status, expires_at")
      .eq("token_hash", tokenHash)
      .maybeSingle()

    if (!invitation) {
      throw new TRPCError({ code: "NOT_FOUND", message: "Invitation not found." })
    }
    if (invitation.status !== "pending") {
      throw new TRPCError({
        code: "BAD_REQUEST",
        message: "This invitation has already been used or revoked.",
      })
    }
    if (new Date(invitation.expires_at as string) < new Date()) {
      await svc.from("user_invitations").update({ status: "expired" }).eq("id", invitation.id)
      throw new TRPCError({ code: "BAD_REQUEST", message: "This invitation has expired." })
    }

    // The invitation belongs to an email address — only that account may use it.
    const userEmail = ctx.user.email?.toLowerCase()
    if (!userEmail || userEmail !== (invitation.email as string).toLowerCase()) {
      throw new TRPCError({
        code: "FORBIDDEN",
        message: `This invitation was sent to ${invitation.email as string}. Sign in with that account to accept it.`,
      })
    }

    const { data: profile } = await svc
      .from("profiles")
      .select("first_name, last_name")
      .eq("id", ctx.user.id)
      .maybeSingle()

    // Create the membership, or reactivate a deactivated one. An existing owner
    // membership keeps its role: invitations never downgrade.
    const existing = await getCompanyMember(svc, invitation.company_id as string, ctx.user.id)
    if (!existing) {
      const { error } = await svc.from("company_memberships").insert({
        company_id: invitation.company_id,
        user_id: ctx.user.id,
        role: "office",
        is_active: true,
      })
      if (error) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" })
    } else if (!existing.isActive) {
      await svc
        .from("company_memberships")
        .update({ is_active: true })
        .eq("company_id", invitation.company_id as string)
        .eq("user_id", ctx.user.id)
    }

    await completeInvitation(
      svc,
      invitation as AcceptedInvitation,
      ctx.user.id,
      profile ? `${profile.first_name} ${profile.last_name}` : (invitation.email as string),
    )

    // Make the joined company the active one; the client refreshes its session next.
    await ctx.supabase.rpc("switch_active_company", {
      p_company_id: invitation.company_id as string,
    })

    return { success: true, companyId: invitation.company_id as string }
  })

// ─── Invite a user (owner only) ───────────────────────────────────────────────

export const inviteUser = ownerProcedure
  .input(
    z.object({
      email: z.string().email(),
      permissionGroupIds: z.array(z.string().uuid()).min(0),
    }),
  )
  .mutation(async ({ input, ctx }) => {
    const svc = createServiceRoleClient()
    const companyId = ctx.companyId

    if (!companyId) {
      throw new TRPCError({ code: "UNAUTHORIZED" })
    }

    // Already an active member of this company → nothing to invite
    const { data: invitee } = await svc
      .from("profiles")
      .select("id")
      .ilike("email", input.email)
      .is("deleted_at", null)
      .maybeSingle()
    if (invitee) {
      const member = await getCompanyMember(svc, companyId, invitee.id)
      if (member?.isActive) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "This person is already a member of your company.",
        })
      }
    }

    // Revoke any existing pending invitation for this email + company
    const { data: existingInvitation } = await svc
      .from("user_invitations")
      .select("id")
      .eq("company_id", companyId)
      .eq("email", input.email)
      .eq("status", "pending")
      .maybeSingle()

    if (existingInvitation) {
      await svc
        .from("user_invitations")
        .update({
          status: "revoked",
          revoked_at: new Date().toISOString(),
          revoked_by: ctx.user.id,
          revocation_reason: "Superseded by new invitation",
        })
        .eq("id", existingInvitation.id)
    }

    // Generate raw token (never stored) and store only the hash
    const rawToken = generateRawToken()
    const tokenHash = sha256(rawToken)

    const expiresAt = new Date()
    expiresAt.setDate(expiresAt.getDate() + 7)

    const { data: invitation, error: inviteError } = await svc
      .from("user_invitations")
      .insert({
        company_id: companyId,
        email: input.email,
        role: "office",
        permission_group_ids: input.permissionGroupIds,
        token_hash: tokenHash,
        invited_by: ctx.user.id,
        status: "pending",
        expires_at: expiresAt.toISOString(),
      })
      .select("id")
      .single()

    if (inviteError ?? !invitation) {
      throw new TRPCError({
        code: "INTERNAL_SERVER_ERROR",
        message: "Failed to create invitation",
      })
    }

    // Load company name and inviter name for the email
    const [{ data: company }, { data: inviterProfile }] = await Promise.all([
      svc.from("companies").select("name").eq("id", companyId).maybeSingle(),
      svc.from("profiles").select("first_name, last_name").eq("id", ctx.user.id).maybeSingle(),
    ])

    const appUrl = process.env["NEXT_PUBLIC_APP_URL"] ?? "http://localhost:3000"
    const inviteUrl = `${appUrl}/invite/${rawToken}`

    try {
      const { PlatformOfficeInvitation } =
        await import("@/emails/platform/platform-office-invitation")
      await sendPlatformEmail({
        to: input.email,
        subject: `You've been invited to join ${company?.name ?? "a company"} on Bivro`,
        react: createElement(PlatformOfficeInvitation, {
          companyName: company?.name ?? "your company",
          inviterName: inviterProfile
            ? `${inviterProfile.first_name} ${inviterProfile.last_name}`
            : "your administrator",
          inviteUrl,
          expiresAt: expiresAt.toLocaleDateString("en-GB", {
            day: "numeric",
            month: "long",
            year: "numeric",
          }),
        }),
      })
    } catch {
      console.error("[invitation] Failed to send invitation email")
    }

    // Write activity log
    await svc.from("activity_logs").insert({
      company_id: companyId,
      actor_id: ctx.user.id,
      actor_type: "user",
      action: "user_invitation.created",
      entity_type: "user_invitation",
      entity_id: invitation.id,
      metadata: { email: input.email, role: "office", permission_groups: input.permissionGroupIds },
    })

    return { success: true, invitationId: invitation.id }
  })

// ─── Revoke an invitation (owner only) ────────────────────────────────────────

export const revokeInvitation = ownerProcedure
  .input(z.object({ invitationId: z.string().uuid() }))
  .mutation(async ({ input, ctx }) => {
    const svc = createServiceRoleClient()

    const { data: invitation } = await svc
      .from("user_invitations")
      .select("id, company_id, status")
      .eq("id", input.invitationId)
      .eq("company_id", ctx.companyId ?? "")
      .maybeSingle()

    if (!invitation) {
      throw new TRPCError({ code: "NOT_FOUND", message: "Invitation not found." })
    }
    if (invitation.status !== "pending") {
      throw new TRPCError({
        code: "BAD_REQUEST",
        message: "Only pending invitations can be revoked.",
      })
    }

    await svc
      .from("user_invitations")
      .update({
        status: "revoked",
        revoked_at: new Date().toISOString(),
        revoked_by: ctx.user.id,
      })
      .eq("id", invitation.id)

    await svc.from("activity_logs").insert({
      company_id: ctx.companyId,
      actor_id: ctx.user.id,
      actor_type: "user",
      action: "user_invitation.revoked",
      entity_type: "user_invitation",
      entity_id: invitation.id,
    })

    return { success: true }
  })
