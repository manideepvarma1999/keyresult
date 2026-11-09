import Link from "next/link";
import { orgFromSlug } from "@/lib/actions";
import { hasRole } from "@/lib/permissions";
import { NavLink } from "./NavLink";

export default async function OrgLayout({ children, params }: LayoutProps<"/app/[org]">) {
  const { org } = await params;
  const ctx = await orgFromSlug(org);
  const base = `/app/${ctx.slug}`;
  const tabs = [
    { href: base, label: "Objectives" },
    { href: `${base}/members`, label: "Members" },
    ...(hasRole(ctx.role, "admin") ? [{ href: `${base}/audit`, label: "Audit log" }] : []),
    ...(ctx.role === "owner" ? [{ href: `${base}/billing`, label: "Billing" }] : []),
  ];

  return (
    <div>
      <div className="mb-6 flex flex-wrap items-end justify-between gap-4">
        <div>
          <Link href="/app" className="text-sm text-zinc-500 hover:text-zinc-800 dark:hover:text-zinc-200">
            ← All workspaces
          </Link>
          <h1 className="mt-1 text-2xl font-semibold tracking-tight">
            {ctx.orgName}
            <span className="ml-3 rounded-full bg-indigo-100 px-2 py-0.5 align-middle text-xs font-medium uppercase text-indigo-700 dark:bg-indigo-950 dark:text-indigo-300">
              {ctx.plan}
            </span>
          </h1>
        </div>
        <nav aria-label="Workspace" className="flex gap-1 rounded-xl bg-zinc-200/60 p-1 text-sm dark:bg-zinc-800/60">
          {tabs.map((tab) => (
            <NavLink key={tab.href} href={tab.href} exact={tab.href === base}>
              {tab.label}
            </NavLink>
          ))}
        </nav>
      </div>
      {children}
    </div>
  );
}
