"use client"

import { useRouter } from "next/navigation"
import { LogOut, Settings, User as UserIcon } from "lucide-react"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "./ui/dropdown-menu"
import { Avatar } from "./ui/avatar"
import { createClient } from "@/lib/supabase/client"

interface UserMenuProps {
  firstName: string
  lastName: string
  email: string
  role: "owner" | "office"
}

export function UserMenu({ firstName, lastName, email, role }: UserMenuProps) {
  const router = useRouter()
  const initials = `${firstName.charAt(0)}${lastName.charAt(0)}`.toUpperCase()
  const displayName = `${firstName} ${lastName}`
  const roleLabel = role === "owner" ? "Owner" : "Office"

  async function handleSignOut() {
    const supabase = createClient()
    await supabase.auth.signOut()
    router.push("/login")
  }

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button className="hover:bg-surface-sunken flex items-center gap-2 rounded-[var(--radius-md)] px-2 py-1.5 transition-colors">
          <Avatar fallback={initials} className="h-7 w-7" />
          <div className="hidden text-left sm:block">
            <p className="text-text-primary text-sm leading-tight font-medium">{displayName}</p>
            <p className="text-text-muted text-xs leading-tight">{roleLabel}</p>
          </div>
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        <DropdownMenuLabel>{email}</DropdownMenuLabel>
        <DropdownMenuSeparator />
        <DropdownMenuItem onSelect={() => router.push("/settings")}>
          <Settings className="text-text-muted h-4 w-4" />
          Settings
        </DropdownMenuItem>
        <DropdownMenuItem onSelect={() => router.push("/settings/team")}>
          <UserIcon className="text-text-muted h-4 w-4" />
          Team &amp; Permissions
        </DropdownMenuItem>
        <DropdownMenuSeparator />
        <DropdownMenuItem onSelect={handleSignOut} className="text-danger-700 focus:bg-danger-100">
          <LogOut className="h-4 w-4" />
          Sign out
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  )
}
