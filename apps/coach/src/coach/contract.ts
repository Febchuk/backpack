/**
 * The seams between the coach's lanes. Each interface has a mock in `../mocks.ts` and a real implementation owned
 * by one lane. Change this file only by agreement: every lane builds against it.
 */
import type {
  DesignedPreview,
  FactView,
  Level,
  LibraryVoice,
  MemoryView,
  OnboardingStep,
  Relation,
} from "@backpack/shared/coach";
import type { Agent, Learner } from "../db/repo";

// ─── Dial (dial/client.ts) ────────────────────────────────────────────────────

export interface DialNumber {
  id: string;
  /** E.164; may be null while `setupStatus` is `provisioning`. */
  number: string | null;
  setupStatus: "provisioning" | "ready" | "failed";
}

export interface TranscriptTurn {
  speaker: "agent" | "learner";
  text: string;
}

export interface DialClient {
  /** `from` is the agent's Dial number id. A lone audio `mediaUrls` item is a native voice message on iMessage lines. */
  sendMessage(input: { from: string; to: string; body?: string; mediaUrls?: string[] }): Promise<{ id: string }>;
  /** In self-hosted audio mode the bridge voices the call; `instruction` is only Dial's fallback. */
  placeCall(input: { from: string; to: string; language: string; instruction: string }): Promise<{ call_id: string }>;
  getCall(callId: string): Promise<{ id: string; turns: TranscriptTurn[] }>;
  purchaseNumber(input: { consent: string; imessage: boolean; areaCode?: string; nickname?: string }): Promise<DialNumber>;
  getNumber(id: string): Promise<DialNumber>;
}

/** A normalized `message.received` (Dial `data`). */
export interface InboundMessage {
  messageId: string;
  from: string;
  to: string;
  body: string;
  media: { url: string; contentType: string }[];
}

// ─── LLM (llm/*.ts, combined in llm/gemini.ts) ────────────────────────────────

export interface ExtractedFact {
  rel: Relation;
  object: string;
  /** 0..1; memory drops facts below 0.6. */
  confidence: number;
}

export interface ReplyInput {
  system: string;
  /** Oldest first. */
  history: { role: "learner" | "agent"; text: string }[];
  message: string;
  /** During onboarding: the relations the current question is asking about, so the reply can extract them. */
  expectFacts?: Relation[];
}

export interface ReplyOutput {
  /** What the agent texts back, mostly in the target language at the learner's level. */
  reply: string;
  /** Gentle correction of the learner's message, or null if it was fine. */
  correction: string | null;
  /** True when the reply works better spoken (pronunciation, a phrase to repeat). */
  voice_reply: boolean;
  /** Facts the learner stated in this message. */
  facts: ExtractedFact[];
}

export interface Transcription {
  transcript: string;
  /** Pronunciation and grammar notes, in the learner's language, or null. */
  notes: string | null;
}

export interface Extraction {
  facts: ExtractedFact[];
  /** One self-contained sentence worth remembering about the learner, or null. */
  memory: string | null;
}

export interface Llm {
  reply(input: ReplyInput): Promise<ReplyOutput>;
  transcribeAudio(input: { audio: Buffer; mimeType: string; language: string; level: Level | null }): Promise<Transcription>;
  extractFacts(input: { text: string; language: string; known: string[] }): Promise<Extraction>;
}

// ─── Memory (memory/*) ────────────────────────────────────────────────────────

export interface Recall {
  /** Graph facts as short English sentences: "Travelling to Lyon", "Anxious about ordering food". */
  facts: string[];
  /** Top vector matches for the query. */
  memories: string[];
  /** Objects of `struggles_with` edges, most recent first. */
  struggles: string[];
}

export interface Embedder {
  readonly dims: 768;
  embed(texts: string[]): Promise<number[][]>;
}

export interface Memory {
  /** Extracts facts and a memory from a stored event. Callers fire-and-forget; it must never throw out. */
  remember(learnerId: string, eventId: string): Promise<void>;
  /** Writes one graph fact directly (onboarding answers, the call tool). */
  rememberFact(learnerId: string, fact: { rel: Relation; object: string }, evidenceEventId?: string | null): Promise<void>;
  recall(learnerId: string, query: string): Promise<Recall>;
  profile(learnerId: string): Promise<{ facts: FactView[]; memories: MemoryView[] }>;
  forget(learnerId: string): Promise<void>;
}

// ─── Voice (voice/*) ──────────────────────────────────────────────────────────

export interface Tts {
  synthesize(input: { voiceId: string; text: string; language: string }): Promise<{ audio: Buffer; mimeType: "audio/mpeg" }>;
}

/** Inbound and outbound voice notes. The engine only talks to this; lane C implements it. */
export interface VoiceNotes {
  /** Fetches the media URL and transcribes it. */
  transcribe(input: { url: string; contentType: string; agent: Agent; learner: Learner }): Promise<Transcription>;
  /** Synthesises `text` in the agent's voice and returns a public URL Dial can fetch. */
  speak(input: { text: string; agent: Agent; learner: Learner }): Promise<{ url: string }>;
}

export interface VoiceProvisioner {
  searchLibrary(input: { language: string; accent?: string; gender?: string }): Promise<LibraryVoice[]>;
  design(input: { language: string; description: string; sampleText: string }): Promise<DesignedPreview[]>;
  saveDesigned(input: { generatedVoiceId: string; name: string; description: string }): Promise<{ voice_id: string }>;
  addFromLibrary(input: { publicOwnerId: string; voiceId: string; name: string }): Promise<{ voice_id: string }>;
  /** Creates the ElevenLabs agent when `elAgentId` is null, else updates it. */
  upsertAgent(input: {
    elAgentId: string | null;
    name: string;
    language: string;
    voiceId: string;
    prompt: string;
    firstMessage: string;
  }): Promise<{ el_agent_id: string }>;
  deleteAgent(elAgentId: string): Promise<void>;
  deleteVoice(voiceId: string): Promise<void>;
}

// ─── Engine (coach/engine.ts) ─────────────────────────────────────────────────

export interface Engine {
  /** One inbound text or voice note → stored, answered, remembered. Idempotent on `msg.messageId`. */
  handleInbound(agent: Agent, learner: Learner, msg: InboundMessage): Promise<void>;
  /** Sends the first onboarding text to a newly registered learner. */
  startOnboarding(agent: Agent, learner: Learner): Promise<void>;
}

export type { OnboardingStep };
