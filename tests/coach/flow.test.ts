// Integration: lanes A + B + C together — onboarding by text, Postgres memory, voice note in, hosted voice note out.
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { createServer, type Server } from "node:http";
import type { AddressInfo } from "node:net";
import { deliver, messageReceived, seedAgent, startCoach, waitFor, type Coach } from "./helpers";

const PHONE = "+15557770000";
let coach: Coach;
let media: Server;
let mediaUrl: string;

beforeEach(async () => {
  coach = await startCoach();
  media = createServer((_req, res) => res.writeHead(200, { "content-type": "audio/mpeg" }).end("je voudrais un croissant"));
  await new Promise<void>((r) => media.listen(0, () => r()));
  mediaUrl = `http://127.0.0.1:${(media.address() as AddressInfo).port}/note.mp3`;
});
afterEach(async () => {
  await new Promise<void>((r) => media.close(() => r()));
  await coach.close();
});

describe("coach end-to-end flow (mocked providers, real Postgres memory)", () => {
  it("first text → onboarding → remembered profile shapes later replies → voice note answered with a hosted voice note", async () => {
    const agent = await seedAgent(coach.deps);
    const sent = () => coach.dial.messages.filter((m) => m.to === PHONE);

    await deliver(coach, messageReceived({ from: PHONE, body: "hi!" }));
    await waitFor(() => sent().length === 1);
    const learner = (await coach.deps.repo.learnerByPhone(agent.id, PHONE))!;

    for (const [i, answer] of ["going to Lyon in May with my sister", "A2", "jazz and food markets", "nervous about ordering food"].entries()) {
      await deliver(coach, messageReceived({ from: PHONE, body: answer }));
      await waitFor(() => sent().length === i + 2);
    }
    expect((await coach.deps.repo.getLearner(learner.id))!).toMatchObject({ onboarding_step: "done", level: "A2" });

    const facts = await waitFor(async () => {
      const f = (await coach.deps.memory.profile(learner.id)).facts;
      return f.some((x) => x.rel === "anxious_about") && f;
    });
    expect(facts.map((f) => [f.rel, f.object])).toEqual(expect.arrayContaining([["trip_to", "lyon"], ["level", "A2"]]));
    const { rows } = await coach.deps.db.query<{ n: number }>(`SELECT count(*)::int AS n FROM kg_edges WHERE src = $1`, [`learner:${learner.id}`]);
    expect(rows[0].n).toBeGreaterThanOrEqual(4);

    const systems: string[] = [];
    const reply = coach.deps.llm.reply;
    coach.deps.llm.reply = async (input) => (systems.push(input.system), reply(input));

    await deliver(coach, messageReceived({ from: PHONE, body: "", media: [{ url: mediaUrl, contentType: "audio/mpeg" }] }));
    const voice = await waitFor(() => sent().find((m) => m.mediaUrls?.length));
    expect(systems[0]).toMatch(/Travelling to lyon/);
    expect(systems[0]).toMatch(/Anxious about ordering food/);

    const text = sent()[sent().length - 2];
    expect(text.body).toContain("Mock reply to: je voudrais un croissant");
    const audio = await fetch(voice.mediaUrls![0]);
    expect(audio.status).toBe(200);
    expect(audio.headers.get("content-type")).toMatch(/audio\/mpeg/);
    expect(Buffer.from(await audio.arrayBuffer()).toString()).toMatch(/^MP3:voice_fr_camille:Mock reply to: je voudrais un croissant/);

    const inbound = (await coach.deps.repo.recentEvents(learner.id, 30)).filter((e) => e.channel === "voice_note" && e.direction === "in");
    expect(inbound).toHaveLength(1);
    expect(inbound[0].text).toBe("je voudrais un croissant");
  });
});
