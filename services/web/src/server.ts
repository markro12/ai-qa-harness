// Web front end: login page and orders page. It renders plain HTML on the server.
import express, { type Request, type Response } from "express";
import cookieParser from "cookie-parser";
import { randomUUID } from "node:crypto";
import { config } from "../../shared/config.js";
import { bug } from "../../shared/bugs.js";

interface Session {
  token: string;
  username: string;
}

const sessions = new Map<string, Session>();
const COOKIE = "demo_session";

const esc = (s: unknown) =>
  String(s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);

function page(title: string, body: string): string {
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${esc(title)} · Demo Shop</title>
<style>
  body { font-family: system-ui, sans-serif; max-width: 720px; margin: 2rem auto; padding: 0 1rem; color: #1f2937; }
  header { display: flex; justify-content: space-between; align-items: center; }
  form.stack { display: grid; gap: .75rem; max-width: 320px; }
  label { display: grid; gap: .25rem; font-weight: 600; }
  input { padding: .5rem; font: inherit; }
  button { padding: .5rem 1rem; font: inherit; cursor: pointer; }
  table { width: 100%; border-collapse: collapse; margin-top: 1rem; }
  th, td { text-align: left; padding: .5rem; border-bottom: 1px solid #e5e7eb; }
  [role=alert] { background: #fee2e2; color: #991b1b; padding: .75rem; border-radius: 4px; }
  .status-paid { color: #166534; } .status-payment_declined { color: #991b1b; }
</style>
</head>
<body>${body}</body>
</html>`;
}

function getSession(req: Request): Session | undefined {
  const id = req.cookies?.[COOKIE];
  return id ? sessions.get(id) : undefined;
}

function loginPage(res: Response, error?: string, status = 200) {
  res.status(status).send(
    page(
      "Sign in",
      `<h1>Sign in</h1>
${error ? `<p role="alert">${esc(error)}</p>` : ""}
<form class="stack" method="post" action="/login">
  <label>Username <input name="username" autocomplete="username" required></label>
  <label>Password <input name="password" type="password" autocomplete="current-password" required></label>
  <button type="submit">Sign in</button>
</form>`,
    ),
  );
}

export const app = express();
app.use(express.urlencoded({ extended: false }));
app.use(cookieParser());

app.get("/health", (_req, res) => {
  res.json({ status: "ok", service: "web" });
});

app.get("/", (req, res) => {
  res.redirect(getSession(req) ? "/orders" : "/login");
});

app.get("/login", (_req, res) => loginPage(res));

app.post("/login", async (req, res) => {
  const { username, password } = req.body ?? {};
  if (!username || !password) {
    loginPage(res, "Enter your username and password.", 400);
    return;
  }
  const tokenRes = await fetch(`${config.issuer}/protocol/openid-connect/token`, {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "password",
      client_id: config.clientId,
      username: String(username),
      password: String(password),
      scope: "openid",
    }),
  }).catch(() => undefined);

  if (!tokenRes?.ok) {
    loginPage(res, "Invalid username or password.", 401);
    return;
  }
  const { access_token } = (await tokenRes.json()) as { access_token: string };
  const id = randomUUID();
  sessions.set(id, { token: access_token, username: String(username) });
  res.cookie(COOKIE, id, { httpOnly: true, sameSite: "lax" });
  res.redirect("/orders");
});

app.post("/logout", (req, res) => {
  const id = req.cookies?.[COOKIE];
  if (id) sessions.delete(id);
  res.clearCookie(COOKIE);
  res.redirect("/login");
});

app.get("/orders", async (req, res) => {
  const session = getSession(req);
  if (!session) {
    res.redirect("/login");
    return;
  }
  const apiRes = await fetch(`${config.ordersUrl}/orders`, {
    headers: { authorization: `Bearer ${session.token}` },
  });
  if (apiRes.status === 401) {
    res.redirect("/login");
    return;
  }
  const orders = (await apiRes.json()) as Array<{
    id: string; item: string; quantity: number; total: number; status: string;
  }>;
  const error = typeof req.query.error === "string" ? req.query.error : undefined;

  const rows = orders
    .map(
      (o) => `<tr data-order-id="${esc(o.id)}">
  <td>${bug("stored-xss") ? o.item : esc(o.item)}</td><td>${esc(o.quantity)}</td><td>$${o.total.toFixed(2)}</td>
  <td class="status-${esc(o.status)}">${esc(o.status.replace("_", " "))}</td>
</tr>`,
    )
    .join("");

  res.send(
    page(
      "Orders",
      `<header>
  <h1>Orders</h1>
  <form method="post" action="/logout"><span>Signed in as <strong>${esc(session.username)}</strong></span> <button type="submit">Sign out</button></form>
</header>
${error ? `<p role="alert">${esc(error)}</p>` : ""}
<h2>New order</h2>
<form class="stack" method="post" action="/orders">
  <label>Item <input name="item" required></label>
  <label>Quantity <input name="quantity" type="number" min="1" step="1" value="1" required></label>
  <label>Unit price <input name="unitPrice" type="number" min="0.01" step="0.01" required></label>
  <button type="submit">Place order</button>
</form>
<h2>Your orders</h2>
${
  orders.length
    ? `<table><thead><tr><th>Item</th><th>Qty</th><th>Total</th><th>Status</th></tr></thead><tbody>${rows}</tbody></table>`
    : `<p>You have no orders yet.</p>`
}`,
    ),
  );
});

app.post("/orders", async (req, res) => {
  const session = getSession(req);
  if (!session) {
    res.redirect("/login");
    return;
  }
  const apiRes = await fetch(`${config.ordersUrl}/orders`, {
    method: "POST",
    headers: { "content-type": "application/json", authorization: `Bearer ${session.token}` },
    body: JSON.stringify({
      item: req.body.item,
      quantity: Number(req.body.quantity),
      unitPrice: Number(req.body.unitPrice),
    }),
  });
  if (!apiRes.ok) {
    const { error } = (await apiRes.json().catch(() => ({ error: "order_failed" }))) as { error: string };
    res.redirect(`/orders?error=${encodeURIComponent(`Order failed: ${error}`)}`);
    return;
  }
  res.redirect("/orders");
});

app.listen(config.ports.web, () => {
  console.log(`web listening on http://localhost:${config.ports.web}`);
});
