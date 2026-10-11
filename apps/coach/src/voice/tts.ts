import type { Config } from "../config";
import type { Tts } from "../coach/contract";
import { createMockTts } from "../mocks";

export const ELEVENLABS_TTS_MODEL = "eleven_multilingual_v2";

/** A touch slower and steadier than ElevenLabs' defaults (speed 1, stability 0.5): learners need to catch every word. */
export const LEARNER_VOICE_SETTINGS = { stability: 0.6, similarity_boost: 0.75, style: 0, speed: 0.9, use_speaker_boost: true };

const TIMEOUT_MS = 30_000;

/** ElevenLabs text-to-speech, mp3 44.1 kHz/128 kbps. The language comes from the text and the voice. */
export function createTts(config: Config): Tts {
  if (config.mockElevenLabs) return createMockTts();
  const apiKey = config.elevenLabsApiKey;
  if (!apiKey) throw new Error("MOCK_ELEVENLABS=0 but ELEVENLABS_API_KEY is not set");
  return {
    async synthesize({ voiceId, text }) {
      const url = `https://api.elevenlabs.io/v1/text-to-speech/${encodeURIComponent(voiceId)}?output_format=mp3_44100_128`;
      const res = await fetch(url, {
        method: "POST",
        headers: { "xi-api-key": apiKey, "content-type": "application/json", accept: "audio/mpeg" },
        body: JSON.stringify({ text, model_id: ELEVENLABS_TTS_MODEL, voice_settings: LEARNER_VOICE_SETTINGS }),
        signal: AbortSignal.timeout(TIMEOUT_MS),
      });
      if (!res.ok) throw new Error(`ElevenLabs TTS failed: HTTP ${res.status} ${(await res.text().catch(() => "")).slice(0, 300)}`);
      return { audio: Buffer.from(await res.arrayBuffer()), mimeType: "audio/mpeg" };
    },
  };
}
