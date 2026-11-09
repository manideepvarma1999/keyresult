import Link from "next/link";
import type { ReactNode } from "react";
import { logoutAction, logoutEverywhereAction } from "@/app/(auth)/actions";
import { buttonClass } from "@/components/ui";
import { requireUser } from "@/lib/auth/current";

export default async function AppLayout({ children }: { children: ReactNode }) {
  const user = await requireUser();
  return (
    <div className="flex flex-1 flex-col">
      <header className="border-b border-zinc-200 bg-white dark:border-zinc-800 dark:bg-zinc-900">
        <div className="mx-auto flex w-full max-w-6xl items-center justify-between gap-4 px-6 py-3">
          <Link href="/app" className="font-semibold tracking-tight">
            Key<span className="text-indigo-600">Result</span>
          </Link>
          <div className="flex items-center gap-3 text-sm">
            <span className="hidden text-zinc-600 sm:inline dark:text-zinc-400">{user.name}</span>
            <form action={logoutAction}>
              <button className={buttonClass("secondary")}>Log out</button>
            </form>
            <form action={logoutEverywhereAction}>
              <button className="text-xs text-zinc-500 underline-offset-2 hover:underline" title="Ends every session on every device">
                Log out everywhere
              </button>
            </form>
          </div>
        </div>
      </header>
      <div className="mx-auto w-full max-w-6xl flex-1 px-6 py-8">{children}</div>
    </div>
  );
}
