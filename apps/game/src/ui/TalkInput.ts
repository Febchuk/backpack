import type { NpcId } from "@backpack/shared";
import { el, isVisible, setVisible } from "./dom";

/**
 * L1 text fallback for hold-to-talk: SPACE near an NPC opens this box, Enter sends, Escape cancels.
 * L2 swaps in mic audio.
 */
export class TalkInput {
  readonly root = el("div", "panel talk hidden");
  private label = el("h3");
  private input = el("input");
  private npcId: NpcId | null = null;
  onSubmit: (npcId: NpcId, text: string) => void = () => {};

  constructor(parent: HTMLElement) {
    this.input.placeholder = "Type what you'd say in French, then Enter";
    this.input.addEventListener("keydown", (e) => {
      e.stopPropagation();
      if (e.key === "Escape") this.close();
      if (e.key === "Enter" && this.npcId && this.input.value.trim()) {
        const npcId = this.npcId;
        const text = this.input.value.trim();
        this.close();
        this.onSubmit(npcId, text);
      }
    });
    this.root.append(this.label, this.input, el("div", "small", "Enter: say it · Esc: cancel"));
    parent.appendChild(this.root);
  }

  get open() {
    return isVisible(this.root);
  }

  show(npcId: NpcId, npcName: string) {
    this.npcId = npcId;
    this.label.textContent = `Talk to ${npcName}`;
    this.input.value = "";
    setVisible(this.root, true);
    this.input.focus();
  }

  close() {
    this.npcId = null;
    setVisible(this.root, false);
    this.input.blur();
  }
}
