import { expect, test, type Page } from "@playwright/test";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";
import type { DialTranscript } from "@backpack/shared";
import { API } from "../helpers/ports";
import { recordingDial } from "../helpers/fakes";
import { startTestServer, type TestServer } from "../helpers/server";

/**
 * L3 gate: a phrase missed in the café comes back in Luna's debrief call, the player says it on the call,
 * and the backpack plus the market unlock show up in the game through /state polling within 4 s.
 *
 * The game is the real Vite build on the test port. Its API traffic (to the webServer on the test API
 * port) is forwarded to an in-process server built from the same app with a recording Dial mock, so the
 * test can read the exact instruction the debrief call was placed with.
 */

const MISSED = "c'est combien ?";
const UNLOCK_MS = 4000;

let server: TestServer;
let dial: ReturnType<typeof recordingDial>;

test.beforeEach(async ({ page }) => {
  dial = recordingDial();
  server = await startTestServer({ dial: dial.adapter });
  await page.route(`${API}/**`, async (route) => {
    const url = server.url + route.request().url().slice(API.length);
    const response = await route.fetch({ url });
    await route.fulfill({ response });
  });
});

test.afterEach(async () => {
  await server.close();
});

const h = (page: Page) => ({
  scene: () => page.evaluate(() => window.__backpack!.scene()),
  ui: () => page.evaluate(() => window.__backpack!.ui()),
  playerId: () => page.evaluate(() => window.__backpack!.playerId()),
  npcs: () => page.evaluate(() => window.__backpack!.npcs()),
  talk: (npc: string, text: string) => page.evaluate(([n, t]) => window.__backpack!.talk(n as never, t), [npc, text] as const),
  useDoor: async (name: string) => {
    const door = (await page.evaluate(() => window.__backpack!.doors())).find((d) => d.name === name);
    expect(door, `door ${name}`).toBeTruthy();
    await page.evaluate(([x, y]) => window.__backpack!.teleport(x, y), [door!.x, door!.y] as const);
  },
});

/** Title → kiosk → phone → Street → café with `c'est combien ?` deliberately left out → skip evening. */
async function playToDebrief(page: Page): Promise<string> {
  const g = h(page);
  await page.goto("/");
  await expect.poll(g.scene).toBe("Title");
  await page.keyboard.press("Enter");
  await expect.poll(g.scene).toBe("Airport");

  const sim = await g.talk("clerk", "Bonjour, je voudrais une carte SIM, merci");
  expect(sim.mission_complete).toBe(true);
  await expect.poll(async () => (await g.ui()).phoneFormOpen).toBe(true);
  await page.evaluate(() => window.__backpack!.submitPhone("+15550003333"));
  await expect.poll(async () => (await g.ui()).activeMission).toBe("cafe_order");

  await g.useDoor("exit");
  await expect.poll(g.scene).toBe("Street");

  // Open play: Girard (bench) and Margaux (boulangerie) are placed and answer without a mission.
  const placed = (await g.npcs()).map((n) => n.id);
  expect(placed).toEqual(expect.arrayContaining(["barista", "girard", "margaux"]));
  for (const npc of ["girard", "margaux"]) {
    const turn = await g.talk(npc, "Bonjour ! Ça va ? Merci");
    expect(turn.mission_complete, npc).toBeNull();
  }

  // Café: everything but the price.
  const cafe = await g.talk("barista", "Bonjour, je voudrais un café s'il vous plaît, merci");
  expect(cafe.mission_complete).toBe(true);
  expect(cafe.phrases_missed).toEqual([MISSED]);
  await expect.poll(async () => (await g.ui()).backpack, { timeout: 5000 }).toContain("bonjour");
  const ui = await g.ui();
  expect(ui.backpack).not.toContain(MISSED);
  expect(ui.marketUnlocked).toBe(false);

  await expect.poll(async () => (await g.ui()).skipEveningVisible).toBe(true);
  await page.evaluate(() => window.__backpack!.skipEvening());
  const playerId = (await g.playerId())!;

  const debrief = dial.calls.find((c) => c.kind === "debrief" && c.player_id === playerId);
  expect(debrief, "a debrief call was placed through Dial").toBeTruthy();
  expect(debrief!.instruction).toContain(MISSED);
  return playerId;
}

/** Backpack and market both appear in the game, through polling alone, within 4 s. */
async function expectUnlockInGame(page: Page) {
  const g = h(page);
  const start = Date.now();
  await expect
    .poll(async () => {
      const ui = await g.ui();
      return ui.backpack.includes(MISSED) && ui.marketUnlocked;
    }, { timeout: UNLOCK_MS, intervals: [100] })
    .toBe(true);
  expect(Date.now() - start).toBeLessThan(UNLOCK_MS);
  // The panel itself (B) shows the new item, highlighted.
  await page.keyboard.press("b");
  await expect(page.locator(`#backpack-panel .item.new[data-phrase="${MISSED}"]`)).toBeVisible();
}

test("L3 gate: missed phrase → debrief names it → said on the call (webhook) → backpack + market within 4 s", async ({ page }) => {
  const playerId = await playToDebrief(page);
  const debrief = dial.calls.find((c) => c.kind === "debrief")!;

  const transcript: DialTranscript = {
    call_id: "mock_call_debrief",
    player_id: playerId,
    kind: "debrief",
    turns: [
      { speaker: "luna", text: `Bonsoir ! Répète après moi : ${MISSED}` },
      { speaker: "player", text: "C'est combien ?" },
    ],
  };
  expect(debrief.to).toBe("+15550003333");
  const res = await server.post("/dial/webhook", transcript);
  expect(res.ok).toBe(true);
  await expectUnlockInGame(page);
});

test("L3 gate (MCP): Luna's mark_phrase_mastered + unlock_district on /mcp reach the game within 4 s", async ({ page }) => {
  const playerId = await playToDebrief(page);

  const client = new Client({ name: "luna-l3-e2e", version: "0.0.0" });
  await client.connect(new StreamableHTTPClientTransport(new URL(`${server.url}/mcp`)));
  try {
    const missed = await client.callTool({ name: "get_missed_phrases", arguments: { player_id: playerId } });
    expect(JSON.stringify(missed.content)).toContain("combien");
    await client.callTool({ name: "mark_phrase_mastered", arguments: { player_id: playerId, phrase: MISSED } });
    await client.callTool({ name: "unlock_district", arguments: { player_id: playerId, district: "market" } });
  } finally {
    await client.close();
  }
  await expectUnlockInGame(page);
});
