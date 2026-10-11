import Phaser from "phaser";
import type { NpcId } from "@backpack/shared";
import { imageOrRect } from "../assets";
import { NPC_NAMES, talk } from "../game/actions";
import { onThinking, thinkingNpc } from "../game/events";
import { pushToTalk, voiceMode } from "../game/pushToTalk";
import { ui } from "../ui";
import type { Box, DoorDef, NpcDef, SceneLayout } from "./layouts/types";

export type { Box, DoorDef, NpcDef, SceneLayout } from "./layouts/types";

export const W = 960;
export const H = 540;
const SPEED = 160;
const TALK_RANGE = 56;
const CAMERA_LERP = 0.12;
/** The player and NPCs collide with their feet: a box at the bottom of the 32×32 sprite. */
const FEET = { w: 20, h: 12, offsetY: 18 };
const NPC_FEET = { w: 24, h: 14 };

export interface WorldConfig {
  bg: string;
  bgColor: number;
  layout: SceneLayout;
}

type Body = Phaser.Physics.Arcade.Body;
type Sprite = Phaser.GameObjects.Image | Phaser.GameObjects.Rectangle;

interface Npc {
  def: NpcDef;
  sprite: Sprite;
}

/**
 * Shared top-down scene: background, collision boxes from the scene's layout file, doors, idle NPCs,
 * a WASD player with a walk bob, camera follow, and hold-SPACE-to-talk (mic, or the text box fallback).
 */
export abstract class WorldScene extends Phaser.Scene {
  protected abstract readonly config: WorldConfig;
  protected player!: Phaser.GameObjects.Zone;
  private sprite!: Sprite;
  private spriteScale = { x: 1, y: 1 };
  private last = { x: 0, y: 0 };
  private npcs: Npc[] = [];
  private near: NpcDef | undefined;
  private keys!: Record<string, Phaser.Input.Keyboard.Key>;
  private prompt!: Phaser.GameObjects.Text;
  private bubble!: Phaser.GameObjects.Container;
  private bubbleNpc: NpcId | null = null;
  private recordingFor: NpcDef | null = null;
  private insideDoor: string | null = null;
  private leaving = false;

  create(data: { from?: string } = {}) {
    const { bg, bgColor, layout } = this.config;
    const hasBg = this.textures.exists(bg);
    imageOrRect(this, W / 2, H / 2, bg, W, H, bgColor).setDepth(-10);
    if (hasBg) for (const p of layout.patches ?? []) this.patch(bg, p.x1, p.y1, p.x2 - p.x1, p.y2 - p.y1, p.dy);

    this.physics.world.setBounds(0, 0, W, H);
    const solids: Phaser.GameObjects.GameObject[] = [];
    for (const b of layout.colliders) {
      const w = b.x2 - b.x1;
      const h = b.y2 - b.y1;
      const zone = this.add.zone(b.x1 + w / 2, b.y1 + h / 2, w, h);
      this.physics.add.existing(zone, true);
      solids.push(zone);
      if (!hasBg) {
        this.add.rectangle(zone.x, zone.y, w, h, 0x5c677d).setStrokeStyle(2, 0x000000, 0.7).setDepth(-5);
        if (w > 60 && h > 20) this.label(zone.x, zone.y, b.label, "#fff7e8").setDepth(-4);
      }
    }

    for (const d of layout.doors) {
      this.add.rectangle(d.x, d.y, d.w, d.h, 0xffd6a5, 0.2).setStrokeStyle(2, 0xffd6a5, 0.7).setDepth(-3);
    }

    this.npcs = layout.npcs.map((def) => {
      const sprite = imageOrRect(this, def.x, def.y, `npc_${def.id}`, 32, 32, def.color).setDepth(def.y);
      const feet = this.add.zone(def.x, def.y + 16 - NPC_FEET.h / 2, NPC_FEET.w, NPC_FEET.h);
      this.physics.add.existing(feet, true);
      solids.push(feet);
      this.label(def.x, def.y - 26, NPC_NAMES[def.id]).setDepth(1000);
      // Idle: a slow breathing bob, out of phase per NPC.
      this.tweens.add({
        targets: sprite,
        y: def.y - 2,
        duration: 700 + Math.random() * 300,
        delay: Math.random() * 600,
        yoyo: true,
        repeat: -1,
        ease: "Sine.easeInOut",
      });
      return { def, sprite };
    });

    const spawn = layout.spawns[data.from ?? ""] ?? layout.spawns.default;
    this.player = this.add.zone(spawn.x, spawn.y, 32, 32);
    this.physics.add.existing(this.player);
    const body = this.player.body as Body;
    body.setSize(FEET.w, FEET.h).setOffset((32 - FEET.w) / 2, FEET.offsetY);
    body.setCollideWorldBounds(true);
    this.sprite = imageOrRect(this, spawn.x, spawn.y, "player", 32, 32, 0x4fa3ff);
    this.spriteScale = { x: this.sprite.scaleX, y: this.sprite.scaleY };
    this.last = { x: spawn.x, y: spawn.y };
    this.physics.add.collider(this.player, solids);

    const cam = this.cameras.main;
    cam.setBounds(0, 0, W, H);
    cam.startFollow(this.player, true, CAMERA_LERP, CAMERA_LERP);

    this.prompt = this.label(0, 0, "", "#a5ffd6").setDepth(1001).setVisible(false);
    this.bubble = this.makeBubble();
    this.keys = this.input.keyboard!.addKeys("W,A,S,D,UP,DOWN,LEFT,RIGHT", false) as Record<string, Phaser.Input.Keyboard.Key>;
    // Events, not JustDown: a quick tap can go down and up within one frame.
    // Plugin listeners are cleared on scene shutdown, so re-entering a scene doesn't stack them.
    this.input.keyboard!.on("keydown-SPACE", (e: KeyboardEvent) => this.onSpaceDown(e));
    this.input.keyboard!.on("keyup-SPACE", () => void this.onSpaceUp());

    const offThinking = onThinking((npc) => this.showThinking(npc));
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => {
      offThinking();
      if (this.recordingFor) {
        this.recordingFor = null;
        ui.setRecording(false);
        pushToTalk.cancel();
      }
    });
    this.showThinking(thinkingNpc());

