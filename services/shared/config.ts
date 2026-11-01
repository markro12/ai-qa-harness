// One place for ports and URLs. Every value can be changed with an environment variable.
const env = (name: string, fallback: string) => process.env[name] ?? fallback;

export const config = {
  idpUrl: env("IDP_URL", "http://localhost:8080"),
  realm: env("IDP_REALM", "demo"),
  clientId: env("IDP_CLIENT_ID", "demo-app"),
  get issuer() {
    return `${this.idpUrl}/realms/${this.realm}`;
  },
  ports: {
    web: Number(env("WEB_PORT", "3000")),
    orders: Number(env("ORDERS_PORT", "3001")),
    payments: Number(env("PAYMENTS_PORT", "3002")),
    mockIdp: Number(env("MOCK_IDP_PORT", "8080")),
  },
  get ordersUrl() {
    return env("ORDERS_URL", `http://localhost:${this.ports.orders}`);
  },
  get paymentsUrl() {
    return env("PAYMENTS_URL", `http://localhost:${this.ports.payments}`);
  },
  /** Payments above this amount are declined. */
  paymentLimit: Number(env("PAYMENT_LIMIT", "1000")),
};
