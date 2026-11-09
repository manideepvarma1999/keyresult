import { z } from "zod";

const trimmed = (min: number, max: number) => z.string().trim().min(min).max(max);

export const email = z.string().trim().toLowerCase().max(254).pipe(z.email());

// Length is the main defence; 12+ characters and a breached-password check would be the next step.
export const password = z.string().min(10, "Use at least 10 characters").max(200);

export const signupSchema = z.object({
  name: trimmed(1, 100),
  email,
  password,
});

export const loginSchema = z.object({
  email,
  password: z.string().min(1).max(200),
});

export const slug = z
  .string()
  .trim()
  .toLowerCase()
  .regex(/^[a-z0-9][a-z0-9-]{1,38}[a-z0-9]$/, "3-40 lowercase letters, numbers or dashes");

export const orgSchema = z.object({ name: trimmed(1, 80), slug });

export const uuid = z.uuid();
export const quarter = z.string().regex(/^\d{4}-Q[1-4]$/);
export const status = z.enum(["on_track", "at_risk", "off_track", "done"]);
export const role = z.enum(["owner", "admin", "member"]);

const number = z.coerce.number().finite().gt(-1e12).lt(1e12);

export const objectiveSchema = z.object({
  title: trimmed(1, 200),
  description: z.string().trim().max(2000).default(""),
  quarter,
});

export const keyResultSchema = z
  .object({
    objectiveId: uuid,
    title: trimmed(1, 200),
    startValue: number,
    targetValue: number,
    unit: z.string().trim().max(20).default(""),
  })
  .refine((v) => v.startValue !== v.targetValue, { message: "Target must differ from start", path: ["targetValue"] });

export const checkInSchema = z.object({
  keyResultId: uuid,
  value: number,
  note: z.string().trim().max(1000).default(""),
});

export const inviteSchema = z.object({ email, role: z.enum(["admin", "member"]) });

/** Pull a FormData into a plain object for zod. Only string fields are used. */
export function formObject(form: FormData): Record<string, string> {
  const out: Record<string, string> = {};
  for (const [key, value] of form.entries()) if (typeof value === "string") out[key] = value;
  return out;
}

export function firstError(error: z.ZodError): string {
  const issue = error.issues[0];
  const field = issue?.path.join(".");
  return issue ? (field ? `${field}: ${issue.message}` : issue.message) : "Invalid input";
}
