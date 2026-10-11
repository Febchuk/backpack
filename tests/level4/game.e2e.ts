import { expect, test, type Page } from "@playwright/test";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";
import { ECONOMY, starsForHints, type NpcTurnResponse, type PlayerState } from "@backpack/shared";
import { API } from "../helpers/ports";

const START_EUROS = 50;
const MISSED = "c'est combien ?";

const h = (page: Page) => ({
  scene: () => page.evaluate(() => window.__backpack!.scene()),
  ui: () => page.evaluate(() => window.__backpack!.ui()),
  state: () => page.evaluate(() => window.__backpack!.state()),
  playerId: () => page.evaluate(() => window.__backpack!.playerId()),
  npcs: () => page.evaluate(() => window.__backpack!.npcs()),
  talk: (npc: string, text: string) => page.evaluate(([n, t]) => window.__backpack!.talk(n as never, t), [npc, text] as const),
  useDoor: async (name: string) => {
    const door = (await page.evaluate(() => window.__backpack!.doors())).find((d) => d.name === name);
    expect(door, `door ${name}`).toBeTruthy();
    await page.evaluate(([x, y]) => window.__backpack!.teleport(x, y), [door!.x, door!.y] as const);
  },
});

/** Collects uncaught page errors and console errors. Missing art (the assets lane's files) is not a crash. */
function watchErrors(page: Page, stalePlayers = new Set<string>()) {
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(`pageerror: ${e.message}`));
  page.on("console", (m) => {
    if (m.type() !== "error") return;
    const url = m.location().url;
    if (/Failed to load resource/.test(m.text())) {
      if (url.includes("/assets/")) return;
      // After /dev/reset the previous rehearsal's player is gone: its last poll and the title screen's
      // "is my stored player still there?" check get a 404, and the game starts a fresh player.
      const stale = /\/state\/([^/?]+)/.exec(url)?.[1];
      if (stale && stalePlayers.has(stale)) return;
    }
    errors.push(`console: ${m.text()} @ ${url}`);
  });
  return errors;
}

async function startGame(page: Page) {
  const g = h(page);
  await page.goto("/");
  await expect.poll(g.scene).toBe("Title");
  await page.keyboard.press("Enter");
  await expect.poll(g.scene).toBe("Airport");
  await expect.poll(g.playerId).not.toBeNull();
}

/** The whole demo, title to hostel, on mocks. */
async function rehearsal(page: Page, request: import("@playwright/test").APIRequestContext, run: number) {
  const g = h(page);
  await startGame(page);
  await expect(page.locator("#hud-euros")).toContainText(`€${START_EUROS}`);

  // SIM kiosk → phone → Luna's text.
  const sim = await g.talk("clerk", "Bonjour, je voudrais une carte SIM, merci");
  expect(sim.mission_complete).toBe(true);
  await expect.poll(async () => (await g.ui()).phoneFormOpen).toBe(true);
  await page.evaluate((n) => window.__backpack!.submitPhone(`+1555000${4000 + n}`), run);
  await expect.poll(async () => (await g.ui()).messages, { timeout: 5000 }).toBeGreaterThanOrEqual(1);
  await expect.poll(async () => (await g.ui()).activeMission).toBe("cafe_order");

  // Street: every open-play local answers, the café mission misses the price.
  await g.useDoor("exit");
  await expect.poll(g.scene).toBe("Street");
  expect((await g.npcs()).map((n) => n.id)).toEqual(expect.arrayContaining(["barista", "girard", "margaux", "theo"]));
  for (const npc of ["girard", "margaux", "theo"]) {
    expect((await g.talk(npc, "Bonjour ! Salut, ça va ? Merci")).mission_complete, npc).toBeNull();
  }
  const cafe = await g.talk("barista", "Bonjour, je voudrais un café s'il vous plaît, merci");
  expect(cafe.mission_complete).toBe(true);
  await expect(page.locator("#hud-stars")).toContainText("Café");
  const spent = (await g.state())!.player.euros;
  expect(spent).toBeLessThan(START_EUROS);
  await expect(page.locator("#hud-euros")).toHaveText(`€${spent}`);

  // Evening: debrief transcript → market.
  await expect.poll(async () => (await g.ui()).skipEveningVisible).toBe(true);
  await page.evaluate(() => window.__backpack!.skipEvening());
  const playerId = await g.playerId();
  const res = await request.post(`${API}/dial/webhook`, {
    data: { call_id: `mock_call_run${run}`, player_id: playerId, kind: "debrief", turns: [{ speaker: "player", text: "C'est combien ?" }] },
  });
  expect(res.ok()).toBe(true);
  await expect.poll(async () => (await g.ui()).marketUnlocked, { timeout: 4000 }).toBe(true);
  await expect.poll(async () => (await g.ui()).backpack).toContain(MISSED);

  // Hostel: Inès at the desk and the day summary.
  await g.useDoor("hostel");
  await expect.poll(g.scene).toBe("Hostel");
  expect((await g.npcs()).map((n) => n.id)).toContain("ines");
  expect((await g.talk("ines", "Bonjour, merci !")).mission_complete).toBeNull();
  const summary = page.locator("#day-summary");
  await expect(summary).toBeVisible();
  const st = (await g.state())!;
  const learned = st.phrases.filter((p) => p.status === "mastered").length;
  await expect(summary.locator("[data-stat=phrases]")).toContainText(String(learned));
  await expect(summary.locator("[data-stat=euros]")).toContainText(`€${st.player.euros}`);
  await expect(summary.locator("[data-mission=sim_kiosk]")).toBeVisible();
  await expect(summary.locator("[data-mission=cafe_order]")).toBeVisible();
}

