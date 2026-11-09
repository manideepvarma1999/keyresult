import Stripe from "stripe";
import { afterAll, describe, expect, it } from "vitest";
import { currentQuarter, objectiveProgress, progress, shiftQuarter } from "@/lib/okr";
import { applyBillingEvent, verifyWebhook } from "@/lib/services/billing";
import { resolveOrg } from "@/lib/services/orgs";
import { signupSchema } from "@/lib/validation";
import { connect, makeOrg, makeUser } from "./helpers";

const db = connect();
afterAll(() => db.end());

const SECRET = "whsec_test_" + "a".repeat(32);

function signed(event: object) {
  const payload = JSON.stringify(event);
  const header = Stripe.webhooks.generateTestHeaderString({ payload, secret: SECRET });
  return { payload, header };
}

describe("stripe webhooks", () => {
  it("accepts only correctly signed payloads", () => {
    const { payload, header } = signed({ id: "evt_1", type: "ping", data: { object: {} } });
    expect(verifyWebhook(payload, header, SECRET).id).toBe("evt_1");
    expect(() => verifyWebhook(payload, header, "whsec_other")).toThrow();
    expect(() => verifyWebhook(payload.replace("evt_1", "evt_2"), header, SECRET)).toThrow();
    expect(() => verifyWebhook(payload, null, SECRET)).toThrow(/Missing/);
  });

  it("upgrades on checkout and downgrades when the subscription ends", async () => {
    const owner = await makeUser(db);
    const org = await makeOrg(db, owner.id);
    const completed = { type: "checkout.session.completed", data: { object: { metadata: { org_id: org.orgId }, payment_status: "paid", status: "complete" } } };
    expect(await applyBillingEvent(db, completed as unknown as Stripe.Event)).toBe(true);
    expect((await resolveOrg(db, owner.id, org.slug))?.plan).toBe("pro");
    expect(await applyBillingEvent(db, completed as unknown as Stripe.Event)).toBe(false); // idempotent

    const deleted = { type: "customer.subscription.deleted", data: { object: { metadata: { org_id: org.orgId }, status: "canceled" } } };
    expect(await applyBillingEvent(db, deleted as unknown as Stripe.Event)).toBe(true);
    expect((await resolveOrg(db, owner.id, org.slug))?.plan).toBe("free");
  });

  it("ignores events without a valid org id", async () => {
    const bad = { type: "checkout.session.completed", data: { object: { metadata: { org_id: "'; drop table x" }, payment_status: "paid" } } };
    expect(await applyBillingEvent(db, bad as unknown as Stripe.Event)).toBe(false);
  });
});

describe("okr math", () => {
  it("computes clamped progress, including decreasing targets", () => {
    expect(progress({ start_value: 0, target_value: 200, current_value: 50 })).toBe(25);
    expect(progress({ start_value: 100, target_value: 20, current_value: 60 })).toBe(50);
    expect(progress({ start_value: 0, target_value: 10, current_value: 15 })).toBe(100);
    expect(progress({ start_value: 0, target_value: 10, current_value: -5 })).toBe(0);
    expect(objectiveProgress([])).toBe(0);
  });

  it("handles quarters", () => {
    expect(currentQuarter(new Date(Date.UTC(2026, 10, 9)))).toBe("2026-Q4");
    expect(shiftQuarter("2026-Q4", 1)).toBe("2027-Q1");
    expect(shiftQuarter("2026-Q1", -1)).toBe("2025-Q4");
  });
});

describe("validation", () => {
  it("normalizes email and enforces password length", () => {
    expect(signupSchema.parse({ name: " Ana ", email: " Ana@Example.COM ", password: "long enough" })).toMatchObject({
      name: "Ana",
      email: "ana@example.com",
    });
    expect(signupSchema.safeParse({ name: "a", email: "a@b.co", password: "short" }).success).toBe(false);
    expect(signupSchema.safeParse({ name: "a", email: "not-an-email", password: "long enough" }).success).toBe(false);
  });
});
