import type { PlayerState } from "@backpack/shared";
import { el, isVisible, setVisible } from "./dom";

export function masteredPhrases(state: PlayerState | null) {
  return state?.phrases.filter((p) => p.status === "mastered") ?? [];
}

/** Backpack (toggle with B): mastered phrases as inventory items. */
export class Backpack {
  readonly root = el("div", "panel backpack hidden");
  private list = el("div");

  constructor(parent: HTMLElement) {
    this.root.id = "backpack-panel";
    this.root.append(el("h3", "", "Backpack"), this.list);
    parent.appendChild(this.root);
  }

  get open() {
    return isVisible(this.root);
  }

  toggle(force?: boolean) {
    setVisible(this.root, force ?? !this.open);
  }

  render(state: PlayerState | null) {
    const items = masteredPhrases(state);
    this.list.replaceChildren(
      ...(items.length
        ? items.map((p) => {
            const item = el("div", "item", p.text_fr);
            if (p.text_en) item.append(el("div", "small", p.text_en));
            return item;
          })
        : [el("div", "small", "Empty. Master phrases to fill it.")]),
    );
  }
}
