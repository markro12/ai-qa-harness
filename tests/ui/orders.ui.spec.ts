import type { Page } from "@playwright/test";
import { test, expect, users, uniqueItem, type UserName } from "../support/fixtures.js";

async function signIn(page: Page, user: UserName) {
  await page.goto("/login");
  await page.getByLabel("Username").fill(users[user].username);
  await page.getByLabel("Password").fill(users[user].password);
  await page.getByRole("button", { name: "Sign in" }).click();
  await expect(page.getByRole("heading", { name: "Orders", level: 1 })).toBeVisible();
}

async function placeOrder(page: Page, item: string, quantity: number, unitPrice: number) {
  await page.getByLabel("Item").fill(item);
  await page.getByLabel("Quantity").fill(String(quantity));
  await page.getByLabel("Unit price").fill(String(unitPrice));
  await page.getByRole("button", { name: "Place order" }).click();
}

test.describe("Sign in", () => {
  test("a signed-out user is sent to the sign-in page", async ({ page }) => {
    await page.goto("/orders");
    await expect(page).toHaveURL(/\/login$/);
  });

  test("a wrong password shows an error", async ({ page }) => {
    await page.goto("/login");
    await page.getByLabel("Username").fill("alice");
    await page.getByLabel("Password").fill("wrong-password");
    await page.getByRole("button", { name: "Sign in" }).click();
    await expect(page.getByRole("alert")).toHaveText("Invalid username or password.");
  });

  test("a user can sign in and sign out", async ({ page }) => {
    await signIn(page, "alice");
    await expect(page.getByText("Signed in as alice")).toBeVisible();
    await page.getByRole("button", { name: "Sign out" }).click();
    await expect(page).toHaveURL(/\/login$/);
  });
});

test.describe("Place an order", () => {
  test("a new order appears in the list as paid", async ({ page }) => {
    const item = uniqueItem("mouse");
    await signIn(page, "alice");
    await placeOrder(page, item, 2, 25.5);

    const row = page.getByRole("row").filter({ hasText: item });
    await expect(row).toContainText("$51.00");
    await expect(row).toContainText("paid");
  });

  test("an order over the payment limit shows as declined", async ({ page }) => {
    const item = uniqueItem("laptop");
    await signIn(page, "alice");
    await placeOrder(page, item, 1, 1500);

    await expect(page.getByRole("row").filter({ hasText: item })).toContainText("payment declined");
  });

  test("a user does not see another user's orders", async ({ browser }) => {
    const item = uniqueItem("alice-secret");
    const aliceCtx = await browser.newContext();
    const alicePage = await aliceCtx.newPage();
    await signIn(alicePage, "alice");
    await placeOrder(alicePage, item, 1, 10);
    await expect(alicePage.getByRole("row").filter({ hasText: item })).toBeVisible();

    const bobCtx = await browser.newContext();
    const bobPage = await bobCtx.newPage();
    await signIn(bobPage, "bob");
    await expect(bobPage.getByText(item)).toHaveCount(0);

    await aliceCtx.close();
    await bobCtx.close();
  });
});
