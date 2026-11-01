// Payments service: approves or declines a payment for an order.
import express from "express";
import { randomUUID } from "node:crypto";
import { requireAuth } from "../../shared/auth.js";
import { config } from "../../shared/config.js";

interface Payment {
  id: string;
  orderId: string;
  amount: number;
  status: "approved" | "declined";
  reason?: string;
  payer: string;
  createdAt: string;
}

const payments = new Map<string, Payment>();

export const app = express();
app.use(express.json());

app.get("/health", (_req, res) => {
  res.json({ status: "ok", service: "payments" });
});

app.post("/payments", requireAuth(), (req, res) => {
  const { orderId, amount } = req.body ?? {};
  if (typeof orderId !== "string" || orderId.length === 0) {
    res.status(400).json({ error: "orderId_required" });
    return;
  }
  if (typeof amount !== "number" || !Number.isFinite(amount) || amount <= 0) {
    res.status(400).json({ error: "amount_must_be_positive" });
    return;
  }

  const approved = amount <= config.paymentLimit;
  const payment: Payment = {
    id: randomUUID(),
    orderId,
    amount,
    status: approved ? "approved" : "declined",
    reason: approved ? undefined : "over_limit",
    payer: req.user!.sub,
    createdAt: new Date().toISOString(),
  };
  payments.set(payment.id, payment);
  res.status(201).json(payment);
});

app.get("/payments/:id", requireAuth(), (req, res) => {
  const payment = payments.get(String(req.params.id));
  if (!payment || payment.payer !== req.user!.sub) {
    res.status(404).json({ error: "not_found" });
    return;
  }
  res.json(payment);
});

app.listen(config.ports.payments, () => {
  console.log(`payments listening on http://localhost:${config.ports.payments}`);
});
