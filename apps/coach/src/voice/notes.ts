import type { Config } from "../config";
import type { Repo } from "../db/repo";
import type { Llm, Tts, VoiceNotes } from "../coach/contract";
import { baseMime, prepareAudio, transcodeToFlac } from "./audio";

const FETCH_TIMEOUT_MS = 15_000;
const MAX_AUDIO_BYTES = 10 * 1024 * 1024;

/** GETs a public media URL into memory, refusing anything over `MAX_AUDIO_BYTES`. */
export async function fetchAudio(url: string): Promise<{ audio: Buffer; contentType: string }> {
  const res = await fetch(url, { signal: AbortSignal.timeout(FETCH_TIMEOUT_MS) });
  if (!res.ok) throw new Error(`voice note fetch failed: HTTP ${res.status} for ${url}`);
  if (Number(res.headers.get("content-length") ?? 0) > MAX_AUDIO_BYTES) throw new Error(`voice note too large (> ${MAX_AUDIO_BYTES} bytes)`);
  const chunks: Buffer[] = [];
  let size = 0;
  if (res.body) {
    for await (const chunk of res.body as unknown as AsyncIterable<Uint8Array>) {
      size += chunk.byteLength;
      if (size > MAX_AUDIO_BYTES) throw new Error(`voice note too large (> ${MAX_AUDIO_BYTES} bytes)`);
      chunks.push(Buffer.from(chunk));
    }
  }
  return { audio: Buffer.concat(chunks), contentType: res.headers.get("content-type") ?? "" };
}

export function createVoiceNotes(deps: {
  config: Config;
  repo: Repo;
  llm: Llm;
  tts: Tts;
  transcode?: (audio: Buffer) => Promise<Buffer>;
}): VoiceNotes {
  const { config, repo, llm, tts, transcode = transcodeToFlac } = deps;
  return {
    async transcribe({ url, contentType, agent, learner }) {
      const fetched = await fetchAudio(url);
      const declared = baseMime(contentType) || baseMime(fetched.contentType);
      const { audio, mimeType } = await prepareAudio(fetched.audio, declared, transcode);
      return llm.transcribeAudio({ audio, mimeType, language: agent.language, level: learner.level });
    },

    async speak({ text, agent, learner }) {
      if (!agent.voice_id) throw new Error(`agent ${agent.id} has no voice yet; provision one before sending voice notes`);
      const { audio, mimeType } = await tts.synthesize({ voiceId: agent.voice_id, text, language: agent.language });
      const id = await repo.putMedia(learner.id, mimeType, audio);
      return { url: `${config.publicUrl}/media/${id}.mp3` };
    },
  };
}
