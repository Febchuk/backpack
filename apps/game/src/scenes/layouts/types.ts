import type { NpcId } from "@backpack/shared";

/**
 * Scene layout data. Coordinates are background-art pixels (960×540).
 *
 * Collision boxes use edges (x1,y1 top-left → x2,y2 bottom-right) so they can be read straight off the
 * PNG. They are footprints: the player collides with its feet, so tall things (kiosks, beds, facades)
 * only need the part that touches the floor, and heads may overlap the art above it.
 */
export interface Box {
  label: string;
  x1: number;
  y1: number;
  x2: number;
  y2: number;
}

/** Covers drawn props with a copy of the background shifted by `dy` pixels (a clean stretch of floor). */
export interface Patch extends Box {
  dy: number;
}

/** A door trigger, centered on (x, y). `to` is the scene key, or the current scene for area markers. */
export interface DoorDef {
  name: string;
  to: string;
  x: number;
  y: number;
  w: number;
  h: number;
}

export interface NpcDef {
  id: NpcId;
  x: number;
  y: number;
  /** Fallback color when the sprite is missing. */
  color: number;
}

export interface SceneLayout {
  doors: DoorDef[];
  npcs: NpcDef[];
  colliders: Box[];
  patches?: Patch[];
  /** Spawn point keyed by the scene we came from, plus "default". */
  spawns: Record<string, { x: number; y: number }>;
}
