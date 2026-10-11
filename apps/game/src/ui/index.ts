import type { PlayerState } from "@backpack/shared";
import { store } from "../store";
import type { BackpackUi } from "../testHooks";
import { Backpack, masteredPhrases } from "./Backpack";
import { Dialogue } from "./Dialogue";
import { uiRoot } from "./dom";
import { Hud } from "./Hud";
import { activeMission, Phone } from "./Phone";
import { PhoneForm } from "./PhoneForm";
import { TalkInput } from "./TalkInput";

const GAMEPLAY_SCENES = new Set(["Airport", "Street", "Hostel"]);

/** All DOM UI, driven by the store and the active scene. One instance for the page. */
class Ui {
  private root = uiRoot();
  readonly hud = new Hud(this.root);
  readonly backpack = new Backpack(this.root);
  readonly phone = new Phone(this.root);
  readonly dialogue = new Dialogue(this.root);
  readonly talkInput = new TalkInput(this.root);
  readonly phoneForm = new PhoneForm(this.root);
  private scene = "Boot";
  private lastMessageCount: number | null = null;
  /** Called when a new Luna text arrives (main wires this to a camera shake). */
  onBuzz: () => void = () => {};

  constructor() {
    store.subscribe((s) => this.onState(s));
    window.addEventListener("keydown", (e) => {
      if (this.isTyping() || !GAMEPLAY_SCENES.has(this.scene)) return;
      const key = e.key.toLowerCase();
      if (key === "p") this.phone.toggle();
      if (key === "b") this.backpack.toggle();
      if (key === "escape") this.dialogue.close();
    });
    this.render();
  }

  setScene(key: string) {
    this.scene = key;
    this.render();
  }

  /** True while an HTML input has focus, so game keys don't move the player. */
  isTyping(): boolean {
    return document.activeElement instanceof HTMLInputElement;
  }

  toast(message: string) {
    this.hud.toast(message);
  }

  snapshot(): BackpackUi {
    const s = store.state;
    return {
      dialogue: this.dialogue.text,
      phoneOpen: this.phone.open,
      phoneFormOpen: this.phoneForm.open,
      messages: s?.messages.length ?? 0,
      activeMission: activeMission(s),
      backpack: masteredPhrases(s).map((p) => p.text_fr),
      marketUnlocked: s?.unlocks.includes("market") ?? false,
      skipEveningVisible: this.hud.skipVisible,
    };
  }

  private onState(s: PlayerState) {
    const count = s.messages.length;
    if (this.lastMessageCount !== null && count > this.lastMessageCount) {
      this.phone.buzz();
      this.toast("Bzzz — new text from Luna (press P)");
      this.onBuzz();
    }
    this.lastMessageCount = count;
    this.render();
  }

  private render() {
    const s = store.state;
    const cafeDone = s?.missions.some((m) => m.mission_key === "cafe_order" && m.status === "done") ?? false;
    this.hud.setVisible(GAMEPLAY_SCENES.has(this.scene));
    this.hud.render(s, this.scene === "Street" && cafeDone);
    this.phone.render(s);
    this.backpack.render(s);
  }
}

export const ui = new Ui();
