import type { Config } from "../config";
import type { Tts } from "../coach/contract";
import { createMockTts } from "../mocks";

/** Lane C: ElevenLabs TTS, eleven_multilingual_v2, mp3. */
export function createTts(config: Config): Tts {
  if (config.mockElevenLabs) return createMockTts();
  throw new Error("not implemented: voice/tts.ts (lane C)");
}
