"use client";

import { useActionState, useEffect, useRef, type ReactNode } from "react";
import type { ActionState } from "@/lib/actions";
import { buttonClass } from "./ui";

type Action = (state: ActionState, form: FormData) => Promise<ActionState>;

export function ActionForm({
  action,
  submitLabel,
  hidden = {},
  children,
  className = "space-y-3",
  resetOnSuccess = false,
  variant = "primary",
}: {
  action: Action;
  submitLabel: string;
  hidden?: Record<string, string>;
  children?: ReactNode;
  className?: string;
  resetOnSuccess?: boolean;
  variant?: "primary" | "secondary" | "danger";
}) {
  const [state, formAction, pending] = useActionState(action, undefined);
  const formRef = useRef<HTMLFormElement>(null);

  useEffect(() => {
    if (resetOnSuccess && state?.message && !state.error) formRef.current?.reset();
  }, [state, resetOnSuccess]);

  return (
    <form ref={formRef} action={formAction} className={className}>
      {Object.entries(hidden).map(([name, value]) => (
        <input key={name} type="hidden" name={name} value={value} />
      ))}
      {children}
      <div className="flex flex-wrap items-center gap-3">
        <button type="submit" disabled={pending} className={buttonClass(variant)}>
          {pending ? "Working…" : submitLabel}
        </button>
        <div aria-live="polite" className="text-sm">
          {state?.error && <p className="text-red-600 dark:text-red-400">{state.error}</p>}
          {state?.message && !state.error && <p className="text-emerald-700 dark:text-emerald-400">{state.message}</p>}
        </div>
      </div>
      {state?.link && (
        <input
          readOnly
          value={state.link}
          aria-label="Invitation link"
          onFocus={(e) => e.currentTarget.select()}
          className="w-full rounded-lg border border-zinc-300 bg-zinc-50 px-3 py-2 font-mono text-xs dark:border-zinc-700 dark:bg-zinc-900"
        />
      )}
    </form>
  );
}
