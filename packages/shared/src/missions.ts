import type { MissionKey, NpcId } from "./ids";

export interface MissionDef {
  key: MissionKey;
  npc: NpcId;
  goal: string;
  required: string[];
  bonus: string[];
  next: MissionKey | null;
}

export const MISSIONS: Record<MissionKey, MissionDef> = {
  sim_kiosk: {
    key: "sim_kiosk",
    npc: "clerk",
    goal: "Buy a SIM card",
    required: ["bonjour", "je voudrais une carte SIM"],
    bonus: ["merci"],
    next: "cafe_order",
  },
  cafe_order: {
    key: "cafe_order",
    npc: "barista",
    goal: "Order a coffee",
    required: ["bonjour", "je voudrais un café", "s'il vous plaît"],
    bonus: ["c'est combien ?", "merci"],
    next: null,
  },
};

export const MISSION_FOR_NPC: Partial<Record<NpcId, MissionKey>> = {
  clerk: "sim_kiosk",
  barista: "cafe_order",
};

/** Lowercase, strip accents and punctuation, so beginner speech matches target phrases on intent. */
export function normalizePhrase(s: string): string {
  return s
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9' ]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/** English glosses shown on backpack items. */
export const GLOSSARY: Record<string, string> = {
  bonjour: "hello",
  merci: "thank you",
  "je voudrais une carte SIM": "I would like a SIM card",
  "je voudrais un café": "I would like a coffee",
  "je voudrais": "I would like",
  "s'il vous plaît": "please",
  "c'est combien ?": "how much is it?",
};
