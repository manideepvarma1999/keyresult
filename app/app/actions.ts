"use server";

import { redirect } from "next/navigation";
import { guard, orgFromForm, type ActionState } from "@/lib/actions";
import { requireUser } from "@/lib/auth/current";
import { getDb } from "@/lib/db";
import { createCheckout, createPortal } from "@/lib/services/billing";
import { UserError } from "@/lib/services/errors";
import { acceptInvite, changeRole, createInvite, removeMember, revokeInvite } from "@/lib/services/members";
import { addKeyResult, checkIn, createObjective, deleteKeyResult, deleteObjective, setObjectiveStatus } from "@/lib/services/okrs";
import { createOrganization } from "@/lib/services/orgs";
import { revalidatePath } from "next/cache";
import {
  checkInSchema,
  firstError,
  formObject,
  inviteSchema,
  keyResultSchema,
  objectiveSchema,
  orgSchema,
  role,
  status,
  uuid,
} from "@/lib/validation";
import type { z } from "zod";

function parse<T extends z.ZodType>(schema: T, form: FormData): z.infer<T> {
  const result = schema.safeParse(formObject(form));
  if (!result.success) throw new UserError(firstError(result.error));
  return result.data;
}

function field<T extends z.ZodType>(schema: T, form: FormData, name: string): z.infer<T> {
  const result = schema.safeParse(form.get(name));
  if (!result.success) throw new UserError("Invalid request.");
  return result.data;
}

export async function createOrgAction(_: ActionState, form: FormData): Promise<ActionState> {
  let slug = "";
  const result = await guard(async () => {
    const user = await requireUser();
    const input = parse(orgSchema, form);
    slug = (await createOrganization(getDb(), user.id, input)).slug;
  });
  if (result?.error) return result;
  redirect(`/app/${slug}`);
}

export async function createObjectiveAction(_: ActionState, form: FormData): Promise<ActionState> {
  return guard(async () => {
    const ctx = await orgFromForm(form);
    await createObjective(getDb(), ctx, parse(objectiveSchema, form));
    revalidatePath(`/app/${ctx.slug}`);
    return { message: "Objective created." };
  });
}

export async function setStatusAction(_: ActionState, form: FormData): Promise<ActionState> {
  return guard(async () => {
    const ctx = await orgFromForm(form);
    const id = field(uuid, form, "objectiveId");
    await setObjectiveStatus(getDb(), ctx, id, field(status, form, "status"));
    revalidatePath(`/app/${ctx.slug}`, "layout");
  });
}

export async function deleteObjectiveAction(form: FormData): Promise<void> {
  const ctx = await orgFromForm(form);
  await deleteObjective(getDb(), ctx, field(uuid, form, "objectiveId"));
  revalidatePath(`/app/${ctx.slug}`);
  redirect(`/app/${ctx.slug}`);
}

export async function addKeyResultAction(_: ActionState, form: FormData): Promise<ActionState> {
  return guard(async () => {
    const ctx = await orgFromForm(form);
    const input = parse(keyResultSchema, form);
    await addKeyResult(getDb(), ctx, input);
    revalidatePath(`/app/${ctx.slug}`, "layout");
    return { message: "Key result added." };
  });
}

export async function checkInAction(_: ActionState, form: FormData): Promise<ActionState> {
  return guard(async () => {
    const ctx = await orgFromForm(form);
    await checkIn(getDb(), ctx, parse(checkInSchema, form));
    revalidatePath(`/app/${ctx.slug}`, "layout");
    return { message: "Progress updated." };
  });
}

export async function deleteKeyResultAction(form: FormData): Promise<void> {
  const ctx = await orgFromForm(form);
  await deleteKeyResult(getDb(), ctx, field(uuid, form, "keyResultId"));
  revalidatePath(`/app/${ctx.slug}`, "layout");
}

export async function inviteAction(_: ActionState, form: FormData): Promise<ActionState> {
  return guard(async () => {
    const ctx = await orgFromForm(form);
    const input = parse(inviteSchema, form);
    const token = await createInvite(getDb(), ctx, input);
    revalidatePath(`/app/${ctx.slug}/members`);
    const base = (process.env.APP_URL ?? "http://localhost:3000").replace(/\/$/, "");
    // Shown once to the inviter; there is no email sender in this demo.
    return { message: `Invitation created for ${input.email}. Send them this link (valid 7 days):`, link: `${base}/invite/${token}` };
  });
}

export async function revokeInviteAction(form: FormData): Promise<void> {
  const ctx = await orgFromForm(form);
  await guard(() => revokeInvite(getDb(), ctx, field(uuid, form, "inviteId")));
  revalidatePath(`/app/${ctx.slug}/members`);
}

export async function changeRoleAction(_: ActionState, form: FormData): Promise<ActionState> {
  return guard(async () => {
    const ctx = await orgFromForm(form);
    await changeRole(getDb(), ctx, field(uuid, form, "userId"), field(role, form, "role"));
    revalidatePath(`/app/${ctx.slug}/members`);
    return { message: "Role updated." };
  });
}

export async function removeMemberAction(_: ActionState, form: FormData): Promise<ActionState> {
  const ctx = await orgFromForm(form);
  const userId = field(uuid, form, "userId");
  const result = await guard(() => removeMember(getDb(), ctx, userId));
  if (result?.error) return result;
  if (userId === ctx.userId) redirect("/app");
  revalidatePath(`/app/${ctx.slug}/members`);
  return { message: "Member removed." };
}

export async function acceptInviteAction(_: ActionState, form: FormData): Promise<ActionState> {
  let slug = "";
  const result = await guard(async () => {
    const user = await requireUser();
    const token = form.get("token");
    if (typeof token !== "string" || !/^[A-Za-z0-9_-]{43}$/.test(token)) throw new UserError("This invitation is invalid.");
    slug = await acceptInvite(getDb(), user, token);
  });
  if (result?.error) return result;
  redirect(`/app/${slug}`);
}

export async function checkoutAction(_: ActionState, form: FormData): Promise<ActionState> {
  let url = "";
  const result = await guard(async () => {
    const ctx = await orgFromForm(form);
    const user = await requireUser();
    url = await createCheckout(getDb(), ctx, user.email);
  });
  if (result?.error) return result;
  redirect(url);
}

export async function portalAction(_: ActionState, form: FormData): Promise<ActionState> {
  let url = "";
  const result = await guard(async () => {
    url = await createPortal(await orgFromForm(form));
  });
  if (result?.error) return result;
  redirect(url);
}
