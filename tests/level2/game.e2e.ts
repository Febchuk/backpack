import { expect, test, type Page } from "@playwright/test";
import type { PlayerState } from "@backpack/shared";
import fixtureState from "@backpack/shared/fixtures/playerState.new.json" with { type: "json" };

import { API } from "../helpers/ports";

const reply = {
  reply_fr: "Bonjour ! Une carte SIM ?",
  reply_en_hint: "Hello! A SIM card?",
  heard: "bonjour",
  phrases_used: ["bonjour"],
  phrases_missed: [],
  hint: "",
  mission_complete: false,
  mood: "patient",
};

const h = (page: Page) => ({
  scene: () => page.evaluate(() => window.__backpack!.scene()),
  ui: () => page.evaluate(() => window.__backpack!.ui()),
  fx: () => page.evaluate(() => window.__backpack!.fx()),
  player: () => page.evaluate(() => window.__backpack!.player()),
  colliders: () => page.evaluate(() => window.__backpack!.colliders()),
  teleport: (x: number, y: number) => page.evaluate(([x, y]) => window.__backpack!.teleport(x, y), [x, y] as const),
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

/** Holds a key, then checks the player's feet never entered the named collision box. */
async function walkInto(page: Page, label: string, from: { x: number; y: number }, key: string) {
  const g = h(page);
  const box = (await g.colliders()).find((c) => c.label === label);
  expect(box, `collider ${label}`).toBeTruthy();
  await g.teleport(from.x, from.y);
  await page.waitForTimeout(100);
  await page.keyboard.down(key);
  await page.waitForTimeout(600);
  await page.keyboard.up(key);
  const p = (await g.player())!;
  const overlaps = p.body.x1 < box!.x2 - 1 && p.body.x2 > box!.x1 + 1 && p.body.y1 < box!.y2 - 1 && p.body.y2 > box!.y1 + 1;
  expect(overlaps, `${label}: player body ${JSON.stringify(p.body)} vs ${JSON.stringify(box)}`).toBe(false);
  return { p, box: box! };
}

test("collisions: walking into the kiosk and the bench stops at their edge", async ({ page }) => {
  const g = h(page);
  await startGame(page);

  // From below the SIM kiosk, walk up for 600 ms (≈96 px): it would pass y=334 without the collider.
  const kiosk = await walkInto(page, "SIM kiosk", { x: 180, y: 380 }, "w");
  expect(kiosk.p.y).toBeLessThan(370); // it did move
  expect(kiosk.p.body.y1).toBeGreaterThanOrEqual(kiosk.box.y2 - 1);

  // From the left of the kiosk, walk right.
  const side = await walkInto(page, "SIM kiosk", { x: 60, y: 260 }, "d");
  expect(side.p.body.x2).toBeLessThanOrEqual(side.box.x1 + 1);

  await g.useDoor("exit");
  await expect.poll(g.scene).toBe("Street");
  // Street: the bench from below, then the café facade from the street.
  const bench = await walkInto(page, "bench", { x: 500, y: 450 }, "w");
  expect(bench.p.body.y1).toBeGreaterThanOrEqual(bench.box.y2 - 1);
  const facade = await walkInto(page, "café", { x: 140, y: 230 }, "w");
  expect(facade.p.body.y1).toBeGreaterThanOrEqual(facade.box.y2 - 1);
});

test("hold SPACE near the clerk records with the mic and sends multipart audio", async ({ page }) => {
  const g = h(page);
  await page.route(`${API}/npc/clerk/turn`, (route) => route.fulfill({ json: reply }));
  await startGame(page);
  await g.teleport(720, 280);
  await page.waitForTimeout(200);

  const request = page.waitForRequest((r) => r.url().endsWith("/npc/clerk/turn") && r.method() === "POST");
  await page.keyboard.down("Space");
  await expect.poll(async () => (await g.fx()).recording).toBe(true);
  await expect(page.locator("#rec")).toBeVisible();
  await page.waitForTimeout(900);
  await page.keyboard.up("Space");

  const req = await request;
  expect(req.headers()["content-type"]).toContain("multipart/form-data");
  const body = req.postDataBuffer()!.toString("latin1");
  expect(body).toContain('name="audio"');
  expect(body).toContain('name="player_id"');
  expect(body).not.toContain('name="text"');
  expect((await g.fx()).recording).toBe(false);
  await expect(page.locator("#rec")).toBeHidden();
  await expect.poll(async () => (await g.ui()).dialogue).toBe(reply.reply_fr);
});

test("a quick tap and text mode (T) both open the text box instead of recording", async ({ page }) => {
  const g = h(page);
  await startGame(page);
  await g.teleport(720, 280);
  await page.waitForTimeout(200);

  // Tap: under 300 ms of audio → text fallback.
  await page.keyboard.press("Space");
  const input = page.locator("#ui .talk input");
  await expect(input).toBeFocused();
  await input.press("Escape");

  await page.keyboard.press("t");
  expect((await g.fx()).textMode).toBe(true);
  await page.keyboard.down("Space");
  await expect(input).toBeFocused();
  expect((await g.fx()).recording).toBe(false);
  await page.keyboard.up("Space");
  await input.press("Escape");

  await page.keyboard.press("m");
  expect((await g.fx()).muted).toBe(true);
});

test("thinking bubble shows over the NPC while the turn is pending", async ({ page }) => {
  const g = h(page);
  let release!: () => void;
  const gate = new Promise<void>((r) => (release = r));
  await page.route(`${API}/npc/clerk/turn`, async (route) => {
    await gate;
    await route.fulfill({ json: reply });
  });
  await startGame(page);
  expect((await g.fx()).thinking).toBeNull();

  await page.evaluate(() => {
    void window.__backpack!.talk("clerk", "bonjour");
  });
  await expect.poll(async () => (await g.fx()).thinking).toBe("clerk");
  await page.waitForTimeout(500);
  expect((await g.fx()).thinking).toBe("clerk");

  release();
  await expect.poll(async () => (await g.fx()).thinking).toBeNull();
  await expect.poll(async () => (await g.ui()).dialogue).toBe(reply.reply_fr);
  expect((await g.fx()).spoken).toBeGreaterThanOrEqual(1);
});

test("a new Luna text buzzes the phone; submitPhone shows the calling banner", async ({ page }) => {
  const g = h(page);
  const state = structuredClone(fixtureState) as PlayerState;
  state.messages = [];
  await page.route(new RegExp(`${API}/state/.*`), (route) => route.fulfill({ json: state }));
  await page.route(`${API}/activate`, (route) => route.fulfill({ json: { ok: true, call_id: "mock_call_l2" } }));
  await startGame(page);
  await page.waitForTimeout(2500); // at least one poll with zero messages
  expect((await g.fx()).buzzes).toBe(0);

  state.messages = [{ id: "m1", from: "luna", body: "Mission: get a coffee", created_at: "2026-10-11" }];
  await expect.poll(async () => (await g.fx()).buzzes, { timeout: 5000 }).toBe(1);
  await expect(page.locator("#phone-icon")).toHaveClass(/buzz/);

  await page.evaluate(() => window.__backpack!.submitPhone("+15550001111"));
  await expect(page.locator("#call-banner")).toBeVisible();
  await expect(page.locator("#call-banner")).toContainText("Luna is calling your phone");
});
