import { expect, test } from "@playwright/test";

test("L0 game boots to the Title scene with test hooks", async ({ page }) => {
  await page.goto("/");
  await expect(page.locator("#game canvas")).toBeVisible();
  await expect.poll(() => page.evaluate(() => window.__backpack?.scene())).toBe("Title");
});
