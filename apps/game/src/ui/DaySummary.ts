import { MISSIONS, type MissionKey, type PlayerState } from "@backpack/shared";
import { masteredPhrases } from "./Backpack";
import { el, isVisible, setVisible } from "./dom";
import { MISSION_SHORT, starString } from "./Hud";

/** The Hostel's end-of-day card: phrases learned, stars per mission, euros left, tomorrow's map. */
export class DaySummary {
  readonly root = el("div", "panel summary hidden");
  private body = el("div");

  constructor(parent: HTMLElement) {
    this.root.id = "day-summary";
    const close = el("button", "", "Bonne nuit ☾ (Esc)");
    close.addEventListener("click", () => this.toggle(false));
    this.root.append(el("h3", "", "Fin de la journée"), this.body, close);
    parent.appendChild(this.root);
  }

  get open() {
    return isVisible(this.root);
  }

  toggle(force?: boolean) {
    setVisible(this.root, force ?? !this.open);
  }

  render(state: PlayerState | null) {
    if (!state) return this.body.replaceChildren(el("div", "small", "No trip yet."));
    const learned = masteredPhrases(state);
    const row = (label: string, value: string, attr: [string, string]) => {
      const r = el("div", "row");
      r.dataset[attr[0]] = attr[1];
      r.append(el("span", "", label), el("span", attr[0] === "mission" ? "stars" : "", value));
      return r;
    };
    const missions = (Object.keys(MISSIONS) as MissionKey[]).map((key) => {
      const m = state.missions.find((x) => x.mission_key === key);
      const value = m?.status === "done" || (m?.stars ?? 0) > 0 ? starString(m!.stars) : "not yet";
      return row(`${MISSION_SHORT[key]}: ${MISSIONS[key].goal}`, value, ["mission", key]);
    });
    const market = state.unlocks.includes("market");
    this.body.replaceChildren(
      row("Phrases learned", String(learned.length), ["stat", "phrases"]),
      el("div", "small", learned.map((p) => p.text_fr).join(" · ") || "None yet: talk to people!"),
      ...missions,
      row("Euros left", `€${state.player.euros}`, ["stat", "euros"]),
      el("div", "small tomorrow", market ? "Tomorrow: the market is open. Haggle in French!" : "Tomorrow: the market is still closed."),
    );
  }
}
