import type { PlayerState } from "@backpack/shared";
import { el, isVisible, setVisible } from "./dom";
import { activeMission, missionLabel } from "./Phone";

/** Top-left stats, top-right key legend, the "Skip to evening" button and a toast line. */
export class Hud {
  private stats = el("div", "panel hud");
  private keys = el("div", "panel keys small", "WASD move · SPACE talk · P phone · B backpack");
  readonly skip = el("button", "skip hidden", "Skip to evening ☾");
  private toastEl = el("div", "toast hidden");
  private toastTimer: number | undefined;
  onSkip: () => void = () => {};

  constructor(parent: HTMLElement) {
    this.skip.id = "skip-evening";
    this.skip.addEventListener("click", () => this.onSkip());
    parent.append(this.stats, this.keys, this.skip, this.toastEl);
  }

  setVisible(visible: boolean) {
    setVisible(this.stats, visible);
    setVisible(this.keys, visible);
  }

  render(state: PlayerState | null, skipVisible: boolean) {
    const euros = state ? `€${state.player.euros}` : "€—";
    this.stats.textContent = `${euros}  ·  ${missionLabel(activeMission(state))}`;
    setVisible(this.skip, skipVisible);
  }

  get skipVisible() {
    return isVisible(this.skip);
  }

  toast(message: string, ms = 2500) {
    this.toastEl.textContent = message;
    setVisible(this.toastEl, true);
    window.clearTimeout(this.toastTimer);
    this.toastTimer = window.setTimeout(() => setVisible(this.toastEl, false), ms);
  }
}
