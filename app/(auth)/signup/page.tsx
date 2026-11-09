import type { Metadata } from "next";
import Link from "next/link";
import { ActionForm } from "@/components/ActionForm";
import { Field, Input } from "@/components/ui";
import { safeNext } from "@/lib/auth/current";
import { signupAction } from "../actions";

export const metadata: Metadata = { title: "Sign up" };

export default async function SignupPage({ searchParams }: PageProps<"/signup">) {
  const next = safeNext((await searchParams).next);
  return (
    <>
      <h1 className="mb-5 text-xl font-semibold">Create your account</h1>
      <ActionForm action={signupAction} submitLabel="Create account" hidden={{ next }} className="space-y-4">
        <Field label="Name">
          <Input name="name" autoComplete="name" required maxLength={100} />
        </Field>
        <Field label="Email">
          <Input name="email" type="email" autoComplete="email" required maxLength={254} />
        </Field>
        <Field label="Password" hint="At least 10 characters. A passphrase works well.">
          <Input name="password" type="password" autoComplete="new-password" required minLength={10} maxLength={200} />
        </Field>
      </ActionForm>
      <p className="mt-5 text-sm text-zinc-600 dark:text-zinc-400">
        Already have an account?{" "}
        <Link href={`/login?next=${encodeURIComponent(next)}`} className="font-medium text-indigo-600">
          Log in
        </Link>
      </p>
    </>
  );
}
