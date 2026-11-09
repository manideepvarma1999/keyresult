export type Role = "owner" | "admin" | "member";

const RANK: Record<Role, number> = { member: 1, admin: 2, owner: 3 };

export function hasRole(role: Role, minimum: Role): boolean {
  return RANK[role] >= RANK[minimum];
}

/** Which roles `actor` may assign to someone else. Only owners create owners or admins. */
export function assignableRoles(actor: Role): Role[] {
  if (actor === "owner") return ["owner", "admin", "member"];
  if (actor === "admin") return ["member"];
  return [];
}

/** Whether `actor` may change or remove a member who currently has `target` role. */
export function canManageMember(actor: Role, target: Role): boolean {
  if (actor === "owner") return true;
  return actor === "admin" && target === "member";
}

export const PLAN_LIMITS = {
  free: { members: 5, objectivesPerQuarter: 10 },
  pro: { members: Infinity, objectivesPerQuarter: Infinity },
} as const;

export type Plan = keyof typeof PLAN_LIMITS;