test("L4 gate: three full rehearsals in a row with no crash", async ({ page, request }) => {
  test.setTimeout(180_000);
  const stalePlayers = new Set<string>();
  const errors = watchErrors(page, stalePlayers);
  const players: string[] = [];
  for (let run = 1; run <= 3; run++) {
    expect((await request.post(`${API}/dev/reset`)).ok()).toBe(true);
    await test.step(`rehearsal ${run}`, () => rehearsal(page, request, run));
    expect(errors, `errors during rehearsal ${run}`).toEqual([]);
    const id = (await h(page).playerId())!;
    expect(players, "each rehearsal starts a fresh player").not.toContain(id);
    players.push(id);
    stalePlayers.add(id);
  }
});

test("HUD: euros change live from /state polling, and stars per mission show", async ({ page }) => {
  const errors = watchErrors(page);
  let euros = START_EUROS;
  let simStars = 0;
  await page.route(new RegExp(`${API}/state/.*`), async (route) => {
    const res = await route.fetch();
    const st = (await res.json()) as PlayerState;
    st.player.euros = euros;
    st.missions = st.missions.map((m) => (m.mission_key === "sim_kiosk" ? { ...m, status: "done", stars: simStars } : m));
    await route.fulfill({ response: res, json: st });
  });
  await startGame(page);
  await expect(page.locator("#hud-euros")).toHaveText(`€${START_EUROS}`);

  euros = 37;
  simStars = 2;
  await expect(page.locator("#hud-euros")).toHaveText("€37", { timeout: 4000 });
  await expect(page.locator("#hud-euro-delta")).toContainText("-€13");
  await expect(page.locator("#hud-stars [data-mission=sim_kiosk]")).toHaveText(/SIM ★★☆/);
  expect(errors).toEqual([]);
});

test("Stars: Luna's award_star on /mcp shows in the HUD", async ({ page, request }) => {
  await request.post(`${API}/dev/reset`);
  await startGame(page);
  const playerId = await h(page).playerId();
  const client = new Client({ name: "luna-l4-e2e", version: "0.0.0" });
  await client.connect(new StreamableHTTPClientTransport(new URL(`${API}/mcp`)));
  try {
    await client.callTool({ name: "award_star", arguments: { player_id: playerId, mission_id: "sim_kiosk" } });
  } finally {
    await client.close();
  }
  await expect(page.locator("#hud-stars [data-mission=sim_kiosk]")).toContainText("★", { timeout: 4000 });
});

test("Dialogue: a leading *stage direction* in reply_en_hint renders in italics", async ({ page }) => {
  const turn: NpcTurnResponse = {
    reply_fr: "Un café ? C'est deux euros.",
    reply_en_hint: "*points at the menu* A coffee? It's two euros.",
    heard: "bonjour",
    phrases_used: ["bonjour"],
    phrases_missed: [],
    hint: "",
    mission_complete: false,
    mood: "patient",
  };
  await page.route(`${API}/npc/barista/turn`, (route) => route.fulfill({ json: turn }));
  await startGame(page);
  await h(page).talk("barista", "bonjour");
  const stage = page.locator(".dialogue em.stage");
  await expect(stage).toHaveText("points at the menu");
  await expect(page.locator(".dialogue .en")).toHaveText("points at the menu A coffee? It's two euros.");
});

test("Economy: completing missions spends euros live in the HUD and earns stars by hints used", async ({ page, request }) => {
  await request.post(`${API}/dev/reset`);
  const g = h(page);
  await startGame(page);
  await g.talk("clerk", "Bonjour, je voudrais une carte SIM, merci");
  const afterSim = START_EUROS - ECONOMY.missionCost.sim_kiosk;
  await expect(page.locator("#hud-euros")).toHaveText(`€${afterSim}`, { timeout: 4000 });
  await expect(page.locator("#hud-euro-delta")).toContainText(`-€${ECONOMY.missionCost.sim_kiosk}`);
  await expect(page.locator("#hud-stars [data-mission=sim_kiosk]")).toHaveText(`SIM ${"★".repeat(starsForHints(0))}`);

  await page.evaluate(() => window.__backpack!.submitPhone("+15550009999"));
  await g.useDoor("exit");
  await expect.poll(g.scene).toBe("Street");
  // One fumble with a hint, then the order: fewer stars than a clean run.
  await g.talk("barista", "euh... un café");
  await g.talk("barista", "Bonjour, je voudrais un café s'il vous plaît");
  const st = (await g.state())!;
  const cafe = st.missions.find((m) => m.mission_key === "cafe_order")!;
  expect(cafe.status).toBe("done");
  expect(cafe.stars).toBe(starsForHints(cafe.hints_used));
  await expect(page.locator("#hud-euros")).toHaveText(`€${st.player.euros}`);
  expect(st.player.euros).toBeLessThanOrEqual(afterSim - ECONOMY.missionCost.cafe_order);
  await expect(page.locator("#hud-stars [data-mission=cafe_order]")).toContainText("★".repeat(cafe.stars));
});