    this.near = undefined;
    this.leaving = false;
    this.insideDoor = this.doorAt(spawn.x, spawn.y)?.name ?? null;
    ui.setScene(this.scene.key);
    this.setup();
  }

  /** Scene-specific extras (signs, store subscriptions). */
  protected setup() {}

  update(time: number) {
    if (!this.player.body) return;
    const body = this.player.body as Body;
    const k = this.keys;
    const typing = ui.isTyping();
    const dx = typing ? 0 : (k.D.isDown || k.RIGHT.isDown ? 1 : 0) - (k.A.isDown || k.LEFT.isDown ? 1 : 0);
    const dy = typing ? 0 : (k.S.isDown || k.DOWN.isDown ? 1 : 0) - (k.W.isDown || k.UP.isDown ? 1 : 0);
    // 4-direction: horizontal wins on diagonals.
    body.setVelocity(dx * SPEED, dx ? 0 : dy * SPEED);

    // Walk feel: hop and squash in step while actually moving (not when pushing into a wall).
    const moving = (dx !== 0 || dy !== 0) && Phaser.Math.Distance.Between(this.last.x, this.last.y, this.player.x, this.player.y) > 0.5;
    this.last = { x: this.player.x, y: this.player.y };
    const phase = Math.sin(time / 65);
    const bob = moving ? -Math.abs(phase) * 3 : 0;
    const squash = moving ? 1 - (1 - Math.abs(phase)) * 0.08 : 1;
    this.sprite
      .setPosition(this.player.x, this.player.y + bob)
      .setScale(this.spriteScale.x * (2 - squash), this.spriteScale.y * squash)
      .setDepth(this.player.y);
    if (dx && this.sprite instanceof Phaser.GameObjects.Image) this.sprite.setFlipX(dx < 0);

    this.checkDoors();
    this.updateNear(typing);
  }

  /** Test hook: move the player instantly; door overlap is checked on the next frame. */
  teleport(x: number, y: number) {
    (this.player.body as Body).reset(x, y);
    this.sprite.setPosition(x, y);
    this.last = { x, y };
  }

  doors() {
    return this.config.layout.doors.map(({ name, to, x, y }) => ({ name, to, x, y }));
  }

  colliders(): Box[] {
    return this.config.layout.colliders.map((b) => ({ ...b }));
  }

  /** Test hook: player center plus its feet collision box. */
  playerPos() {
    const b = this.player.body as Body;
    return { x: this.player.x, y: this.player.y, body: { x1: b.left, y1: b.top, x2: b.right, y2: b.bottom } };
  }

  /** The NPC the thinking bubble is over, if it is showing. */
  thinkingBubble(): NpcId | null {
    return this.bubble.visible ? this.bubbleNpc : null;
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

  // ── Talking ────────────────────────────────────────────────────────────────

  private onSpaceDown(e: KeyboardEvent) {
    if (e.repeat || this.recordingFor || pushToTalk.active || !this.near || ui.isTyping()) return;
    const npc = this.near;
    this.faceNpc(npc.id);
    if (voiceMode.textMode) return ui.talkInput.show(npc.id, NPC_NAMES[npc.id]);
    this.recordingFor = npc;
    ui.setRecording(true);
    pushToTalk.begin();
  }

  private async onSpaceUp() {
    const npc = this.recordingFor;
    if (!npc) return;
    this.recordingFor = null;
    ui.setRecording(false);
    const result = await pushToTalk.end();
    if (!this.scene.isActive() || this.leaving) return;
    if (result.kind === "audio") {
      void talk(npc.id, { audio: result.blob }).catch(() => {});
      return;
    }
    if (result.reason === "mic") ui.toast("Mic unavailable: type instead (T switches to text mode)", 3500);
    ui.talkInput.show(npc.id, NPC_NAMES[npc.id]);
  }

  /** NPC turns toward the player with a little hop. */
  private faceNpc(id: NpcId) {
    const npc = this.npcs.find((n) => n.def.id === id);
    if (!npc) return;
    if (npc.sprite instanceof Phaser.GameObjects.Image) npc.sprite.setFlipX(this.player.x < npc.def.x);
    this.tweens.add({ targets: npc.sprite, scaleY: 1.12, duration: 90, yoyo: true });
  }

  private makeBubble() {
    const g = this.add.graphics();
    g.fillStyle(0x000000, 0.35).fillRoundedRect(-17, -11, 38, 24, 6);
    g.fillStyle(0xfff8e7, 1).lineStyle(2, 0x1b1c2e, 1);
    g.fillRoundedRect(-19, -13, 38, 24, 6).strokeRoundedRect(-19, -13, 38, 24, 6);
    g.fillTriangle(-4, 10, 4, 10, -2, 17).lineBetween(-4, 11, -2, 17).lineBetween(4, 11, -2, 17);
    const dots = [-9, 0, 9].map((x) => this.add.circle(x, -1, 3, 0x1b1c2e));
    dots.forEach((dot, i) =>
      this.tweens.add({ targets: dot, y: -5, alpha: 0.3, duration: 260, delay: i * 130, yoyo: true, repeat: -1, repeatDelay: 140 }),
    );
    return this.add.container(0, 0, [g, ...dots]).setDepth(1003).setVisible(false);
  }

  private showThinking(npcId: NpcId | null) {
    const npc = npcId ? this.npcs.find((n) => n.def.id === npcId) : undefined;
    this.bubbleNpc = npc ? npc.def.id : null;
    this.bubble.setVisible(!!npc);
    if (!npc) return;
    this.faceNpc(npc.def.id);
    this.bubble.setPosition(npc.def.x + 12, npc.def.y - 52).setScale(0.6);
    this.tweens.add({ targets: this.bubble, scale: 1, duration: 140, ease: "Back.easeOut" });
  }

  // ── Doors and proximity ───────────────────────────────────────────────────

  /** Draws a copy of the background, shifted by `dy`, over (x, y, w, h). */
  private patch(bg: string, x: number, y: number, w: number, h: number, dy: number) {
    this.add.image(0, -dy, bg).setOrigin(0).setCrop(x, y + dy, w, h).setDepth(-9);
  }

  private doorAt(x: number, y: number): DoorDef | undefined {
    return this.config.layout.doors.find((d) => Math.abs(x - d.x) <= d.w / 2 && Math.abs(y - d.y) <= d.h / 2);
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
    for (const { def } of this.npcs) {
      const d = Phaser.Math.Distance.Between(this.player.x, this.player.y, def.x, def.y);
      if (d <= best) {
        best = d;
        this.near = def;
      }
    }
    const show = !!this.near && !typing && !this.bubble.visible;
    this.prompt.setVisible(show);
    if (!this.near || !show) return;
    const text = this.recordingFor ? "listening… release SPACE" : voiceMode.textMode ? "[SPACE] type" : "hold [SPACE] talk";
    this.prompt.setText(text).setPosition(this.near.x, this.near.y - 44);
  }
}

/** The active gameplay scene, if any. */
export function activeWorld(game: Phaser.Game): WorldScene | undefined {
  return game.scene.getScenes(true).find((s): s is WorldScene => s instanceof WorldScene);
}
