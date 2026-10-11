import { expect, test, type Page } from "@playwright/test";
import transcript from "@backpack/shared/fixtures/dialTranscript.debrief.json" with { type: "json" };

const hooks = (page: Page) => ({
  scene: () => page.evaluate(() => window.__backpack!.scene()),
  ui: () => page.evaluate(() => window.__backpack!.ui()),
  state: () => page.evaluate(() => window.__backpack!.state()),
  talk: (npc: string, text: string) => page.evaluate(([n, t]) => window.__backpack!.talk(n as never, t), [npc, text] as const),
  doors: () => page.evaluate(() => window.__backpack!.doors()),
  useDoor: async (name: string) => {
    const door = (await page.evaluate(() => window.__backpack!.doors())).find((d) => d.name === name);
    expect(door, `door ${name}`).toBeTruthy();
    await page.evaluate(([x, y]) => window.__backpack!.teleport(x, y), [door!.x, door!.y] as const);
  },
});

test("L1 journey: the whole 5-minute demo, shallow, on mocks", async ({ page, request }) => {
  await request.post("http://localhost:8787/dev/reset");
  const h = hooks(page);

  // 1. Title → Airport
  await page.goto("/");
  await expect.poll(h.scene).toBe("Title");
  await page.keyboard.press("Enter");
  await expect.poll(h.scene).toBe("Airport");
  await expect.poll(() => page.evaluate(() => window.__backpack!.playerId())).not.toBeNull();

  // 2. SIM kiosk by voice (text path) → mission complete → phone form opens
  const sim = await h.talk("clerk", "Bonjour, je voudrais une carte SIM s'il vous plaît");
  expect(sim.mission_complete).toBe(true);
  await expect.poll(async () => (await h.ui()).dialogue).toContain(sim.reply_fr.slice(0, 10));
  await expect.poll(async () => (await h.ui()).phoneFormOpen).toBe(true);

  // 3. Real phone (mock) → Luna's text arrives via polling
  await page.evaluate(() => window.__backpack!.submitPhone("+15550001111"));
  await expect.poll(async () => (await h.ui()).messages, { timeout: 5000 }).toBeGreaterThanOrEqual(1);
  await expect.poll(async () => (await h.ui()).activeMission).toBe("cafe_order");

  // 4. Airport exit door → Street
  await h.useDoor("exit");
  await expect.poll(h.scene).toBe("Street");
  expect((await h.ui()).marketUnlocked).toBe(false);

  // 5. Café: fumble once, then nail it; bonjour lands in the backpack
  const fumble = await h.talk("barista", "bonjour je voudrais un café");
  expect(fumble.phrases_missed).toContain("s'il vous plaît");
  const ok = await h.talk("barista", "bonjour, je voudrais un café s'il vous plaît");
  expect(ok.mission_complete).toBe(true);
  await expect.poll(async () => (await h.ui()).backpack, { timeout: 5000 }).toContain("bonjour");

  // 6. Skip to evening → debrief; Dial webhook (simulated) → market unlocks in-game via polling
  expect((await h.ui()).skipEveningVisible).toBe(true);
  await page.evaluate(() => window.__backpack!.skipEvening());
  const playerId = await page.evaluate(() => window.__backpack!.playerId());
  await request.post("http://localhost:8787/dial/webhook", { data: { ...transcript, player_id: playerId } });
  await expect.poll(async () => (await h.ui()).marketUnlocked, { timeout: 4000 }).toBe(true);

  // 7. Hostel
  await h.useDoor("hostel");
  await expect.poll(h.scene).toBe("Hostel");
});
