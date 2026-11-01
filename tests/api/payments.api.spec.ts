import { test, expect, PAYMENTS_URL } from "../support/fixtures.js";

// These tests call the payments service directly, not through orders.
test.use({ baseURL: PAYMENTS_URL });

test.describe("Payments API", () => {
  test("rejects a request with no token", async ({ request }) => {
    const res = await request.post("/payments", { data: { orderId: "o-1", amount: 10 } });
    expect(res.status()).toBe(401);
  });

  test("approves a payment exactly at the limit", async ({ alice }) => {
    const res = await alice.post("/payments", { data: { orderId: "o-limit", amount: 1000 } });
    expect(res.status()).toBe(201);
    expect(await res.json()).toMatchObject({ status: "approved", amount: 1000 });
  });

  test("declines a payment one cent over the limit", async ({ alice }) => {
    const res = await alice.post("/payments", { data: { orderId: "o-over", amount: 1000.01 } });
    expect(res.status()).toBe(201);
    expect(await res.json()).toMatchObject({ status: "declined", reason: "over_limit" });
  });

  test("rejects a zero amount", async ({ alice }) => {
    const res = await alice.post("/payments", { data: { orderId: "o-zero", amount: 0 } });
    expect(res.status()).toBe(400);
    expect(await res.json()).toEqual({ error: "amount_must_be_positive" });
  });

  test("one user cannot read another user's payment", async ({ alice, bob }) => {
    const payment = await (await alice.post("/payments", { data: { orderId: "o-private", amount: 5 } })).json();
    const res = await bob.get(`/payments/${payment.id}`);
    expect(res.status()).toBe(404);
  });
});
