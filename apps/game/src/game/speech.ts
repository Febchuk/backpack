/** Speaks NPC replies aloud with the browser's French voice. M mutes. */

import { ttsRateForLevel } from "../voice/ttsRate";

let muted = false;
let spoken = 0;

/** Higher is better: an exact fr-FR voice, then any French; network and "natural" voices beat robotic ones. */
function score(v: SpeechSynthesisVoice): number {
  const lang = v.lang.toLowerCase().replace("_", "-");
  if (!lang.startsWith("fr")) return -1;
  let s = lang === "fr-fr" ? 10 : 5;
  if (/natural|neural|premium|enhanced|google/i.test(v.name)) s += 4;
  if (/amélie|amelie|audrey|aurélie|marie|thomas|denise|henri/i.test(v.name)) s += 2;
  if (!v.localService) s += 1;
  return s;
}

export function pickFrenchVoice(voices: SpeechSynthesisVoice[]): SpeechSynthesisVoice | undefined {
  let best: SpeechSynthesisVoice | undefined;
  for (const v of voices) if (score(v) >= 0 && (!best || score(v) > score(best))) best = v;
  return best;
}

function synth(): SpeechSynthesis | null {
  return typeof window !== "undefined" && "speechSynthesis" in window ? window.speechSynthesis : null;
}

// Chrome loads voices lazily; touching getVoices() early starts the load.
synth()?.getVoices();

export const speech = {
  get muted() {
    return muted;
  },
  /** How many lines were handed to speechSynthesis (test hook). */
  get spoken() {
    return spoken;
  },
  speak(text: string, level?: number) {
    const s = synth();
    if (!s || muted || !text) return;
    s.cancel();
    const u = new SpeechSynthesisUtterance(text);
    u.lang = "fr-FR";
    u.rate = ttsRateForLevel(level);
    const voice = pickFrenchVoice(s.getVoices());
    if (voice) u.voice = voice;
    s.speak(u);
    spoken += 1;
  },
  toggleMute(): boolean {
    muted = !muted;
    if (muted) synth()?.cancel();
    return muted;
  },
};
