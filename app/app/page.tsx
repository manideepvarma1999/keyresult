import type { Metadata } from "next";
import Link from "next/link";
import { ActionForm } from "@/components/ActionForm";
import { Card, Field, Input } from "@/components/ui";
import { requireUser } from "@/lib/auth/current";
import { getDb } from "@/lib/db";
import { listMyOrganizations } from "@/lib/services/orgs";
import { createOrgAction } from "./actions";

export const metadata: Metadata = { title: "Workspaces" };

export default async function WorkspacesPage() {
  const user = await requireUser();
  const orgs = await listMyOrganizations(getDb(), user.id);

  return (
    <div className="grid gap-8 lg:grid-cols-[1fr_380px]">
      <section>
        <h1 className="text-2xl font-semibold tracking-tight">Your workspaces</h1>
        {orgs.length === 0 ? (
          <p className="mt-4 text-zinc-600 dark:text-zinc-400">You aren&apos;t in a workspace yet. Create one, or open an invite link from a teammate.</p>
        ) : (
          <ul className="mt-4 grid gap-3 sm:grid-cols-2">
            {orgs.map((org) => (
              <li key={org.id}>
                <Link
                  href={`/app/${org.slug}`}
                  className="block rounded-2xl border border-zinc-200 bg-white p-5 transition hover:border-indigo-400 dark:border-zinc-800 dark:bg-zinc-900"
                >
                  <span className="font-semibold">{org.name}</span>
                  <span className="mt-1 block text-sm capitalize text-zinc-500">{org.role}</span>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </section>
      <Card>
        <h2 className="mb-4 font-semibold">New workspace</h2>
        <ActionForm action={createOrgAction} submitLabel="Create workspace">
          <Field label="Name">
            <Input name="name" required maxLength={80} placeholder="Acme Inc." />
          </Field>
          <Field label="URL" hint="3-40 lowercase letters, numbers or dashes">
            <Input name="slug" required pattern="[a-z0-9][a-z0-9\-]{1,38}[a-z0-9]" maxLength={40} placeholder="acme" />
          </Field>
        </ActionForm>
      </Card>
    </div>
  );
}
