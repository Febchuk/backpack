import type Phaser from "phaser";
import type { NpcId, NpcTurnResponse, PlayerState } from "@backpack/shared";
import { store } from "./store";

export interface BackpackHooks {
  scene(): string;
  playerId(): string | null;
  teleport(x: number, y: number): void;
  talk(npcId: NpcId, text: string): Promise<NpcTurnResponse>;
  submitPhone(phone: string): Promise<void>;
  skipEvening(): Promise<void>;
  state(): PlayerState | null;
  enter(scene: string): void;
}

declare global {
  interface Window {
    __backpack?: BackpackHooks;
  }
}

const notYet = (name: string) => () => {
  throw new Error(`__backpack.${name} not implemented yet`);
};

/** Exposes test hooks (see docs/CONTRACT.md). Game lane fills in teleport/talk/submitPhone/skipEvening. */
export function installTestHooks(game: Phaser.Game, extra: Partial<BackpackHooks> = {}) {
  window.__backpack = {
    scene: () => game.scene.getScenes(true)[0]?.scene.key ?? "",
    playerId: () => store.playerId(),
    teleport: notYet("teleport"),
    talk: notYet("talk") as BackpackHooks["talk"],
    submitPhone: notYet("submitPhone") as BackpackHooks["submitPhone"],
    skipEvening: notYet("skipEvening") as BackpackHooks["skipEvening"],
    state: () => store.state,
    enter: (key) => {
      for (const s of game.scene.getScenes(true)) s.scene.stop();
      game.scene.start(key);
    },
    ...extra,
  };
}
