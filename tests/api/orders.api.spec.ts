import { test, expect, uniqueItem } from "../support/fixtures.js";

test.describe("Orders API: authentication", () => {
  test("rejects a request with no token", async ({ request }) => {
    const res = await request.get("/orders");
    expect(res.status()).toBe(401);
    expect(await res.json()).toEqual({ error: "missing_token" });
  });

  test("rejects a token with a changed signature", async ({ request, aliceToken }) => {
    const [header, payload] = aliceToken.split(".");
    const forged = `${header}.${payload}.invalidsignature`;
    const res = await request.get("/orders", { headers: { authorization: `Bearer ${forged}` } });
    expect(res.status()).toBe(401);
  });
});

test.describe("Orders API: create order", () => {
  test("creates a paid order and calculates the total", async ({ alice }) => {
    const item = uniqueItem("keyboard");
    const res = await alice.post("/orders", { data: { item, quantity: 3, unitPrice: 19.99 } });

    expect(res.status()).toBe(201);
    const order = await res.json();
    expect(order).toMatchObject({ item, quantity: 3, unitPrice: 19.99, total: 59.97, status: "paid" });
    expect(order.paymentId).toEqual(expect.any(String));
  });

  test("marks the order as declined when the total is over the payment limit", async ({ alice }) => {
    const res = await alice.post("/orders", { data: { item: uniqueItem("server-rack"), quantity: 2, unitPrice: 600 } });

    expect(res.status()).toBe(201);
    expect(await res.json()).toMatchObject({ total: 1200, status: "payment_declined" });
  });

  const invalid = [
    { name: "missing item", body: { quantity: 1, unitPrice: 5 }, error: "item_required" },
    { name: "zero quantity", body: { item: "pen", quantity: 0, unitPrice: 5 }, error: "quantity_must_be_positive_integer" },
    { name: "fractional quantity", body: { item: "pen", quantity: 1.5, unitPrice: 5 }, error: "quantity_must_be_positive_integer" },
    { name: "negative price", body: { item: "pen", quantity: 1, unitPrice: -1 }, error: "unitPrice_must_be_positive" },
  ];
  for (const c of invalid) {
    test(`rejects an order with ${c.name}`, async ({ alice }) => {
      const res = await alice.post("/orders", { data: c.body });
      expect(res.status()).toBe(400);
      expect(await res.json()).toEqual({ error: c.error });
    });
  }
});

test.describe("Orders API: access control", () => {
  test("one user cannot read another user's order", async ({ alice, bob }) => {
    const created = await (await alice.post("/orders", { data: { item: uniqueItem("private"), quantity: 1, unitPrice: 10 } })).json();

    const res = await bob.get(`/orders/${created.id}`);
    expect(res.status()).toBe(404);
  });

  test("the order list shows only the caller's orders", async ({ alice, bob }) => {
    const item = uniqueItem("alice-only");
    await alice.post("/orders", { data: { item, quantity: 1, unitPrice: 10 } });

    const aliceItems = (await (await alice.get("/orders")).json()).map((o: { item: string }) => o.item);
    const bobItems = (await (await bob.get("/orders")).json()).map((o: { item: string }) => o.item);
    expect(aliceItems).toContain(item);
    expect(bobItems).not.toContain(item);
  });
});
