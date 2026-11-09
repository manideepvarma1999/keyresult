import type { Metadata } from "next";
import Link from "next/link";
import { acceptInviteAction } from "@/app/app/actions";
import { ActionForm } from "@/components/ActionForm";
import { getCurrentUser } from "@/lib/auth/current";
import { getDb } from "@/lib/db";
import { previewInvite } from "@/lib/services/members";

export const metadata: Metadata = { title: "Invitation", referrer: "no-referrer" };

export default async function InvitePage({ params }: PageProps<"/invite/[token]">) {
  const { token } = await params;
  const valid = /^[A-Za-z0-9_-]{43}$/.test(token);
  const invite = valid ? await previewInvite(getDb(), token) : null;
  const user = await getCurrentUser();
  const here = `/invite/${token}`;

  return (
    <main className="flex flex-1 items-center justify-center px-6 py-16">
      <div className="w-full max-w-md rounded-2xl border border-zinc-200 bg-white p-6 text-center dark:border-zinc-800 dark:bg-zinc-900">
        {!invite || !invite.valid ? (
          <>
            <h1 className="text-xl font-semibold">This invitation isn&apos;t valid</h1>
            <p className="mt-2 text-sm text-zinc-600 dark:text-zinc-400">It may have expired, been revoked, or already been used. Ask for a new link.</p>
          </>
        ) : (
          <>
            <h1 className="text-xl font-semibold">Join {invite.orgName}</h1>
            <p className="mt-2 text-sm text-zinc-600 dark:text-zinc-400">This invitation is for {invite.email}.</p>
            <div className="mt-6 flex justify-center">
              {user ? (
                <ActionForm action={acceptInviteAction} submitLabel={`Join as ${user.email}`} hidden={{ token }} className="space-y-3" />
              ) : (
                <div className="flex gap-3">
                  <Link href={`/login?next=${encodeURIComponent(here)}`} className="rounded-lg border border-zinc-300 px-4 py-2 text-sm dark:border-zinc-700">Log in</Link>
                  <Link href={`/signup?next=${encodeURIComponent(here)}`} className="rounded-lg bg-indigo-600 px-4 py-2 text-sm text-white">Create account</Link>
                </div>
              )}
            </div>
          </>
        )}
      </div>
    </main>
  );
}
