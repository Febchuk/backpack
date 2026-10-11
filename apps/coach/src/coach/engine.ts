import type { Deps } from "../app";
import type { Engine } from "./contract";

/** Lane A: inbound text/voice note → event → recall → Llm.reply → send → remember (async). Also onboarding. */
export function createEngine(_deps: Omit<Deps, "engine">): Engine {
  const missing = async () => {
    throw new Error("not implemented: coach/engine.ts (lane A)");
  };
  return { handleInbound: missing, startOnboarding: missing };
}
