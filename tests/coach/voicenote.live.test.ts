// Lane C live check (real ElevenLabs + Gemini, costs credits): LIVE=1 pnpm exec vitest run tests/coach/voicenote.live.test.ts
import { describe, expect, it } from "vitest";
import { loadConfig } from "../../apps/coach/src/config";
import { createTts } from "../../apps/coach/src/voice/tts";
import { createLlm } from "../../apps/coach/src/llm/gemini";

/** A premade multilingual voice ("Charlotte") for when ELEVENLABS_VOICE_ID is unset. */
const FALLBACK_VOICE = "XB0fDUnXU5powFXDhCwa";
const SENTENCE = "Bonjour, je voudrais un café et un croissant, s'il vous plaît.";
const words = (s: string) => s.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").match(/[a-z]+/g) ?? [];

describe.skipIf(process.env.LIVE !== "1")("coach voice notes (live)", () => {
  it("@live ElevenLabs speaks French and Gemini transcribes it back", async () => {
    const config = loadConfig({ mockElevenLabs: false, mockGemini: false });
    expect(config.elevenLabsApiKey, "ELEVENLABS_API_KEY").toBeTruthy();
    expect(config.geminiApiKey, "GEMINI_API_KEY").toBeTruthy();

    const { audio, mimeType } = await createTts(config).synthesize({
      voiceId: process.env.ELEVENLABS_VOICE_ID || FALLBACK_VOICE,
      text: SENTENCE,
      language: "fr-FR",
    });
    expect(audio.length).toBeGreaterThan(5_000);

    const t = await createLlm(config).transcribeAudio({ audio, mimeType, language: "fr-FR", level: "A2" });
    const heard = new Set(words(t.transcript));
    const expected = words(SENTENCE);
    const hits = expected.filter((w) => heard.has(w)).length;
    expect(hits / expected.length, t.transcript).toBeGreaterThanOrEqual(0.8);
  }, 60_000);
});
