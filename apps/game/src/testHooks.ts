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
  /** L2: player center and its feet collision box, or null outside a gameplay scene. */
  player(): PlayerPos | null;
  /** L2: the current scene's collision boxes (edges in background pixels). */
  colliders(): Collider[];
  /** L2: voice and juice state. */
  fx(): BackpackFx;
  /** L3: NPCs placed in the current scene (talkable by walking up and holding SPACE). */
  npcs(): { id: NpcId; x: number; y: number }[];
}

export interface PlayerPos {
  x: number;
  y: number;
  body: { x1: number; y1: number; x2: number; y2: number };
}

export interface Collider {
  label: string;
  x1: number;
  y1: number;
  x2: number;
  y2: number;
}

export interface BackpackFx {
  /** ● REC is showing (SPACE held near an NPC, mic mode). */
  recording: boolean;
  /** The NPC the thinking bubble is over, while a turn is in flight. */
  thinking: string | null;
  /** Times the phone buzzed for a new Luna text. */
  buzzes: number;
  /** T: SPACE opens the text box instead of the mic. */
  textMode: boolean;
  /** M: replies are not spoken. */
  muted: boolean;
  /** Replies handed to speechSynthesis. */
  spoken: number;
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
  world():
    | {
        teleport(x: number, y: number): void;
        doors(): Door[];
        colliders(): Collider[];
        playerPos(): PlayerPos;
        thinkingBubble(): string | null;
        placedNpcs(): { id: NpcId; x: number; y: number }[];
      }
    | undefined;
  ui(): BackpackUi;
  fx(): Omit<BackpackFx, "thinking">;
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
    player: () => deps.world()?.playerPos() ?? null,
    colliders: () => deps.world()?.colliders() ?? [],
    fx: () => ({ ...deps.fx(), thinking: deps.world()?.thinkingBubble() ?? null }),
    npcs: () => deps.world()?.placedNpcs() ?? [],
  };
}
