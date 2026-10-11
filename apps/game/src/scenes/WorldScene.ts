import Phaser from "phaser";
import type { NpcId } from "@backpack/shared";
import { imageOrRect } from "../assets";
import { NPC_NAMES } from "../game/actions";
import { ui } from "../ui";

export const W = 960;
export const H = 540;
const WALL = 16;
const SPEED = 160;
const TALK_RANGE = 48;

export interface Rect {
  x: number; // center
  y: number;
  w: number;
  h: number;
}
export interface DoorDef extends Rect {
  name: string;
  to: string; // scene key; same as the current scene for area markers
}
export interface NpcDef {
  id: NpcId;
  x: number;
  y: number;
  color: number;
}
export interface SolidDef extends Rect {
  color: number;
  label?: string;
}
export interface WorldConfig {
  bg: string;
  bgColor: number;
  doors: DoorDef[];
  npcs: NpcDef[];
  /** Furniture and buildings: always collide; drawn only when there is no background art. */
  solids: SolidDef[];
  /** Spawn point keyed by the scene we came from, plus "default". */
  spawns: Record<string, { x: number; y: number }>;
}

type Body = Phaser.Physics.Arcade.Body;

/** Shared top-down scene: background, edge walls, doors, NPCs, a WASD player and SPACE-to-talk. */
export abstract class WorldScene extends Phaser.Scene {
  protected abstract readonly config: WorldConfig;
  protected player!: Phaser.GameObjects.Zone;
  private sprite!: Phaser.GameObjects.Image | Phaser.GameObjects.Rectangle;
  private near: NpcDef | undefined;
  private keys!: Record<string, Phaser.Input.Keyboard.Key>;
  private prompt!: Phaser.GameObjects.Text;
  private insideDoor: string | null = null;
  private leaving = false;

  create(data: { from?: string } = {}) {
    const c = this.config;
    const hasBg = this.textures.exists(c.bg);
    imageOrRect(this, W / 2, H / 2, c.bg, W, H, c.bgColor).setDepth(-10);

    const solids: Phaser.GameObjects.GameObject[] = [];
    const addSolid = (r: Rect) => {
      const zone = this.add.zone(r.x, r.y, r.w, r.h);
      this.physics.add.existing(zone, true);
      solids.push(zone);
    };
    // Invisible edge walls.
    addSolid({ x: W / 2, y: WALL / 2, w: W, h: WALL });
    addSolid({ x: W / 2, y: H - WALL / 2, w: W, h: WALL });
    addSolid({ x: WALL / 2, y: H / 2, w: WALL, h: H });
    addSolid({ x: W - WALL / 2, y: H / 2, w: WALL, h: H });
    for (const s of c.solids) {
      addSolid(s);
      if (!hasBg) {
        this.add.rectangle(s.x, s.y, s.w, s.h, s.color).setStrokeStyle(3, 0x000000, 0.7).setDepth(-5);
        if (s.label) this.label(s.x, s.y, s.label, "#fff7e8").setDepth(-4);
      }
    }

    for (const d of c.doors) {
      this.add.rectangle(d.x, d.y, d.w, d.h, 0xffd6a5, 0.25).setStrokeStyle(2, 0xffd6a5, 0.8).setDepth(-3);
    }

    for (const def of c.npcs) {
      const obj = imageOrRect(this, def.x, def.y, `npc_${def.id}`, 32, 32, def.color).setDepth(def.y);
      this.physics.add.existing(obj, true);
      solids.push(obj);
      this.label(def.x, def.y - 26, NPC_NAMES[def.id]).setDepth(1000);
    }

    const spawn = c.spawns[data.from ?? ""] ?? c.spawns.default;
    this.player = this.add.zone(spawn.x, spawn.y, 32, 32);
    this.physics.add.existing(this.player);
    (this.player.body as Body).setCollideWorldBounds(true);
    this.sprite = imageOrRect(this, spawn.x, spawn.y, "player", 32, 32, 0x4fa3ff);
    this.physics.add.collider(this.player, solids);

    this.prompt = this.label(0, 0, "[SPACE] talk", "#a5ffd6").setDepth(1001).setVisible(false);
    this.keys = this.input.keyboard!.addKeys("W,A,S,D,UP,DOWN,LEFT,RIGHT,SPACE", false) as Record<
      string,
      Phaser.Input.Keyboard.Key
    >;
    // An event, not JustDown: a quick tap can go down and up within one frame.
    // Plugin listeners are cleared on scene shutdown, so re-entering a scene doesn't stack them.
    this.input.keyboard!.on("keydown-SPACE", () => {
      if (this.near && !ui.isTyping()) ui.talkInput.show(this.near.id, NPC_NAMES[this.near.id]);
    });

    this.near = undefined;
    this.leaving = false;
    this.insideDoor = this.doorAt(spawn.x, spawn.y)?.name ?? null;
    ui.setScene(this.scene.key);
    this.setup();
  }

