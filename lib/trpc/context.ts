import { createClient } from "@/lib/supabase/server"

export async function createContext() {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  const companyId = user?.app_metadata["company_id"] as string | undefined
  const role = user?.app_metadata["role"] as "owner" | "office" | undefined
  const companyStatus = user?.app_metadata["company_status"] as string | undefined

  return {
    supabase,
    user,
    companyId,
    role,
    companyStatus,
  }
}

export type Context = Awaited<ReturnType<typeof createContext>>
