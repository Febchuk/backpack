import { MISSIONS, type MissionKey, type PlayerState } from "@backpack/shared";
import { el, isVisible, setVisible } from "./dom";

export function activeMission(state: PlayerState | null): string | null {
  return state?.missions.find((m) => m.status === "active")?.mission_key ?? null;
}

export function missionLabel(key: string | null): string {
  if (!key) return "Explore Paris";
  return MISSIONS[key as MissionKey]?.goal ?? key;
}

/** In-game phone (toggle with P): Luna's texts, newest last, plus the active mission. */
export class Phone {
  readonly root = el("div", "panel phone hidden");
  private mission = el("div", "small");
  private list = el("div");

  constructor(parent: HTMLElement) {
    this.root.append(el("h3", "", "Phone · Luna"), this.mission, this.list);
    parent.appendChild(this.root);
  }

  get open() {
    return isVisible(this.root);
  }

  toggle(force?: boolean) {
    setVisible(this.root, force ?? !this.open);
  }

  render(state: PlayerState | null) {
    this.mission.textContent = `Mission: ${missionLabel(activeMission(state))}`;
    this.list.replaceChildren(
      ...(state?.messages.length
        ? state.messages.map((m) => el("div", "msg", m.body))
        : [el("div", "small", "No messages yet.")]),
    );
    this.list.lastElementChild?.scrollIntoView?.({ block: "nearest" });
  }

  buzz() {
    this.root.classList.remove("buzz");
    void this.root.offsetWidth; // restart the CSS animation
    this.root.classList.add("buzz");
  }
}
