/** Contract between the coach server (apps/coach) and its console (apps/console). */

export const LANGUAGES = [
  { code: "fr-FR", name: "French", el: "fr" },
  { code: "es-ES", name: "Spanish", el: "es" },
  { code: "de-DE", name: "German", el: "de" },
  { code: "it-IT", name: "Italian", el: "it" },
  { code: "pt-PT", name: "Portuguese", el: "pt" },
  { code: "ja-JP", name: "Japanese", el: "ja" },
] as const;
export type LanguageCode = (typeof LANGUAGES)[number]["code"];

/** ElevenLabs takes ISO 639-1 ("fr"); Dial and our rows store BCP-47 ("fr-FR"). */
export function elLanguage(code: string): string {
  return code.split("-")[0].toLowerCase();
}

export const LEVELS = ["A1", "A2", "B1", "B2", "C1"] as const;
export type Level = (typeof LEVELS)[number];

/** The closed set of learner → object relations the knowledge graph stores. */
export const RELATIONS = [
  "goal",
  "trip_to",
  "trip_date",
  "interested_in",
  "likes",
  "dislikes",
  "travelling_with",
  "struggles_with",
  "knows_phrase",
  "anxious_about",
  "level",
] as const;
export type Relation = (typeof RELATIONS)[number];

export const ONBOARDING_STEPS = ["trip", "level", "activities", "worries", "done"] as const;
export type OnboardingStep = (typeof ONBOARDING_STEPS)[number];

export type SetupStatus = "none" | "provisioning" | "ready" | "failed";
export type Channel = "sms" | "voice_note" | "call";
export type VoiceSource = "library" | "designed";

export interface AgentView {
  id: string;
  name: string;
  language: string;
  persona_city: string;
  voice_id: string | null;
  voice_source: VoiceSource | null;
  voice_description: string | null;
  el_agent_id: string | null;
  dial_number_id: string | null;
  dial_number: string | null;
  setup_status: SetupStatus;
  created_at: string;
}

export interface LearnerView {
  id: string;
  agent_id: string;
  phone: string;
  display_name: string | null;
  level: Level | null;
  onboarding_step: OnboardingStep;
  created_at: string;
}

export interface EventView {
  id: string;
  channel: Channel;
  direction: "in" | "out";
  text: string;
  media_url: string | null;
  feedback: {
    correction?: string | null;
    transcript?: string | null;
    notes?: string | null;
    /** Demo mode: the scripted beat this message opens. */
    beat?: number;
    /** Demo mode: the itinerary the console renders as a card. */
    card?: ItineraryCard;
  } | null;
  created_at: string;
}

export interface ItineraryStop {
  time: string;
  title: string;
  detail: string;
  /** Shown as a badge, e.g. "Demo example" or "Illustrative access — requires venue confirmation". */
  badge?: string;
  links: { label: string; url: string }[];
}

export interface ItineraryCard {
  title: string;
  stops: ItineraryStop[];
}

export interface FactView {
  rel: Relation;
  object: string;
  weight: number;
  updated_at: string;
}

export interface MemoryView {
  id: string;
  text: string;
  source: string;
  created_at: string;
}

export interface LearnerMemoryView {
  learner: LearnerView;
  facts: FactView[];
  memories: MemoryView[];
  events: EventView[];
}

export interface LibraryVoice {
  voice_id: string;
  public_owner_id: string;
  name: string;
  accent: string | null;
  gender: string | null;
  age: string | null;
  description: string | null;
  preview_url: string | null;
}

export interface DesignedPreview {
  generated_voice_id: string;
  /** base64 mp3 the console can play as a data: URL */
  audio_base_64: string;
}

// ─── Request bodies ───────────────────────────────────────────────────────────

export interface CreateAgentBody {
  name: string;
  language: string;
  persona_city: string;
}

export interface BuyNumberBody {
  /** Text of the consent checkbox the operator ticked. Dial stores it as `explicitProgrammaticConsent`. */
  consent: string;
  imessage?: boolean;
  area_code?: string;
}

export type ProvisionVoiceBody =
  | { source: "library"; voice_id: string; public_owner_id: string; name: string }
  | { source: "designed"; generated_voice_id: string; name: string; description: string };

export interface DesignVoiceBody {
  language: string;
  description: string;
}

export interface AddLearnerBody {
  phone: string;
  display_name?: string;
}
