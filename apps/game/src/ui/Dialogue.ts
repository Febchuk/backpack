import type { NpcTurnResponse } from "@backpack/shared";
import { el, setVisible } from "./dom";

const TYPE_MS = 22;

/** Splits a leading `*stage direction*` (adaptive NPCs gesture for beginners) off the English hint. */
export function splitStageDirection(en: string): { stage: string | null; rest: string } {
  const m = /^\s*\*([^*]+)\*\s*/.exec(en);
  return m ? { stage: m[1].trim(), rest: en.slice(m[0].length) } : { stage: null, rest: en };
}

/** Bottom dialogue box: NPC name, typewriter French reply, English hint, and Luna's tip. */
export class Dialogue {
  readonly root = el("div", "panel dialogue hidden");
  private name = el("h3");
  private fr = el("div", "fr");
  private en = el("div", "small en");
  private hint = el("div", "hint");
  private timer: number | undefined;
  /** Full text of the current line (what the box is saying), or null when closed / thinking. */
  text: string | null = null;

  constructor(parent: HTMLElement) {
    this.root.append(this.name, this.fr, this.en, this.hint);
    parent.appendChild(this.root);
  }

  thinking(speaker: string) {
    this.open(speaker);
    this.text = null;
    let dots = 0;
    this.fr.textContent = "…";
    this.timer = window.setInterval(() => {
      dots = (dots + 1) % 4;
      this.fr.textContent = "…" + ".".repeat(dots);
    }, 250);
  }

  show(speaker: string, turn: NpcTurnResponse) {
    this.say(speaker, turn.reply_fr, turn.reply_en_hint, turn.hint ? `Luna: ${turn.hint}` : "");
  }

  say(speaker: string, fr: string, en = "", hint = "") {
    this.open(speaker);
    this.text = fr;
    const { stage, rest } = splitStageDirection(en);
    this.en.replaceChildren(...(stage ? [el("em", "stage", stage), ` ${rest}`] : [rest]));
    this.hint.textContent = hint;
    let i = 0;
    this.timer = window.setInterval(() => {
      i += 1;
      this.fr.textContent = fr.slice(0, i);
      if (i >= fr.length) this.stopTimer();
    }, TYPE_MS);
  }

  close() {
    this.stopTimer();
    this.text = null;
    setVisible(this.root, false);
  }

  private open(speaker: string) {
    this.stopTimer();
    this.name.textContent = speaker;
    this.fr.textContent = "";
    this.en.textContent = "";
    this.hint.textContent = "";
    setVisible(this.root, true);
  }

  private stopTimer() {
    if (this.timer !== undefined) window.clearInterval(this.timer);
    this.timer = undefined;
  }
}
