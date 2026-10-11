import { elLanguage, RELATIONS, type DesignedPreview, type LibraryVoice } from "@backpack/shared/coach";
import type { Config } from "../config";
import type { VoiceProvisioner } from "../coach/contract";
import { createMockVoiceProvisioner } from "../mocks";

export const ELEVENLABS_API_URL = "https://api.elevenlabs.io";

/** The call model: low latency and multilingual. Dial's self-hosted audio is 8 kHz μ-law both ways. */
const CALL_TTS_MODEL = "eleven_flash_v2_5";
const CALL_AUDIO_FORMAT = "ulaw_8000";

/** Client tools the call bridge (voice/bridge.ts) answers. Created once per workspace, then referenced by id. */
const CLIENT_TOOLS = [
  {
    type: "client",
    name: "get_learner_profile",
    description: "Returns what you know about the learner: their trip, level, interests, worries and recent struggles.",
    expects_response: true,
    response_timeout_secs: 10,
    parameters: { type: "object", properties: {}, required: [] },
  },
  {
    type: "client",
    name: "remember_fact",
    description: "Saves one fact the learner just told you, so you remember it next time.",
    expects_response: true,
    response_timeout_secs: 10,
    parameters: {
      type: "object",
      properties: {
        rel: { type: "string", enum: [...RELATIONS], description: "What kind of fact this is." },
        object: { type: "string", description: "The fact itself, in a few words, e.g. 'Lyon' or 'ordering food'." },
      },
      required: ["rel", "object"],
    },
  },
] as const;

function errorMessage(body: unknown): string {
  if (body && typeof body === "object" && "detail" in body) {
    const d = (body as { detail: unknown }).detail;
    if (typeof d === "string") return d;
    if (d && typeof d === "object" && "message" in d && typeof d.message === "string") return d.message;
    return JSON.stringify(d);
  }
  return typeof body === "string" ? body : JSON.stringify(body);
}

/** Minimal fetch client for the ElevenLabs REST API. The key only ever goes into the `xi-api-key` header. */
export function elevenLabsFetcher(apiKey: string, baseUrl = ELEVENLABS_API_URL) {
  return async function elFetch<T = unknown>(method: string, path: string, body?: unknown): Promise<T> {
    const res = await fetch(`${baseUrl}${path}`, {
      method,
      headers: { "xi-api-key": apiKey, ...(body !== undefined ? { "Content-Type": "application/json" } : {}) },
      body: body !== undefined ? JSON.stringify(body) : undefined,
    });
    const text = await res.text();
    let parsed: unknown = text;
    try {
      parsed = text ? JSON.parse(text) : null;
    } catch {
      /* keep raw text */
    }
    if (!res.ok) throw new Error(`ElevenLabs ${method} ${path.split("?")[0]} failed: ${res.status} ${errorMessage(parsed)}`);
    return parsed as T;
  };
}

const str = (v: unknown) => (typeof v === "string" && v ? v : null);

export function toLibraryVoice(raw: Record<string, unknown>): LibraryVoice {
  return {
    voice_id: String(raw.voice_id),
    public_owner_id: String(raw.public_owner_id),
    name: String(raw.name ?? raw.voice_id),
    accent: str(raw.accent),
    gender: str(raw.gender),
    age: str(raw.age),
    description: str(raw.description),
    preview_url: str(raw.preview_url),
  };
}

/** The `conversation_config` + `platform_settings` for one coach agent's ElevenLabs agent. */
export function agentBody(input: { name: string; language: string; voiceId: string; prompt: string; firstMessage: string }, toolIds: string[]) {
  return {
    name: `Coach ${input.name}`,
    tags: ["backpack-coach"],
    conversation_config: {
      agent: {
        language: elLanguage(input.language),
        first_message: input.firstMessage,
        prompt: { prompt: input.prompt, tool_ids: toolIds },
      },
      tts: { model_id: CALL_TTS_MODEL, voice_id: input.voiceId, agent_output_audio_format: CALL_AUDIO_FORMAT },
      asr: { user_input_audio_format: CALL_AUDIO_FORMAT },
    },
    platform_settings: {
      // The call bridge sends these per call (the learner's memory goes into the prompt).
      overrides: {
        conversation_config_override: {
          agent: { prompt: { prompt: true }, first_message: true, language: true },
          tts: { voice_id: true },
        },
      },
    },
  };
}

