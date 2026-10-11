/**
 * Deterministic stand-ins for every contract interface, used with MOCK_* flags and in tests. No network.
 * Mock audio is UTF-8 text: a "voice note" whose bytes are `bonjour` transcribes to `bonjour`.
 */
import { createHash } from "node:crypto";
import type { FactView, MemoryView, Relation } from "@backpack/shared/coach";
import type { Embedder, ExtractedFact, Llm, Memory, Tts, VoiceNotes, VoiceProvisioner } from "./coach/contract";
import { factSentence } from "./memory/sentences";

export { factSentence };

const FACT_PATTERNS: [RegExp, Relation][] = [
  [/\b(?:i (?:love|like|enjoy)|j'aime|j'adore|me gusta|me encanta)\s+([^.,!?]+)/i, "likes"],
  [/\b(?:i (?:hate|don't like|do not like|dislike)|je déteste|je n'aime pas|odio)\s+([^.,!?]+)/i, "dislikes"],
  [/\b(?:with my|avec (?:ma|mon|mes)|con (?:mi|mis))\s+([^.,!?]+)/i, "travelling_with"],
  [/\b(?:going to|travelling to|traveling to|trip to|je vais à|voy a)\s+([A-ZÀ-Ý][\p{L}-]+)/iu, "trip_to"],
  [/\b(?:nervous about|anxious about|worried about|scared of|peur de)\s+([^.,!?]+)/i, "anxious_about"],
  [/\b(?:struggle with|hard time with|difficult(?:y)? with)\s+([^.,!?]+)/i, "struggles_with"],
];

export function mockFacts(text: string): ExtractedFact[] {
  const facts: ExtractedFact[] = [];
  for (const [re, rel] of FACT_PATTERNS) {
    const m = re.exec(text);
    if (m) facts.push({ rel, object: m[1].trim().toLowerCase(), confidence: 0.9 });
  }
  return facts;
}

export function createMockLlm(): Llm {
  return {
    async reply({ message, expectFacts }) {
      const facts = mockFacts(message);
      // Onboarding: the whole answer is the fact the question asked for.
      if (expectFacts?.length && !facts.some((f) => expectFacts.includes(f.rel)))
        facts.push({ rel: expectFacts[0], object: message.trim().slice(0, 80), confidence: 0.9 });
      return { reply: `Mock reply to: ${message}`, correction: null, voice_reply: false, facts };
    },
    async transcribeAudio({ audio }) {
      return { transcript: audio.toString("utf8").trim(), notes: null };
    },
    async extractFacts({ text }) {
      const facts = mockFacts(text);
      return { facts, memory: facts.length ? text.trim() : null };
    },
  };
}

/** Hashed bag-of-words: texts sharing words have a positive cosine. Deterministic, 768 dims, unit length. */
export function createMockEmbedder(): Embedder {
  const embedOne = (text: string) => {
    const v = new Array<number>(768).fill(0);
    for (const word of text.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").match(/[a-z0-9]+/g) ?? []) {
      const h = createHash("sha1").update(word).digest();
      v[h.readUInt16BE(0) % 768] += 1;
      v[h.readUInt16BE(2) % 768] += 0.5;
    }
    const norm = Math.hypot(...v) || 1;
    return v.map((x) => x / norm);
  };
  return { dims: 768, embed: async (texts) => texts.map(embedOne) };
}

export function createMockTts(): Tts {
  return { synthesize: async ({ voiceId, text }) => ({ audio: Buffer.from(`MP3:${voiceId}:${text}`), mimeType: "audio/mpeg" }) };
}

export function createMockVoiceProvisioner() {
  const agents = new Map<string, { name: string; language: string; voiceId: string; prompt: string; firstMessage: string }>();
  const voices: string[] = [];
  const provisioner: VoiceProvisioner = {
    async searchLibrary({ language }) {
      return ["Camille", "Léo", "Inès"].map((name, i) => ({
        voice_id: `lib_${language}_${i}`,
        public_owner_id: `owner_${i}`,
        name,
        accent: "native",
        gender: i === 1 ? "male" : "female",
        age: "young",
        description: `${name}, a native ${language} speaker`,
        preview_url: null,
      }));
    },
    async design({ description }) {
      return [0, 1, 2].map((i) => ({
        generated_voice_id: `gen_${i}`,
        audio_base_64: Buffer.from(`MP3:preview:${i}:${description}`).toString("base64"),
      }));
    },
    async saveDesigned({ generatedVoiceId }) {
      voices.push(generatedVoiceId);
      return { voice_id: `voice_${generatedVoiceId}` };
    },
    async addFromLibrary({ voiceId }) {
      voices.push(voiceId);
      return { voice_id: `voice_${voiceId}` };
    },
    async upsertAgent({ elAgentId, ...rest }) {
      const id = elAgentId ?? `el_agent_${agents.size + 1}`;
      agents.set(id, rest);
      return { el_agent_id: id };
    },
    async deleteAgent(id) {
      agents.delete(id);
    },
    async deleteVoice(id) {
      voices.splice(voices.indexOf(id), 1);
    },
  };
  return { provisioner, agents, voices };
}

/** Stage-0 voice notes: mock transcript, fake URL. Lane C replaces this with voice/notes.ts. */
export function createMockVoiceNotes(publicUrl: string): VoiceNotes {
  let n = 0;
  return {
    transcribe: async () => ({ transcript: "(voice note)", notes: null }),
    speak: async () => ({ url: `${publicUrl}/media/mock_${++n}.mp3` }),
  };
}

/** Stage-0 in-memory Memory. Lane B replaces it with the Postgres graph + vector store in memory/index.ts. */
export function createInMemoryMemory(): Memory {
  const facts = new Map<string, FactView[]>();
  const memories = new Map<string, MemoryView[]>();
  const list = <T>(m: Map<string, T[]>, k: string) => m.get(k) ?? (m.set(k, []), m.get(k)!);
  return {
    async remember() {},
    async rememberFact(learnerId, { rel, object }) {
      const fs = list(facts, learnerId).filter((f) => !(f.rel === rel && f.object === object));
      fs.push({ rel, object, weight: 1, updated_at: new Date().toISOString() });
      facts.set(learnerId, fs);
    },
    async recall(learnerId) {
      const fs = list(facts, learnerId);
      return {
        facts: fs.map((f) => factSentence(f.rel, f.object)),
        memories: list(memories, learnerId).map((m) => m.text),
        struggles: fs.filter((f) => f.rel === "struggles_with").map((f) => f.object).reverse(),
      };
    },
    async profile(learnerId) {
      return { facts: [...list(facts, learnerId)], memories: [...list(memories, learnerId)] };
    },
    async forget(learnerId) {
      facts.delete(learnerId);
      memories.delete(learnerId);
    },
  };
}
