"use client"

import { useState, useTransition } from "react"
import { trpc } from "@/lib/trpc/client"
import type { AppRouter } from "@/lib/trpc/router"
import type { inferRouterOutputs } from "@trpc/server"

type RouterOutputs = inferRouterOutputs<AppRouter>
type TeamMember = RouterOutputs["iam"]["team"]["list"][number]
type PermissionGroup = RouterOutputs["iam"]["permissionGroups"]["list"][number]
type PermissionDef = RouterOutputs["iam"]["permissionDefinitions"]["list"][number]

interface Props {
  initialMembers: TeamMember[]
  initialGroups: PermissionGroup[]
  definitions: PermissionDef[]
}

// Group permission definitions by resource for the matrix UI
function groupByResource(defs: PermissionDef[]): Map<string, PermissionDef[]> {
  const map = new Map<string, PermissionDef[]>()
  for (const d of defs) {
    if (!map.has(d.resource)) map.set(d.resource, [])
    map.get(d.resource)!.push(d)
  }
  return map
}

// ─── Group create/edit modal ──────────────────────────────────────────────────

interface GroupModalProps {
  group?: PermissionGroup | null | undefined
  definitions: PermissionDef[]
  onClose: () => void
  onSaved: () => void
}

function GroupModal({ group, definitions, onClose, onSaved }: GroupModalProps) {
  const isEdit = !!group
  const [name, setName] = useState(group?.name ?? "")
  const [description, setDescription] = useState(group?.description ?? "")
  const [selectedPerms, setSelectedPerms] = useState<Set<string>>(new Set(group?.permissions ?? []))
  const [error, setError] = useState<string | null>(null)
  const [, startTransition] = useTransition()

  const createGroup = trpc.iam.permissionGroups.create.useMutation()
  const updateGroup = trpc.iam.permissionGroups.update.useMutation()
  const setPermissions = trpc.iam.permissionGroups.setPermissions.useMutation()

  const byResource = groupByResource(definitions)

  function togglePerm(key: string) {
    setSelectedPerms((prev) => {
      const next = new Set(prev)
      if (next.has(key)) next.delete(key)
      else next.add(key)
      return next
    })
  }

  function toggleResource(resource: string, defs: PermissionDef[]) {
    const keys = defs.map((d) => d.key)
    const allOn = keys.every((k) => selectedPerms.has(k))
    setSelectedPerms((prev) => {
      const next = new Set(prev)
      if (allOn) keys.forEach((k) => next.delete(k))
      else keys.forEach((k) => next.add(k))
      return next
    })
  }

  async function handleSave() {
    setError(null)
    const perms = [...selectedPerms]

    try {
      if (isEdit && group) {
        const updates: Parameters<typeof updateGroup.mutateAsync>[0] = { groupId: group.id }
        if (name !== group.name) updates.name = name
        if (description !== (group.description ?? "")) updates.description = description || null

        await updateGroup.mutateAsync(updates)
        await setPermissions.mutateAsync({ groupId: group.id, permissions: perms })
      } else {
        await createGroup.mutateAsync({
          name,
          description: description || undefined,
          permissions: perms,
        })
      }
      startTransition(() => {
        onSaved()
        onClose()
      })
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Something went wrong."
      setError(msg)
    }
  }

  const isPending = createGroup.isPending || updateGroup.isPending || setPermissions.isPending

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-slate-900/40 px-4 py-10">
      <div className="relative w-full max-w-2xl rounded-xl bg-white shadow-xl">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-slate-200 px-6 py-4">
          <h2 className="text-base font-semibold text-slate-900">
            {isEdit ? "Edit group" : "Create permission group"}
          </h2>
          <button
            type="button"
            onClick={onClose}
            className="rounded-md p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-600"
            aria-label="Close"
          >
            ✕
          </button>
        </div>

        {/* Body */}
        <div className="space-y-5 px-6 py-5">
          {error ? (
            <div className="rounded-md border border-red-200 bg-red-50 px-4 py-2 text-sm text-red-700">
              {error}
            </div>
          ) : null}

          <div>
            <label className="mb-1 block text-sm font-medium text-slate-700">Group name</label>
            <input
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="e.g. Dispatcher"
              className="block w-full rounded-md border border-slate-300 bg-slate-50 px-3 py-2 text-sm text-slate-900 placeholder:text-slate-400 focus:border-violet-600 focus:ring-2 focus:ring-violet-600/20 focus:outline-none"
            />
          </div>

          <div>
            <label className="mb-1 block text-sm font-medium text-slate-700">
              Description <span className="font-normal text-slate-400">(optional)</span>
            </label>
            <input
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="What is this group for?"
              className="block w-full rounded-md border border-slate-300 bg-slate-50 px-3 py-2 text-sm text-slate-900 placeholder:text-slate-400 focus:border-violet-600 focus:ring-2 focus:ring-violet-600/20 focus:outline-none"
            />
          </div>

          {/* Permission matrix */}
          <div>
            <p className="mb-3 text-sm font-medium text-slate-700">Permissions</p>
            <div className="max-h-80 space-y-4 overflow-y-auto rounded-lg border border-slate-200 p-4">
              {[...byResource.entries()].map(([resource, defs]) => {
                const keys = defs.map((d) => d.key)
                const allOn = keys.every((k) => selectedPerms.has(k))
                const someOn = keys.some((k) => selectedPerms.has(k))
                return (
                  <div key={resource}>
                    <button
                      type="button"
                      onClick={() => toggleResource(resource, defs)}
                      className="mb-2 flex w-full items-center gap-2 text-left"
                    >
                      <span
                        className={`flex h-4 w-4 flex-shrink-0 items-center justify-center rounded border text-xs ${allOn ? "border-violet-600 bg-violet-600 text-white" : someOn ? "border-violet-400 bg-violet-100 text-violet-600" : "border-slate-300 bg-white"}`}
                      >
                        {allOn ? "✓" : someOn ? "−" : ""}
                      </span>
                      <span className="text-xs font-semibold tracking-wide text-slate-600 uppercase">
                        {resource}
                      </span>
                    </button>
                    <div className="ml-6 grid grid-cols-2 gap-1">
                      {defs.map((def) => (
                        <button
                          key={def.key}
                          type="button"
                          onClick={() => togglePerm(def.key)}
                          className="flex items-center gap-2 rounded px-2 py-1 text-left hover:bg-slate-50"
                        >
                          <span
                            className={`flex h-3.5 w-3.5 flex-shrink-0 items-center justify-center rounded border text-[10px] ${selectedPerms.has(def.key) ? "border-violet-600 bg-violet-600 text-white" : "border-slate-300 bg-white"}`}
                          >
                            {selectedPerms.has(def.key) ? "✓" : ""}
                          </span>
                          <span className="text-xs text-slate-700">{def.action}</span>
                        </button>
                      ))}
                    </div>
                  </div>
                )
              })}
            </div>
          </div>
        </div>

        {/* Footer */}
        <div className="flex items-center justify-between border-t border-slate-200 px-6 py-4">
          <span className="text-xs text-slate-400">{selectedPerms.size} permissions selected</span>
          <div className="flex gap-3">
            <button
              type="button"
              onClick={onClose}
              className="rounded-md border border-slate-300 px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={handleSave}
              disabled={isPending || !name.trim()}
              className="rounded-md bg-slate-900 px-4 py-2 text-sm font-semibold text-white hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-50"
            >
              {isPending ? "Saving…" : isEdit ? "Save changes" : "Create group"}
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}

