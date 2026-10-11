import type Phaser from "phaser";
import type { NpcId, NpcTurnResponse, PlayerState } from "@backpack/shared";
import { store } from "./store";

export interface Door {
  name: string;
  to: string;
  x: number;
  y: number;
}

export interface BackpackHooks {
  scene(): string;
  playerId(): string | null;
  teleport(x: number, y: number): void;
  talk(npcId: NpcId, text: string): Promise<NpcTurnResponse>;
  submitPhone(phone: string): Promise<void>;
  skipEvening(): Promise<void>;
  state(): PlayerState | null;
  enter(scene: string): void;
  doors(): Door[];
  ui(): BackpackUi;
}

export interface BackpackUi {
  dialogue: string | null;
  phoneOpen: boolean;
  phoneFormOpen: boolean;
  messages: number;
  activeMission: string | null;
  backpack: string[];
  marketUnlocked: boolean;
  skipEveningVisible: boolean;
}

/**
 * What the hooks drive. main.ts passes the real game actions and UI, so every hook runs the same
 * code path as a player. Kept as plain function types so tests can import this file without
 * pulling in the whole game.
 */
export interface HookDeps {
  talk(npcId: NpcId, text: string): Promise<NpcTurnResponse>;
  submitPhone(phone: string): Promise<void>;
  skipEvening(): Promise<void>;
  /** The active gameplay scene, if any. */
  world(): { teleport(x: number, y: number): void; doors(): Door[] } | undefined;
  ui(): BackpackUi;
}

declare global {
  interface Window {
    __backpack?: BackpackHooks;
  }
}

/** Exposes test hooks (see docs/CONTRACT.md). Always installed, in dev and test. */
export function installTestHooks(game: Phaser.Game, deps: HookDeps) {
  window.__backpack = {
    scene: () => game.scene.getScenes(true).find((s) => s.scene.key !== "Boot")?.scene.key ?? "",
    playerId: () => store.playerId(),
    teleport: (x, y) => {
      const world = deps.world();
      if (!world) throw new Error("teleport: no gameplay scene is active");
      world.teleport(x, y);
    },
    talk: deps.talk,
    submitPhone: deps.submitPhone,
    skipEvening: deps.skipEvening,
    state: () => store.state,
    enter: (key) => {
      for (const s of game.scene.getScenes(true)) s.scene.stop();
      game.scene.start(key);
    },
    doors: () => deps.world()?.doors() ?? [],
    ui: deps.ui,
  };
}
