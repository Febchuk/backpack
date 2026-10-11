// Lane E e2e: the console drives a whole setup against the mocked coach.
import { expect, test } from "@playwright/test";

test("create agent → library voice → buy number → add learner → memory panel", async ({ page }) => {
  const name = `Camille ${Date.now() % 100000}`;
  await page.goto("/");

  await page.getByTestId("agent-name").fill(name);
  await page.getByTestId("agent-language").selectOption("fr-FR");
  await page.getByTestId("agent-city").fill("Lyon");
  await page.getByTestId("create-agent").click();
  await expect(page.getByTestId("agent-detail")).toContainText(name);

  // Voice: pick the first library voice and provision it.
  await expect(page.getByTestId("library-voice").first()).toBeVisible();
  await page.getByTestId("accent-filter").fill("native");
  await page.getByTestId("library-voice").first().click();
  await page.getByTestId("provision-voice").click();
  await expect(page.getByTestId("voice-status")).toContainText("lib_fr-FR_0");

  // The Design tab renders three previews.
  await page.getByTestId("voice-tab-design").click();
  await page.getByTestId("design-description").fill("warm woman from Lyon, early 30s, relaxed");
  await page.getByTestId("design-voice").click();
  await expect(page.getByTestId("design-preview")).toHaveCount(3);

  // Number: consent is required, then provisioning → ready.
  await expect(page.getByTestId("buy-number")).toBeDisabled();
  await page.getByTestId("consent").check();
  await page.getByTestId("buy-number").click();
  await expect(page.getByTestId("agent-number")).toHaveText(/^\+1\d{10}$/, { timeout: 10_000 });

  // Learner: added, listed, selected; the memory panel renders.
  await page.getByTestId("learner-phone").fill("+447700900123");
  await page.getByTestId("add-learner").click();
  await expect(page.getByTestId("learner-item")).toHaveCount(1);
  await expect(page.getByTestId("learner-item")).toContainText("+447700900123");
  const memory = page.getByTestId("memory-panel");
  await expect(memory).toBeVisible();
  await expect(memory.getByTestId("memory-facts")).toBeVisible();
  await expect(memory.getByTestId("conversation")).toBeVisible();

  await page.getByTestId("call-learner").click();
  await expect(page.getByTestId("learner-section")).toContainText("Calling +447700900123");
});
