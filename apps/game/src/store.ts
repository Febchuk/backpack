import type { PlayerState } from "@backpack/shared";

const KEY = "backpack.player_id";

/** Tiny shared client store: the latest polled PlayerState plus listeners. */
export const store = {
  state: null as PlayerState | null,
  listeners: new Set<(s: PlayerState) => void>(),
  playerId(): string | null {
    try {
      return localStorage.getItem(KEY);
    } catch {
      return null;
    }
  },
  setPlayerId(id: string) {
    try {
      localStorage.setItem(KEY, id);
    } catch {}
  },
  set(s: PlayerState) {
    this.state = s;
    for (const l of this.listeners) l(s);
  },
  subscribe(l: (s: PlayerState) => void): () => void {
    this.listeners.add(l);
    return () => this.listeners.delete(l);
  },
};
