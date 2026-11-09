import Link from "next/link";
import { getCurrentUser } from "@/lib/auth/current";

const FEATURES = [
  ["Objectives and key results", "Set quarterly goals with measurable key results and see progress roll up automatically."],
  ["Weekly check-ins", "Anyone on the team records progress with a note, so status is never a meeting."],
  ["Built for teams", "Workspaces with owner, admin and member roles, invite links, and an audit log."],
  ["Isolated by design", "Every workspace's data is separated by Postgres row-level security, not just app code."],
] as const;

export default async function Home() {
  const user = await getCurrentUser();
  return (
    <main className="mx-auto w-full max-w-5xl px-6 pb-24">
      <header className="flex items-center justify-between py-6">
        <span className="text-lg font-semibold tracking-tight">
          Key<span className="text-indigo-600">Result</span>
        </span>
        <nav className="flex gap-4 text-sm">
          {user ? (
            <Link href="/app" className="font-medium text-indigo-600">Open app →</Link>
          ) : (
            <>
              <Link href="/login">Log in</Link>
              <Link href="/signup" className="font-medium text-indigo-600">Sign up</Link>
            </>
          )}
        </nav>
      </header>

      <section className="py-20 text-center">
        <h1 className="mx-auto max-w-3xl text-4xl font-semibold tracking-tight sm:text-5xl">
          Goals your whole team can see, <span className="text-indigo-600">and actually hit.</span>
        </h1>
        <p className="mx-auto mt-5 max-w-xl text-zinc-600 dark:text-zinc-400">
          KeyResult keeps objectives, key results and weekly progress in one place, so everyone knows what matters this
          quarter and how it&apos;s going.
        </p>
        <div className="mt-8 flex justify-center gap-3">
          <Link href={user ? "/app" : "/signup"} className="rounded-lg bg-indigo-600 px-5 py-3 font-medium text-white hover:bg-indigo-500">
            {user ? "Go to your workspace" : "Create a free workspace"}
          </Link>
        </div>
      </section>

      <section className="grid gap-4 sm:grid-cols-2">
        {FEATURES.map(([title, body]) => (
          <div key={title} className="rounded-2xl border border-zinc-200 bg-white p-6 dark:border-zinc-800 dark:bg-zinc-900">
            <h2 className="font-semibold">{title}</h2>
            <p className="mt-2 text-sm text-zinc-600 dark:text-zinc-400">{body}</p>
          </div>
        ))}
      </section>
    </main>
  );
}
