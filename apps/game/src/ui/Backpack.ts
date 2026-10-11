import type { PlayerState } from "@backpack/shared";
import { el, isVisible, setVisible } from "./dom";

export function masteredPhrases(state: PlayerState | null) {
  return state?.phrases.filter((p) => p.status === "mastered") ?? [];
}

const NEW_MS = 4000;

/**
 * Backpack (toggle with B): mastered phrases as inventory items. Re-renders on every /state poll; a
 * phrase mastered since the last poll (in the game or on Luna's call) glows, and the HUD toasts it.
 */
export class Backpack {
  readonly root = el("div", "panel backpack hidden");
  private list = el("div");
  /** Phrases seen mastered so far; null until the first state, so a reload doesn't celebrate old items. */
  private known: Set<string> | null = null;
  private fresh = new Set<string>();
  private freshTimer: number | undefined;
  private signature = "";

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

  /** Renders the items and returns the phrases that are new since the previous state. */
  render(state: PlayerState | null): string[] {
    const items = masteredPhrases(state);
    const added = this.known && state ? items.map((p) => p.text_fr).filter((t) => !this.known!.has(t)) : [];
    if (state) this.known = new Set(items.map((p) => p.text_fr));
    if (added.length) {
      for (const t of added) this.fresh.add(t);
      window.clearTimeout(this.freshTimer);
      this.freshTimer = window.setTimeout(() => {
        this.fresh.clear();
        this.list.querySelectorAll(".new").forEach((node) => node.classList.remove("new"));
      }, NEW_MS);
    }
    // Polls usually change nothing: keep the DOM so the pop animation doesn't restart.
    const signature = JSON.stringify(items.map((p) => [p.text_fr, p.text_en]));
    if (signature === this.signature) return added;
    this.signature = signature;
    this.list.replaceChildren(
      ...(items.length
        ? items.map((p) => {
            const item = el("div", this.fresh.has(p.text_fr) ? "item new" : "item", p.text_fr);
            item.dataset.phrase = p.text_fr;
            if (p.text_en) item.append(el("div", "small", p.text_en));
            return item;
          })
        : [el("div", "small", "Empty. Master phrases to fill it.")]),
    );
    return added;
  }

  /** Forgets the seen set (a new player started). */
  reset() {
    this.known = null;
    this.fresh.clear();
  }
}
