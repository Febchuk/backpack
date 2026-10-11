import { expect, test, type Page } from "@playwright/test";
import type { PlayerState } from "@backpack/shared";
import fixtureState from "@backpack/shared/fixtures/playerState.new.json" with { type: "json" };

const API = "http://localhost:8787";

const h = (page: Page) => ({
  scene: () => page.evaluate(() => window.__backpack!.scene()),
  ui: () => page.evaluate(() => window.__backpack!.ui()),
  doors: () => page.evaluate(() => window.__backpack!.doors()),
  teleport: (x: number, y: number) => page.evaluate(([x, y]) => window.__backpack!.teleport(x, y), [x, y] as const),
  talk: (npc: string, text: string) => page.evaluate(([n, t]) => window.__backpack!.talk(n as never, t), [npc, text] as const),
  useDoor: async (name: string) => {
    const door = (await page.evaluate(() => window.__backpack!.doors())).find((d) => d.name === name);
    expect(door, `door ${name}`).toBeTruthy();
    await page.evaluate(([x, y]) => window.__backpack!.teleport(x, y), [door!.x, door!.y] as const);
  },
});

async function startGame(page: Page) {
  await page.goto("/");
  await expect.poll(h(page).scene).toBe("Title");
  await page.keyboard.press("Enter");
  await expect.poll(h(page).scene).toBe("Airport");
}

test("title → airport, doors, scene changes, market blocked", async ({ page }) => {
  const g = h(page);
  await startGame(page);
  await expect.poll(() => page.evaluate(() => window.__backpack!.playerId())).not.toBeNull();
  expect((await g.doors()).map((d) => d.name)).toEqual(["exit"]);

  await g.useDoor("exit");
  await expect.poll(g.scene).toBe("Street");
  expect((await g.doors()).map((d) => d.name).sort()).toEqual(["airport", "cafe", "hostel", "market"]);

  // café is an area marker, market is closed: both keep us in the Street
  await g.useDoor("cafe");
  await g.useDoor("market");
  await page.waitForTimeout(500);
  expect(await g.scene()).toBe("Street");
  expect((await g.ui()).marketUnlocked).toBe(false);
  await expect(page.getByText("Fermé — the market is closed")).toBeVisible();

  await g.useDoor("hostel");
  await expect.poll(g.scene).toBe("Hostel");
  await g.useDoor("street");
  await expect.poll(g.scene).toBe("Street");
  await g.useDoor("airport");
  await expect.poll(g.scene).toBe("Airport");
});

test("keyboard: walking into the exit door changes scene", async ({ page }) => {
  const g = h(page);
  await startGame(page);
  await g.teleport(480, 400);
  await page.keyboard.down("s");
  await expect.poll(g.scene, { timeout: 3000 }).toBe("Street");
  await page.keyboard.up("s");
});

test("talk hook updates the dialogue; SPACE opens the text box; B and P toggle panels", async ({ page }) => {
  const g = h(page);
  await startGame(page);

  const turn = await g.talk("barista", "bonjour je voudrais un café");
  expect(typeof turn.reply_fr).toBe("string");
  await expect.poll(async () => (await g.ui()).dialogue).toBe(turn.reply_fr);

  // hold-to-talk text fallback: stand next to the clerk, press SPACE, type, Enter
  await g.teleport(720, 280);
  await page.keyboard.press("Escape");
  await expect.poll(async () => (await g.ui()).dialogue).toBeNull();
  await page.waitForTimeout(200); // let a frame pick up the new position (talk range check)
  await page.keyboard.press("Space");
  const input = page.locator("#ui .talk input");
  await expect(input).toBeFocused();
  await input.fill("Bonjour");
  await input.press("Enter");
  await expect.poll(async () => (await g.ui()).dialogue).not.toBeNull();

  expect((await g.ui()).phoneOpen).toBe(false);
  await page.keyboard.press("p");
  expect((await g.ui()).phoneOpen).toBe(true);
  await page.keyboard.press("p");
  expect((await g.ui()).phoneOpen).toBe(false);

  await expect(page.locator("#backpack-panel")).toBeHidden();
  await page.keyboard.press("b");
  await expect(page.locator("#backpack-panel")).toBeVisible();
  await page.keyboard.press("b");
  await expect(page.locator("#backpack-panel")).toBeHidden();
});

test("SIM done opens the phone form; submitPhone activates", async ({ page }) => {
  // The L1 stub NPC route never completes a mission, so fake the clerk's turn.
  await page.route(`${API}/npc/clerk/turn`, (route) =>
    route.fulfill({
      json: {
        reply_fr: "Voilà votre carte SIM ! Votre numéro ?",
        reply_en_hint: "Here's your SIM card! Your number?",
        heard: "bonjour je voudrais une carte sim",
        phrases_used: ["bonjour", "je voudrais une carte SIM"],
        phrases_missed: [],
        hint: "",
        mission_complete: true,
        mood: "warm",
      },
    }),
  );
  const g = h(page);
  await startGame(page);
  const turn = await g.talk("clerk", "Bonjour, je voudrais une carte SIM");
  expect(turn.mission_complete).toBe(true);
  await expect.poll(async () => (await g.ui()).phoneFormOpen).toBe(true);
  await expect(page.locator("#phone-form")).toBeVisible();
  await page.evaluate(() => window.__backpack!.submitPhone("+15550001111"));
  expect((await g.ui()).phoneFormOpen).toBe(false);
});

test("UI reads live state: messages, mission, backpack, skip button, market opens", async ({ page }) => {
  const state = structuredClone(fixtureState) as PlayerState;
  await page.route(new RegExp(`${API}/state/.*`), (route) => route.fulfill({ json: state }));
  await page.route(`${API}/skip-evening`, (route) => route.fulfill({ json: { ok: true, call_id: "mock_call_ui" } }));
  const g = h(page);
  await startGame(page);
  await g.useDoor("exit");
  await expect.poll(g.scene).toBe("Street");
  expect((await g.ui()).skipEveningVisible).toBe(false);

  state.missions = [
    { mission_key: "sim_kiosk", status: "done", stars: 1, hints_used: 0 },
    { mission_key: "cafe_order", status: "done", stars: 1, hints_used: 0 },
  ];
  state.phrases = [{ id: "ph1", text_fr: "bonjour", text_en: "hello", status: "mastered", last_seen: "2026-10-11" }];
  state.messages = [{ id: "m1", from: "luna", body: "Mission: get a coffee", created_at: "2026-10-11" }];
  state.unlocks = ["market"];

  await expect.poll(async () => (await g.ui()).messages, { timeout: 5000 }).toBe(1);
  const ui = await g.ui();
  expect(ui.backpack).toEqual(["bonjour"]);
  expect(ui.activeMission).toBeNull();
  expect(ui.marketUnlocked).toBe(true);
  expect(ui.skipEveningVisible).toBe(true);
  await expect(page.locator("#skip-evening")).toBeVisible();
  await g.useDoor("market");
  await expect(page.getByText("Le marché est ouvert")).toBeVisible();

  await page.evaluate(() => window.__backpack!.skipEvening());
  await g.useDoor("hostel");
  await expect.poll(g.scene).toBe("Hostel");
  expect((await g.ui()).skipEveningVisible).toBe(false);
});
