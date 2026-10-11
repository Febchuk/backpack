// Lane B live check against real Gemini. Runs only with LIVE=1 and GEMINI_API_KEY (from the root .env).
import { describe, expect, it } from "vitest";
import { loadConfig } from "../../apps/coach/src/config";
import { createEmbedder } from "../../apps/coach/src/memory/embed";
import { createLlm } from "../../apps/coach/src/llm/gemini";

const config = loadConfig({ mockGemini: false });
const live = process.env.LIVE === "1";
const dot = (a: number[], b: number[]) => a.reduce((s, x, i) => s + x * b[i], 0);

describe.skipIf(!live)("coach memory: live Gemini", () => {
  it("@live embeds at 768 unit-length dims and ranks the related sentence above the unrelated one", async () => {
    const [query, related, unrelated] = await createEmbedder(config).embed([
      "Where can I listen to live jazz tonight?",
      "I love jazz clubs and live music.",
      "My passport expires next spring.",
    ]);
    for (const v of [query, related, unrelated]) {
      expect(v).toHaveLength(768);
      expect(Math.hypot(...v)).toBeCloseTo(1, 5);
    }
    expect(dot(query, related)).toBeGreaterThan(dot(query, unrelated));
  }, 30_000);

  it("@live extracts self-stated facts with calibrated confidence", async () => {
    const out = await createLlm(config).extractFacts({
      text: "Je vais à Lyon en juin avec ma sœur, et j'adore le jazz !",
      language: "fr-FR",
      known: [],
    });
    const rels = out.facts.filter((f) => f.confidence >= 0.6).map((f) => [f.rel, f.object.toLowerCase()]);
    expect(rels).toEqual(expect.arrayContaining([["trip_to", "lyon"]]));
    expect(out.facts.some((f) => ["likes", "interested_in"].includes(f.rel) && /jazz/i.test(f.object))).toBe(true);
    expect(out.facts.some((f) => f.rel === "travelling_with" && /sister/i.test(f.object))).toBe(true);
    expect(out.memory).toEqual(expect.any(String));
  }, 30_000);
});
