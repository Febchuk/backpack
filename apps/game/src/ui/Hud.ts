import type { PlayerState } from "@backpack/shared";
import { el, isVisible, setVisible } from "./dom";
import { activeMission, missionLabel } from "./Phone";

export interface KeyModes {
  textMode: boolean;
  muted: boolean;
}

/**
 * Top-left stats and phone icon, bottom-right key legend, the "Skip to evening" button, a toast line,
 * the incoming-call banner and the pulsing ● REC indicator.
 */
export class Hud {
  private stats = el("div", "panel hud");
  readonly phoneIcon = el("div", "panel phoneicon", "📱");
  private keys = el("div", "panel keys small");
  readonly skip = el("button", "skip hidden", "Skip to evening ☾");
  private toastEl = el("div", "toast hidden");
  private bannerEl = el("div", "banner hidden");
  readonly rec = el("div", "rec hidden", "● REC");
  private toastTimer: number | undefined;
  private bannerTimer: number | undefined;
  onSkip: () => void = () => {};
  onPhoneIcon: () => void = () => {};

  constructor(parent: HTMLElement) {
    this.skip.id = "skip-evening";
    this.phoneIcon.id = "phone-icon";
    this.rec.id = "rec";
    this.bannerEl.id = "call-banner";
    this.skip.addEventListener("click", () => this.onSkip());
    this.phoneIcon.addEventListener("click", () => this.onPhoneIcon());
    this.renderKeys({ textMode: false, muted: false });
    parent.append(this.stats, this.phoneIcon, this.keys, this.skip, this.toastEl, this.bannerEl, this.rec);
  }

  setVisible(visible: boolean) {
    setVisible(this.stats, visible);
    setVisible(this.phoneIcon, visible);
    setVisible(this.keys, visible);
  }

  render(state: PlayerState | null, skipVisible: boolean) {
    const euros = state ? `€${state.player.euros}` : "€—";
    this.stats.textContent = `${euros}  ·  ${missionLabel(activeMission(state))}`;
    setVisible(this.skip, skipVisible);
  }

  renderKeys(m: KeyModes) {
    const talk = m.textMode ? "SPACE type" : "hold SPACE talk";
    this.keys.textContent = `WASD move · ${talk} · T ${m.textMode ? "voice" : "text"} mode · M ${m.muted ? "unmute" : "mute"} · P phone · B backpack`;
  }

  get skipVisible() {
    return isVisible(this.skip);
  }

  setRecording(on: boolean) {
    setVisible(this.rec, on);
  }

  buzzIcon() {
    this.phoneIcon.classList.remove("buzz");
    void this.phoneIcon.offsetWidth; // restart the CSS animation
    this.phoneIcon.classList.add("buzz");
  }

  toast(message: string, ms = 2500) {
    this.toastEl.textContent = message;
    setVisible(this.toastEl, true);
    window.clearTimeout(this.toastTimer);
    this.toastTimer = window.setTimeout(() => setVisible(this.toastEl, false), ms);
  }

  /** A second, longer-lived line for "Luna is calling your phone…", so text-message toasts don't hide it. */
  banner(message: string, ms: number) {
    this.bannerEl.textContent = message;
    setVisible(this.bannerEl, true);
    window.clearTimeout(this.bannerTimer);
    this.bannerTimer = window.setTimeout(() => setVisible(this.bannerEl, false), ms);
  }
}