// ─── User permission drawer ───────────────────────────────────────────────────

interface UserDrawerProps {
  member: TeamMember
  allGroups: PermissionGroup[]
  definitions: PermissionDef[]
  onClose: () => void
  onSaved: () => void
}

function UserDrawer({ member, allGroups, definitions, onClose, onSaved }: UserDrawerProps) {
  const [activeTab, setActiveTab] = useState<"groups" | "overrides">("groups")
  const [error, setError] = useState<string | null>(null)
  const [, startTransition] = useTransition()

  const utils = trpc.useUtils()

  const assignGroup = trpc.iam.userPermissions.assignGroup.useMutation({
    onSuccess: () => {
      startTransition(() => {
        void utils.iam.team.list.invalidate()
        void utils.iam.userPermissions.listGroups.invalidate({ userId: member.id })
        onSaved()
      })
    },
    onError: (err) => setError(err.message),
  })

  const removeGroup = trpc.iam.userPermissions.removeGroup.useMutation({
    onSuccess: () => {
      startTransition(() => {
        void utils.iam.team.list.invalidate()
        void utils.iam.userPermissions.listGroups.invalidate({ userId: member.id })
        onSaved()
      })
    },
    onError: (err) => setError(err.message),
  })

  const setOverride = trpc.iam.userPermissions.setOverride.useMutation({
    onSuccess: () => {
      startTransition(() => {
        void utils.iam.userPermissions.listOverrides.invalidate({ userId: member.id })
        onSaved()
      })
    },
    onError: (err) => setError(err.message),
  })

  const removeOverride = trpc.iam.userPermissions.removeOverride.useMutation({
    onSuccess: () => {
      startTransition(() => {
        void utils.iam.userPermissions.listOverrides.invalidate({ userId: member.id })
        onSaved()
      })
    },
    onError: (err) => setError(err.message),
  })

  const { data: overrides, isLoading: overridesLoading } =
    trpc.iam.userPermissions.listOverrides.useQuery({ userId: member.id })

  const assignedGroupIds = new Set(member.groups.map((g) => g.id))

  function getOverrideType(key: string): "grant" | "deny" | null {
    const o = overrides?.find((o) => o.permissionKey === key)
    return o ? (o.overrideType as "grant" | "deny") : null
  }

  const byResource = groupByResource(definitions)

  return (
    <div className="fixed inset-0 z-50 flex justify-end bg-slate-900/30">
      <div className="flex h-full w-full max-w-lg flex-col bg-white shadow-2xl">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-slate-200 px-6 py-4">
          <div>
            <p className="text-base font-semibold text-slate-900">
              {member.firstName} {member.lastName}
            </p>
            <p className="text-xs text-slate-500">{member.email}</p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-md p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-600"
            aria-label="Close"
          >
            ✕
          </button>
        </div>

        {/* Tabs */}
        <div className="flex border-b border-slate-200">
          {(["groups", "overrides"] as const).map((tab) => (
            <button
              key={tab}
              type="button"
              onClick={() => setActiveTab(tab)}
              className={`px-5 py-3 text-sm font-medium capitalize ${activeTab === tab ? "border-b-2 border-violet-600 text-violet-700" : "text-slate-500 hover:text-slate-700"}`}
            >
              {tab}
            </button>
          ))}
        </div>

        {error ? (
          <div className="mx-4 mt-3 rounded-md border border-red-200 bg-red-50 px-4 py-2 text-sm text-red-700">
            {error}
          </div>
        ) : null}

        <div className="flex-1 overflow-y-auto">
          {/* Groups tab */}
          {activeTab === "groups" && (
            <div className="space-y-2 p-5">
              <p className="mb-3 text-xs font-semibold tracking-wide text-slate-400 uppercase">
                Permission groups
              </p>
              {allGroups.length === 0 ? (
                <p className="text-sm text-slate-400">No permission groups yet.</p>
              ) : (
                allGroups.map((group) => {
                  const assigned = assignedGroupIds.has(group.id)
                  const isPending = assignGroup.isPending || removeGroup.isPending
                  return (
                    <div
                      key={group.id}
                      className="flex items-center justify-between rounded-lg border border-slate-200 px-4 py-3"
                    >
                      <div>
                        <p className="text-sm font-medium text-slate-900">{group.name}</p>
                        {group.description ? (
                          <p className="mt-0.5 text-xs text-slate-400">{group.description}</p>
                        ) : null}
                        <p className="mt-0.5 text-xs text-slate-400">
                          {group.permissions.length} permissions
                        </p>
                      </div>
                      <button
                        type="button"
                        disabled={isPending}
                        onClick={() => {
                          setError(null)
                          if (assigned) {
                            removeGroup.mutate({ userId: member.id, groupId: group.id })
                          } else {
                            assignGroup.mutate({ userId: member.id, groupId: group.id })
                          }
                        }}
                        className={`rounded-md px-3 py-1.5 text-xs font-medium transition-colors ${assigned ? "border border-slate-200 text-slate-600 hover:border-red-200 hover:bg-red-50 hover:text-red-700" : "bg-violet-50 text-violet-700 hover:bg-violet-100"} disabled:opacity-50`}
                      >
                        {assigned ? "Remove" : "Assign"}
                      </button>
                    </div>
                  )
                })
              )}
            </div>
          )}

          {/* Overrides tab */}
          {activeTab === "overrides" && (
            <div className="p-5">
              <p className="mb-1 text-xs font-semibold tracking-wide text-slate-400 uppercase">
                Individual overrides
              </p>
              <p className="mb-4 text-xs text-slate-500">
                Grant or deny individual permissions on top of group memberships. Deny always wins.
              </p>

              {overridesLoading ? (
                <p className="text-sm text-slate-400">Loading…</p>
              ) : (
                <div className="space-y-4">
                  {[...byResource.entries()].map(([resource, defs]) => (
                    <div key={resource}>
                      <p className="mb-2 text-xs font-semibold tracking-wide text-slate-500 uppercase">
                        {resource}
                      </p>
                      <div className="space-y-1">
                        {defs.map((def) => {
                          const current = getOverrideType(def.key)
                          return (
                            <div
                              key={def.key}
                              className="flex items-center justify-between rounded-md px-3 py-1.5 hover:bg-slate-50"
                            >
                              <span className="text-xs text-slate-700">{def.key}</span>
                              <div className="flex gap-1">
                                {/* Grant button */}
                                <button
                                  type="button"
                                  title="Grant this permission (override)"
                                  onClick={() => {
                                    setError(null)
                                    if (current === "grant") {
                                      removeOverride.mutate({
                                        userId: member.id,
                                        permissionKey: def.key,
                                      })
                                    } else {
                                      setOverride.mutate({
                                        userId: member.id,
                                        permissionKey: def.key,
                                        overrideType: "grant",
                                      })
                                    }
                                  }}
                                  className={`rounded px-2 py-0.5 text-xs font-medium ${current === "grant" ? "bg-emerald-100 text-emerald-700 ring-1 ring-emerald-400" : "bg-slate-100 text-slate-500 hover:bg-emerald-50 hover:text-emerald-700"}`}
                                >
                                  ✓ Grant
                                </button>
                                {/* Deny button */}
                                <button
                                  type="button"
                                  title="Deny this permission (override)"
                                  onClick={() => {
                                    setError(null)
                                    if (current === "deny") {
                                      removeOverride.mutate({
                                        userId: member.id,
                                        permissionKey: def.key,
                                      })
                                    } else {
                                      setOverride.mutate({
                                        userId: member.id,
                                        permissionKey: def.key,
                                        overrideType: "deny",
                                      })
                                    }
                                  }}
                                  className={`rounded px-2 py-0.5 text-xs font-medium ${current === "deny" ? "bg-red-100 text-red-700 ring-1 ring-red-400" : "bg-slate-100 text-slate-500 hover:bg-red-50 hover:text-red-700"}`}
                                >
                                  ✕ Deny
                                </button>
                              </div>
                            </div>
                          )
                        })}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

// ─── Main component ───────────────────────────────────────────────────────────

export default function TeamManagement({ initialMembers, initialGroups, definitions }: Props) {
  const [activeSection, setActiveSection] = useState<"team" | "groups">("team")
  const [groupModal, setGroupModal] = useState<{ open: boolean; group?: PermissionGroup | null }>({
    open: false,
  })
  const [selectedMember, setSelectedMember] = useState<TeamMember | null>(null)
  const [deletingGroupId, setDeletingGroupId] = useState<string | null>(null)

  const utils = trpc.useUtils()

  const { data: members = initialMembers } = trpc.iam.team.list.useQuery(undefined, {
    initialData: initialMembers,
  })

  const { data: groups = initialGroups } = trpc.iam.permissionGroups.list.useQuery(undefined, {
    initialData: initialGroups,
  })

  const softDelete = trpc.iam.permissionGroups.softDelete.useMutation({
    onSuccess: () => {
      setDeletingGroupId(null)
      void utils.iam.permissionGroups.list.invalidate()
    },
  })

  function onSaved() {
    void utils.iam.team.list.invalidate()
    void utils.iam.permissionGroups.list.invalidate()
  }

  const officeMembers = members.filter((m) => m.role === "office")
  const ownerMembers = members.filter((m) => m.role === "owner")

  return (
    <>
      {/* Section tabs */}
      <div className="mb-6 flex w-fit gap-1 rounded-lg border border-slate-200 bg-white p-1">
        {(["team", "groups"] as const).map((tab) => (
          <button
            key={tab}
            type="button"
            onClick={() => setActiveSection(tab)}
            className={`rounded-md px-4 py-1.5 text-sm font-medium capitalize transition-colors ${activeSection === tab ? "bg-slate-900 text-white" : "text-slate-600 hover:bg-slate-50"}`}
          >
            {tab === "team" ? "Team members" : "Permission groups"}
          </button>
        ))}
      </div>

      {/* Team members section */}
      {activeSection === "team" && (
        <div>
          {/* Owner rows */}
          {ownerMembers.length > 0 && (
            <div className="mb-4">
              <p className="mb-2 text-xs font-semibold tracking-wide text-slate-400 uppercase">
                Owner
              </p>
              {ownerMembers.map((m) => (
                <div
                  key={m.id}
                  className="mb-2 flex items-center justify-between rounded-lg border border-slate-200 bg-white px-5 py-4"
                >
                  <div>
                    <p className="text-sm font-semibold text-slate-900">
                      {m.firstName} {m.lastName}
                    </p>
                    <p className="text-xs text-slate-400">{m.email}</p>
                  </div>
                  <span className="rounded-full bg-slate-100 px-2 py-0.5 text-xs font-medium text-slate-600">
                    Owner — unrestricted
                  </span>
                </div>
              ))}
            </div>
          )}

          {/* Office member rows */}
          <p className="mb-2 text-xs font-semibold tracking-wide text-slate-400 uppercase">
            Office staff
          </p>
          {officeMembers.length === 0 ? (
            <div className="rounded-lg border border-dashed border-slate-300 bg-white px-6 py-8 text-center">
              <p className="text-sm text-slate-500">No office staff yet.</p>
              <p className="mt-1 text-xs text-slate-400">
                Invite team members from Settings → Invitations.
              </p>
            </div>
          ) : (
            <div className="overflow-hidden rounded-lg border border-slate-200 bg-white">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-slate-100 bg-slate-50">
                    <th className="px-5 py-3 text-left text-xs font-semibold tracking-wide text-slate-400 uppercase">
                      Name
                    </th>
                    <th className="px-5 py-3 text-left text-xs font-semibold tracking-wide text-slate-400 uppercase">
                      Groups
                    </th>
                    <th className="px-5 py-3 text-left text-xs font-semibold tracking-wide text-slate-400 uppercase">
                      Overrides
                    </th>
                    <th className="px-5 py-3 text-left text-xs font-semibold tracking-wide text-slate-400 uppercase">
                      Status
                    </th>
                    <th className="px-5 py-3" />
                  </tr>
                </thead>
                <tbody>
                  {officeMembers.map((m, idx) => (
                    <tr key={m.id} className={idx > 0 ? "border-t border-slate-100" : ""}>
                      <td className="px-5 py-4">
                        <p className="font-medium text-slate-900">
                          {m.firstName} {m.lastName}
                        </p>
                        <p className="text-xs text-slate-400">{m.email}</p>
                      </td>
                      <td className="px-5 py-4">
                        <div className="flex flex-wrap gap-1">
                          {m.groups.length === 0 ? (
                            <span className="text-xs text-slate-400">None</span>
                          ) : (
                            m.groups.map((g) => (
                              <span
                                key={g.id}
                                className="rounded-full bg-violet-50 px-2 py-0.5 text-xs font-medium text-violet-700"
                              >
                                {g.name}
                              </span>
                            ))
                          )}
                        </div>
                      </td>
                      <td className="px-5 py-4">
                        <span className="text-xs text-slate-500">
                          {m.overrideCount > 0
                            ? `${m.overrideCount} override${m.overrideCount !== 1 ? "s" : ""}`
                            : "—"}
                        </span>
                      </td>
                      <td className="px-5 py-4">
                        <span
                          className={`inline-flex rounded-full px-2 py-0.5 text-xs font-medium ${m.isActive ? "bg-emerald-50 text-emerald-700" : "bg-slate-100 text-slate-500"}`}
                        >
                          {m.isActive ? "Active" : "Inactive"}
                        </span>
                      </td>
                      <td className="px-5 py-4 text-right">
                        <button
                          type="button"
                          onClick={() => setSelectedMember(m)}
                          className="rounded-md border border-slate-200 px-3 py-1.5 text-xs font-medium text-slate-600 hover:border-violet-200 hover:bg-violet-50 hover:text-violet-700"
                        >
                          Manage
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {/* Permission groups section */}
      {activeSection === "groups" && (
        <div>
          <div className="mb-4 flex items-center justify-between">
            <p className="text-sm text-slate-500">
              {groups.length} group{groups.length !== 1 ? "s" : ""}
            </p>
            <button
              type="button"
              onClick={() => setGroupModal({ open: true, group: null })}
              className="rounded-md bg-slate-900 px-4 py-2 text-sm font-semibold text-white hover:bg-slate-800"
            >
              Create group
            </button>
          </div>

          {groups.length === 0 ? (
            <div className="rounded-lg border border-dashed border-slate-300 bg-white px-6 py-10 text-center">
              <p className="text-sm text-slate-500">No permission groups yet.</p>
            </div>
          ) : (
            <div className="space-y-3">
              {groups.map((group) => (
                <div
                  key={group.id}
                  className="rounded-lg border border-slate-200 bg-white px-5 py-4"
                >
                  <div className="flex items-start justify-between gap-4">
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2">
                        <p className="font-medium text-slate-900">{group.name}</p>
                        {group.isDefault ? (
                          <span className="rounded-full bg-slate-100 px-2 py-0.5 text-xs text-slate-500">
                            Default
                          </span>
                        ) : null}
                      </div>
                      {group.description ? (
                        <p className="mt-0.5 text-xs text-slate-400">{group.description}</p>
                      ) : null}
                      <p className="mt-1.5 text-xs text-slate-400">
                        {group.permissions.length} permission
                        {group.permissions.length !== 1 ? "s" : ""} · {group.memberCount} member
                        {group.memberCount !== 1 ? "s" : ""}
                      </p>
                    </div>
                    <div className="flex gap-2">
                      <button
                        type="button"
                        onClick={() => setGroupModal({ open: true, group })}
                        className="rounded-md border border-slate-200 px-3 py-1.5 text-xs font-medium text-slate-600 hover:bg-slate-50"
                      >
                        Edit
                      </button>
                      {!group.isDefault && (
                        <button
                          type="button"
                          disabled={softDelete.isPending && deletingGroupId === group.id}
                          onClick={() => {
                            if (group.memberCount > 0) {
                              alert(
                                `This group has ${group.memberCount} member${group.memberCount !== 1 ? "s" : ""}. Remove all members before deleting.`,
                              )
                              return
                            }
                            setDeletingGroupId(group.id)
                            softDelete.mutate({ groupId: group.id })
                          }}
                          className="rounded-md border border-slate-200 px-3 py-1.5 text-xs font-medium text-red-600 hover:border-red-200 hover:bg-red-50 disabled:opacity-50"
                        >
                          Delete
                        </button>
                      )}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Group modal */}
      {groupModal.open && (
        <GroupModal
          group={groupModal.group}
          definitions={definitions}
          onClose={() => setGroupModal({ open: false })}
          onSaved={onSaved}
        />
      )}

      {/* User permission drawer */}
      {selectedMember && (
        <UserDrawer
          member={selectedMember}
          allGroups={groups}
          definitions={definitions}
          onClose={() => setSelectedMember(null)}
          onSaved={() => {
            onSaved()
            // Refresh the selected member's data from the updated list
            const refreshed = members.find((m) => m.id === selectedMember.id)
            if (refreshed) setSelectedMember(refreshed)
          }}
        />
      )}
    </>
  )
}
