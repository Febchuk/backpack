import { MISSIONS, type MissionKey, type PlayerState } from "@backpack/shared";
import { el, isVisible, setVisible } from "./dom";
import { activeMission, missionLabel } from "./Phone";

export interface KeyModes {
  textMode: boolean;
  muted: boolean;
}

/** Short HUD names for missions. */
export const MISSION_SHORT: Record<MissionKey, string> = { sim_kiosk: "SIM", cafe_order: "Café" };

export function starString(stars: number): string {
  const n = Math.max(0, Math.min(3, stars));
  return "★".repeat(n) + "☆".repeat(3 - n);
}

/** Missions worth showing stars for: done ones, plus any that already have stars (Luna's award_star). */
export function starredMissions(state: PlayerState | null) {
  return (state?.missions ?? []).filter((m) => m.mission_key in MISSIONS && (m.status === "done" || m.stars > 0));
}

/**
 * Top-left stats (euros with a live delta, active mission, stars per mission) and phone icon,
 * bottom-right key legend, the "Skip to evening" button, a toast line, the incoming-call banner and
 * the pulsing ● REC indicator.
 */
export class Hud {
  private stats = el("div", "panel hud");
  private euros = el("span", "euros", "€—");
  private delta = el("span", "delta hidden");
  private mission = el("span");
  private stars = el("span", "stars hidden");
  readonly phoneIcon = el("div", "panel phoneicon", "📱");
  private keys = el("div", "panel keys small");
  readonly skip = el("button", "skip hidden", "Skip to evening ☾");
  private toastEl = el("div", "toast hidden");
  private bannerEl = el("div", "banner hidden");
  readonly rec = el("div", "rec hidden", "● REC");
  private toastTimer: number | undefined;
  private bannerTimer: number | undefined;
  private deltaTimer: number | undefined;
  private lastEuros: number | null = null;
  private lastPlayer: string | null = null;
  onSkip: () => void = () => {};
  onPhoneIcon: () => void = () => {};

  constructor(parent: HTMLElement) {
    this.skip.id = "skip-evening";
    this.phoneIcon.id = "phone-icon";
    this.rec.id = "rec";
    this.bannerEl.id = "call-banner";
    this.euros.id = "hud-euros";
    this.delta.id = "hud-euro-delta";
    this.stars.id = "hud-stars";
    this.stats.append(this.euros, this.delta, el("span", "", "  ·  "), this.mission, this.stars);
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
    this.renderEuros(state);
    this.mission.textContent = missionLabel(activeMission(state));
    const starred = starredMissions(state);
    this.stars.replaceChildren(
      ...starred.map((m) => {
        const row = el("span", "star", `${MISSION_SHORT[m.mission_key as MissionKey]} ${starString(m.stars)}`);
        row.dataset.mission = m.mission_key;
        return row;
      }),
    );
    setVisible(this.stars, starred.length > 0);
    setVisible(this.skip, skipVisible);
  }

  /** Euros, with a floating "-€3" and a coin flash whenever the balance moves. */
  private renderEuros(state: PlayerState | null) {
    if (!state) {
      this.euros.textContent = "€—";
      return;
    }
    const { id, euros } = state.player;
    if (id !== this.lastPlayer) {
      this.lastPlayer = id;
      this.lastEuros = null;
    }
    this.euros.textContent = `€${euros}`;
    const diff = this.lastEuros === null ? 0 : euros - this.lastEuros;
    this.lastEuros = euros;
    if (!diff) return;
    this.delta.textContent = diff < 0 ? ` -€${-diff}` : ` +€${diff}`;
    this.delta.className = `delta ${diff < 0 ? "down" : "up"}`;
    this.euros.classList.remove("flash");
    void this.euros.offsetWidth; // restart the CSS animation
    this.euros.classList.add("flash");
    window.clearTimeout(this.deltaTimer);
    this.deltaTimer = window.setTimeout(() => setVisible(this.delta, false), 2500);
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
