import { test, expect } from "@playwright/test";

test.describe("public smoke", () => {
  test("home redirects to auth when logged out", async ({ page }) => {
    await page.goto("/");
    await expect(page).toHaveURL(/\/auth/);
    await expect(page.getByRole("heading", { name: "Owe It" })).toBeVisible({ timeout: 15_000 });
  });

  test("auth page loads", async ({ page }) => {
    await page.goto("/auth");
    await expect(page.getByRole("heading", { name: "Owe It" })).toBeVisible({ timeout: 15_000 });
  });
});