  /** Scene-specific extras (signs, store subscriptions). */
  protected setup() {}

  update(time: number) {
    const body = this.player.body as Body;
    const k = this.keys;
    const typing = ui.isTyping();
    const dx = typing ? 0 : (k.D.isDown || k.RIGHT.isDown ? 1 : 0) - (k.A.isDown || k.LEFT.isDown ? 1 : 0);
    const dy = typing ? 0 : (k.S.isDown || k.DOWN.isDown ? 1 : 0) - (k.W.isDown || k.UP.isDown ? 1 : 0);
    // 4-direction: horizontal wins on diagonals.
    body.setVelocity(dx * SPEED, dx ? 0 : dy * SPEED);

    const moving = dx !== 0 || dy !== 0;
    const bob = moving ? Math.round(Math.sin(time / 70) * 2) : 0;
    this.sprite.setPosition(this.player.x, this.player.y + bob).setDepth(this.player.y);
    if (dx && this.sprite instanceof Phaser.GameObjects.Image) this.sprite.setFlipX(dx < 0);

    this.checkDoors();
    this.updateNear(typing);
  }

  /** Test hook: move the player instantly; door overlap is checked on the next frame. */
  teleport(x: number, y: number) {
    (this.player.body as Body).reset(x, y);
    this.sprite.setPosition(x, y);
  }

  doors() {
    return this.config.doors.map(({ name, to, x, y }) => ({ name, to, x, y }));
  }

  /** Default door behavior: change scene. Street overrides for `cafe` and `market`. */
  protected onDoor(door: DoorDef) {
    if (door.to !== this.scene.key) this.go(door.to);
  }

  protected go(to: string) {
    if (this.leaving) return;
    this.leaving = true;
    ui.talkInput.close();
    this.scene.start(to, { from: this.scene.key });
  }

  /** Pushes the player back out of a door (e.g. a closed shop). */
  protected bounce(x: number, y: number) {
    this.teleport(x, y);
    this.insideDoor = this.doorAt(x, y)?.name ?? null;
  }

  protected label(x: number, y: number, text: string, color = "#ffffff") {
    return this.add
      .text(x, y, text, { fontFamily: "monospace", fontSize: "12px", color, backgroundColor: "#000000aa", padding: { x: 3, y: 1 } })
      .setOrigin(0.5);
  }

  private doorAt(x: number, y: number): DoorDef | undefined {
    return this.config.doors.find((d) => Math.abs(x - d.x) <= d.w / 2 && Math.abs(y - d.y) <= d.h / 2);
  }

  private checkDoors() {
    if (this.leaving) return;
    const door = this.doorAt(this.player.x, this.player.y);
    const name = door?.name ?? null;
    if (name === this.insideDoor) return;
    this.insideDoor = name;
    if (door) this.onDoor(door);
  }

  /** Tracks the closest NPC within talking range and shows the SPACE prompt over it. */
  private updateNear(typing: boolean) {
    let best = TALK_RANGE;
    this.near = undefined;
    for (const n of this.config.npcs) {
      const d = Phaser.Math.Distance.Between(this.player.x, this.player.y, n.x, n.y);
      if (d <= best) {
        best = d;
        this.near = n;
      }
    }
    this.prompt.setVisible(!!this.near && !typing);
    if (this.near) this.prompt.setPosition(this.near.x, this.near.y - 44);
  }
}

/** The active gameplay scene, if any. */
export function activeWorld(game: Phaser.Game): WorldScene | undefined {
  return game.scene.getScenes(true).find((s): s is WorldScene => s instanceof WorldScene);
}
