// Shared test fixtures: tokens and signed-in API clients for the demo users.
import { test as base, expect, request as pwRequest, type APIRequestContext } from "@playwright/test";

export const IDP_URL = process.env.IDP_URL ?? "http://localhost:8080";
export const REALM = process.env.IDP_REALM ?? "demo";
export const CLIENT_ID = process.env.IDP_CLIENT_ID ?? "demo-app";
export const ORDERS_URL = process.env.ORDERS_URL ?? "http://localhost:3001";
export const PAYMENTS_URL = process.env.PAYMENTS_URL ?? "http://localhost:3002";

/** Demo users. They exist in keycloak/demo-realm.json and in the mock IdP. */
export const users = {
  alice: { username: "alice", password: "alice-pass" },
  bob: { username: "bob", password: "bob-pass" },
} as const;
export type UserName = keyof typeof users;

export async function getToken(request: APIRequestContext, user: UserName): Promise<string> {
  const res = await request.post(`${IDP_URL}/realms/${REALM}/protocol/openid-connect/token`, {
    form: {
      grant_type: "password",
      client_id: CLIENT_ID,
      username: users[user].username,
      password: users[user].password,
      scope: "openid",
    },
  });
  expect(res.status(), `token request for ${user}`).toBe(200);
  return (await res.json()).access_token;
}

/** A unique item name, so parallel tests never read each other's orders by mistake. */
export const uniqueItem = (label: string) => `${label}-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;

type Fixtures = {
  aliceToken: string;
  bobToken: string;
  alice: APIRequestContext;
  bob: APIRequestContext;
};

async function clientFor(token: string, baseURL?: string) {
  return pwRequest.newContext({
    baseURL,
    extraHTTPHeaders: { authorization: `Bearer ${token}` },
  });
}

export const test = base.extend<Fixtures>({
  aliceToken: async ({ request }, use) => use(await getToken(request, "alice")),
  bobToken: async ({ request }, use) => use(await getToken(request, "bob")),
  alice: async ({ aliceToken, baseURL }, use) => {
    const ctx = await clientFor(aliceToken, baseURL);
    await use(ctx);
    await ctx.dispose();
  },
  bob: async ({ bobToken, baseURL }, use) => {
    const ctx = await clientFor(bobToken, baseURL);
    await use(ctx);
    await ctx.dispose();
  },
});

export { expect };
