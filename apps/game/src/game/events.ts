import type { NpcId } from "@backpack/shared";

/** Which NPC we are waiting on (a turn is in flight), so the scene can show a thinking bubble over it. */
let thinking: NpcId | null = null;
const listeners = new Set<(npc: NpcId | null) => void>();

export function thinkingNpc(): NpcId | null {
  return thinking;
}

export function setThinking(npc: NpcId | null) {
  thinking = npc;
  for (const l of listeners) l(npc);
}

export function onThinking(l: (npc: NpcId | null) => void): () => void {
  listeners.add(l);
  return () => listeners.delete(l);
}
