import type { Metadata } from "next";
import Link from "next/link";
import { ActionForm } from "@/components/ActionForm";
import { Field, Input } from "@/components/ui";
import { safeNext } from "@/lib/auth/current";
import { loginAction } from "../actions";

export const metadata: Metadata = { title: "Log in" };

export default async function LoginPage({ searchParams }: PageProps<"/login">) {
  const next = safeNext((await searchParams).next);
  return (
    <>
      <h1 className="mb-5 text-xl font-semibold">Log in</h1>
      <ActionForm action={loginAction} submitLabel="Log in" hidden={{ next }} className="space-y-4">
        <Field label="Email">
          <Input name="email" type="email" autoComplete="email" required maxLength={254} />
        </Field>
        <Field label="Password">
          <Input name="password" type="password" autoComplete="current-password" required maxLength={200} />
        </Field>
      </ActionForm>
      <p className="mt-5 text-sm text-zinc-600 dark:text-zinc-400">
        New here?{" "}
        <Link href={`/signup?next=${encodeURIComponent(next)}`} className="font-medium text-indigo-600">
          Create an account
        </Link>
      </p>
    </>
  );
}
