// Orders service: creates and lists orders. It calls the payments service for each new order.
import express from "express";
import { randomUUID } from "node:crypto";
import { requireAuth } from "../../shared/auth.js";
import { config } from "../../shared/config.js";

interface OrderLine {
  item: string;
  quantity: number;
  unitPrice: number;
}

interface Order extends OrderLine {
  id: string;
  owner: string;
  total: number;
  status: "paid" | "payment_declined" | "payment_error";
  paymentId?: string;
  createdAt: string;
}

const orders = new Map<string, Order>();

function validate(body: unknown): OrderLine | string {
  const b = (body ?? {}) as Record<string, unknown>;
  if (typeof b.item !== "string" || b.item.trim().length === 0) return "item_required";
  if (!Number.isInteger(b.quantity) || (b.quantity as number) < 1) return "quantity_must_be_positive_integer";
  if (typeof b.unitPrice !== "number" || !Number.isFinite(b.unitPrice) || b.unitPrice <= 0) {
    return "unitPrice_must_be_positive";
  }
  return { item: b.item.trim(), quantity: b.quantity as number, unitPrice: b.unitPrice };
}

export const app = express();
app.use(express.json());

app.get("/health", (_req, res) => {
  res.json({ status: "ok", service: "orders" });
});

app.get("/orders", requireAuth(), (req, res) => {
  const mine = [...orders.values()]
    .filter((o) => o.owner === req.user!.sub)
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  res.json(mine);
});

app.get("/orders/:id", requireAuth(), (req, res) => {
  const order = orders.get(String(req.params.id));
  if (!order || order.owner !== req.user!.sub) {
    res.status(404).json({ error: "not_found" });
    return;
  }
  res.json(order);
});

app.post("/orders", requireAuth(), async (req, res) => {
  const line = validate(req.body);
  if (typeof line === "string") {
    res.status(400).json({ error: line });
    return;
  }

  const order: Order = {
    ...line,
    id: randomUUID(),
    owner: req.user!.sub,
    total: Math.round(line.quantity * line.unitPrice * 100) / 100,
    status: "payment_error",
    createdAt: new Date().toISOString(),
  };

  // Forward the caller's token so the payments service knows who pays.
  try {
    const payRes = await fetch(`${config.paymentsUrl}/payments`, {
      method: "POST",
      headers: { "content-type": "application/json", authorization: `Bearer ${req.user!.token}` },
      body: JSON.stringify({ orderId: order.id, amount: order.total }),
    });
    if (payRes.ok) {
      const payment = (await payRes.json()) as { id: string; status: string };
      order.paymentId = payment.id;
      order.status = payment.status === "approved" ? "paid" : "payment_declined";
    }
  } catch {
    order.status = "payment_error";
  }

  orders.set(order.id, order);
  res.status(201).json(order);
});

app.listen(config.ports.orders, () => {
  console.log(`orders listening on http://localhost:${config.ports.orders}`);
});
