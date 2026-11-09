import type { Metadata } from "next";
import { changeRoleAction, inviteAction, removeMemberAction, revokeInviteAction } from "@/app/app/actions";
import { ActionForm } from "@/components/ActionForm";
import { Card, Field, Input, Select } from "@/components/ui";
import { orgFromSlug } from "@/lib/actions";
import { getDb } from "@/lib/db";
import { assignableRoles, canManageMember, hasRole, PLAN_LIMITS } from "@/lib/permissions";
import { listMembers } from "@/lib/services/members";

export const metadata: Metadata = { title: "Members" };

export default async function MembersPage({ params }: PageProps<"/app/[org]/members">) {
  const { org } = await params;
  const ctx = await orgFromSlug(org);
  const { members, invites } = await listMembers(getDb(), ctx);
  const isAdmin = hasRole(ctx.role, "admin");
  const limit = PLAN_LIMITS[ctx.plan].members;
  const inviteRoles = assignableRoles(ctx.role).filter((r) => r !== "owner");

  return (
    <div className="grid gap-8 lg:grid-cols-[1fr_340px]">
      <section className="space-y-6">
        <Card>
          <h2 className="mb-4 font-semibold">
            Members <span className="text-sm font-normal text-zinc-500">({members.length}{Number.isFinite(limit) ? ` of ${limit} incl. invites` : ""})</span>
          </h2>
          <ul className="divide-y divide-zinc-200 dark:divide-zinc-800">
            {members.map((m) => {
              const self = m.user_id === ctx.userId;
              const manageable = !self && canManageMember(ctx.role, m.role);
              return (
                <li key={m.user_id} className="flex flex-wrap items-center gap-3 py-3">
                  <div className="min-w-0 flex-1">
                    <p className="font-medium">{m.name}{self && <span className="text-zinc-500"> (you)</span>}</p>
                    <p className="truncate text-sm text-zinc-500">{m.email}</p>
                  </div>
                  {manageable ? (
                    <ActionForm action={changeRoleAction} submitLabel="Save" hidden={{ org: ctx.slug, userId: m.user_id }} variant="secondary" className="flex items-center gap-2">
                      <Select name="role" defaultValue={m.role} aria-label={`Role for ${m.name}`} className="w-28">
                        {assignableRoles(ctx.role).map((r) => (
                          <option key={r} value={r}>{r}</option>
                        ))}
                      </Select>
                    </ActionForm>
                  ) : (
                    <span className="rounded-full bg-zinc-100 px-2 py-0.5 text-xs capitalize dark:bg-zinc-800">{m.role}</span>
                  )}
                  {(manageable || self) && (
                    <ActionForm action={removeMemberAction} submitLabel={self ? "Leave" : "Remove"} hidden={{ org: ctx.slug, userId: m.user_id }} variant="danger" className="flex" />
                  )}
                </li>
              );
            })}
          </ul>
        </Card>

        {isAdmin && invites.length > 0 && (
          <Card>
            <h2 className="mb-4 font-semibold">Pending invitations</h2>
            <ul className="divide-y divide-zinc-200 dark:divide-zinc-800">
              {invites.map((i) => (
                <li key={i.id} className="flex items-center gap-3 py-3 text-sm">
                  <span className="flex-1 truncate">{i.email}</span>
                  <span className="capitalize text-zinc-500">{i.role}</span>
                  <form action={revokeInviteAction}>
                    <input type="hidden" name="org" value={ctx.slug} />
                    <input type="hidden" name="inviteId" value={i.id} />
                    <button className="text-xs text-zinc-500 hover:text-red-600">Revoke</button>
                  </form>
                </li>
              ))}
            </ul>
          </Card>
        )}
      </section>

      {isAdmin && (
        <Card className="h-fit">
          <h2 className="mb-4 font-semibold">Invite someone</h2>
          <ActionForm action={inviteAction} submitLabel="Create invite link" hidden={{ org: ctx.slug }}>
            <Field label="Email" hint="They must sign in with this email to accept.">
              <Input name="email" type="email" required maxLength={254} />
            </Field>
            <Field label="Role">
              <Select name="role" defaultValue="member">
                {inviteRoles.map((r) => (
                  <option key={r} value={r}>{r}</option>
                ))}
              </Select>
            </Field>
          </ActionForm>
        </Card>
      )}
    </div>
  );
}
