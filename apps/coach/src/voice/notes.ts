import type { Config } from "../config";
import type { Repo } from "../db/repo";
import type { Llm, Tts, VoiceNotes } from "../coach/contract";
import { createMockVoiceNotes } from "../mocks";

/** Lane C: fetch inbound audio → llm.transcribeAudio; speak → tts → repo.putMedia → `${publicUrl}/media/<id>.mp3`. */
export function createVoiceNotes(deps: { config: Config; repo: Repo; llm: Llm; tts: Tts }): VoiceNotes {
  return createMockVoiceNotes(deps.config.publicUrl);
}
