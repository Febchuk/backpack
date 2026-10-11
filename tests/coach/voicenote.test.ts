// Lane C gate: VoiceNotes (fetch + transcribe inbound audio; synthesise + host replies) and GET /media/:id.mp3.
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { createServer, type Server } from "node:http";
import type { AddressInfo } from "node:net";
import { createVoiceNotes } from "../../apps/coach/src/voice/notes";
import type { Llm, VoiceNotes } from "../../apps/coach/src/coach/contract";
import type { Agent, Learner } from "../../apps/coach/src/db/repo";
import { seedAgent, seedLearner, startCoach, type Coach } from "./helpers";

let coach: Coach;
let notes: VoiceNotes;
let agent: Agent;
let learner: Learner;
let media: Server;
let mediaUrl: string;
const seen: { audio: string; mimeType: string; language: string }[] = [];

beforeEach(async () => {
  coach = await startCoach();
  seen.length = 0;
  const llm: Llm = {
    ...coach.deps.llm,
    transcribeAudio: async (input) => {
      seen.push({ audio: input.audio.toString("utf8"), mimeType: input.mimeType, language: input.language });
      return coach.deps.llm.transcribeAudio(input);
    },
  };
  notes = createVoiceNotes({ config: coach.deps.config, repo: coach.deps.repo, llm, tts: coach.deps.tts });
  agent = await seedAgent(coach.deps);
  learner = await seedLearner(coach.deps, agent);
  // Stands in for Dial's public media host.
  media = createServer((req, res) => {
    if (req.url === "/v1.m4a") return res.writeHead(200, { "content-type": "audio/x-m4a" }).end("bonjour je m'appelle Sam");
    res.writeHead(404).end();
  });
  await new Promise<void>((r) => media.listen(0, () => r()));
  mediaUrl = `http://127.0.0.1:${(media.address() as AddressInfo).port}`;
});
afterEach(async () => {
  await new Promise<void>((r) => media.close(() => r()));
  await coach.close();
});

describe("coach voice notes", () => {
  it("fetches an inbound voice note and transcribes it in the agent's language", async () => {
    const t = await notes.transcribe({ url: `${mediaUrl}/v1.m4a`, contentType: "audio/x-m4a", agent, learner });
    expect(t.transcript).toBe("bonjour je m'appelle Sam");
    expect(seen).toEqual([{ audio: "bonjour je m'appelle Sam", mimeType: "audio/x-m4a", language: "fr-FR" }]);
  });

  it("throws a clear error when the media can't be fetched", async () => {
    await expect(notes.transcribe({ url: `${mediaUrl}/missing.m4a`, contentType: "audio/x-m4a", agent, learner })).rejects.toThrow(/404/);
  });

  it("speaks a reply in the agent's voice and hosts it at a public, unguessable /media URL", async () => {
    const { url } = await notes.speak({ text: "Très bien !", agent, learner });
    expect(url.startsWith(`${coach.url}/media/`)).toBe(true);
    expect(url).toMatch(/\/media\/[A-Za-z0-9_-]{20,}\.mp3$/);
    const res = await fetch(url);
    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toMatch(/audio\/mpeg/);
    expect(Buffer.from(await res.arrayBuffer()).toString()).toBe("MP3:voice_fr_camille:Très bien !");
  });

  it("serves 404 for unknown media", async () => {
    expect((await coach.get("/media/nope.mp3")).status).toBe(404);
  });

  it("refuses to speak for an agent with no voice yet", async () => {
    const bare = await coach.deps.repo.updateAgent(agent.id, { voice_id: null });
    await expect(notes.speak({ text: "x", agent: bare!, learner })).rejects.toThrow(/voice/i);
  });
});
