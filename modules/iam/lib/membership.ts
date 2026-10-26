import type { createServiceRoleClient } from "@/lib/supabase/service-role"

type ServiceClient = ReturnType<typeof createServiceRoleClient>

export interface CompanyMember {
  id: string
  firstName: string
  lastName: string
  email: string
  role: "owner" | "office"
  isActive: boolean
  lastSeenAt: string | null
  joinedAt: string
}

interface MembershipRow {
  role: string
  is_active: boolean
  created_at: string
  profiles: {
    id: string
    first_name: string
    last_name: string
    email: string
    last_seen_at: string | null
    deleted_at: string | null
  } | null
}

const MEMBER_SELECT =
  "role, is_active, created_at, profiles!inner(id, first_name, last_name, email, last_seen_at, deleted_at)"

function toMember(row: MembershipRow): CompanyMember | null {
  const p = row.profiles
  if (!p || p.deleted_at) return null
  return {
    id: p.id,
    firstName: p.first_name,
    lastName: p.last_name,
    email: p.email,
    role: row.role as "owner" | "office",
    isActive: row.is_active,
    lastSeenAt: p.last_seen_at,
    joinedAt: row.created_at,
  }
}

/**
 * Members of a company come from company_memberships, not profiles.company_id:
 * profiles.company_id is only the company a person is currently working in.
 * Role and is_active are per company and live on the membership.
 */
export async function listCompanyMembers(
  svc: ServiceClient,
  companyId: string,
): Promise<CompanyMember[]> {
  const { data, error } = await svc
    .from("company_memberships")
    .select(MEMBER_SELECT)
    .eq("company_id", companyId)
    .order("created_at", { ascending: true })

  if (error) throw error
  return ((data ?? []) as unknown as MembershipRow[])
    .map(toMember)
    .filter((m): m is CompanyMember => m !== null)
}

/** Returns the member if the user belongs to the company (active or not), otherwise null. */
export async function getCompanyMember(
  svc: ServiceClient,
  companyId: string,
  userId: string,
): Promise<CompanyMember | null> {
  const { data } = await svc
    .from("company_memberships")
    .select(MEMBER_SELECT)
    .eq("company_id", companyId)
    .eq("user_id", userId)
    .maybeSingle()

  return data ? toMember(data as unknown as MembershipRow) : null
}

export interface UserCompany {
  id: string
  name: string
  slug: string
  logoUrl: string | null
  role: "owner" | "office"
}

/** Active memberships of a user in active companies, most recently used first. */
export async function listUserCompanies(
  svc: ServiceClient,
  userId: string,
): Promise<UserCompany[]> {
  const { data, error } = await svc
    .from("company_memberships")
    .select(
      "role, last_used_at, companies!inner(id, name, slug, logo_url, company_status, deleted_at)",
    )
    .eq("user_id", userId)
    .eq("is_active", true)
    .order("last_used_at", { ascending: false, nullsFirst: false })

  if (error) throw error

  type Row = {
    role: string
    companies: {
      id: string
      name: string
      slug: string
      logo_url: string | null
      company_status: string
      deleted_at: string | null
    }
  }

  return ((data ?? []) as unknown as Row[])
    .filter((r) => r.companies.company_status === "active" && !r.companies.deleted_at)
    .map((r) => ({
      id: r.companies.id,
      name: r.companies.name,
      slug: r.companies.slug,
      logoUrl: r.companies.logo_url,
      role: r.role as "owner" | "office",
    }))
}