export function createRealVoiceProvisioner(config: Config): VoiceProvisioner {
  if (!config.elevenLabsApiKey) throw new Error("MOCK_ELEVENLABS=0 but ELEVENLABS_API_KEY is not set");
  const el = elevenLabsFetcher(config.elevenLabsApiKey);

  let toolIds: Promise<string[]> | null = null;
  const ensureTools = () =>
    (toolIds ??= (async () => {
      const ids: string[] = [];
      for (const tool of CLIENT_TOOLS) {
        const q = new URLSearchParams({ search: tool.name, types: "client", page_size: "100" });
        const { tools = [] } = await el<{ tools?: { id: string; tool_config?: { name?: string } }[] }>("GET", `/v1/convai/tools?${q}`);
        const existing = tools.find((t) => t.tool_config?.name === tool.name);
        ids.push(existing ? existing.id : (await el<{ id: string }>("POST", "/v1/convai/tools", { tool_config: tool })).id);
      }
      return ids;
    })().catch((e) => {
      toolIds = null;
      throw e;
    }));

  return {
    async searchLibrary({ language, accent, gender }) {
      const q = new URLSearchParams({ language: elLanguage(language), page_size: "30", sort: "trending" });
      if (accent) q.set("accent", accent);
      if (gender) q.set("gender", gender);
      const { voices = [] } = await el<{ voices?: Record<string, unknown>[] }>("GET", `/v1/shared-voices?${q}`);
      return voices.map(toLibraryVoice);
    },
    async design({ description, sampleText }) {
      const res = await el<{ previews?: { generated_voice_id: string; audio_base_64: string }[] }>(
        "POST",
        "/v1/text-to-voice/design?output_format=mp3_44100_128",
        { voice_description: description, text: sampleText, model_id: "eleven_multilingual_ttv_v2" },
      );
      return (res.previews ?? []).map((p): DesignedPreview => ({ generated_voice_id: p.generated_voice_id, audio_base_64: p.audio_base_64 }));
    },
    async saveDesigned({ generatedVoiceId, name, description }) {
      const res = await el<{ voice_id: string }>("POST", "/v1/text-to-voice", {
        voice_name: name,
        voice_description: description,
        generated_voice_id: generatedVoiceId,
      });
      return { voice_id: res.voice_id };
    },
    async addFromLibrary({ publicOwnerId, voiceId, name }) {
      const res = await el<{ voice_id: string }>("POST", `/v1/voices/add/${encodeURIComponent(publicOwnerId)}/${encodeURIComponent(voiceId)}`, {
        new_name: name,
      });
      return { voice_id: res.voice_id };
    },
    async upsertAgent({ elAgentId, ...input }) {
      const body = agentBody(input, await ensureTools());
      if (elAgentId) {
        await el("PATCH", `/v1/convai/agents/${encodeURIComponent(elAgentId)}`, body);
        return { el_agent_id: elAgentId };
      }
      const res = await el<{ agent_id: string }>("POST", "/v1/convai/agents/create", body);
      return { el_agent_id: res.agent_id };
    },
    async deleteAgent(elAgentId) {
      await el("DELETE", `/v1/convai/agents/${encodeURIComponent(elAgentId)}`);
    },
    async deleteVoice(voiceId) {
      await el("DELETE", `/v1/voices/${encodeURIComponent(voiceId)}`);
    },
  };
}

/** ElevenLabs voice library, voice design and Agents create/update. */
export function createVoiceProvisioner(config: Config): VoiceProvisioner {
  return config.mockElevenLabs ? createMockVoiceProvisioner().provisioner : createRealVoiceProvisioner(config);
}
