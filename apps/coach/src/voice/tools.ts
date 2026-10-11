import { RELATIONS, type Relation } from "@backpack/shared/coach";
import type { Memory } from "../coach/contract";

export type ToolResult = { ok: true; result: string } | { ok: false; error: string };

const isRelation = (v: unknown): v is Relation => typeof v === "string" && (RELATIONS as readonly string[]).includes(v);

/** Runs an ElevenLabs client tool (`get_learner_profile`, `remember_fact`) for the learner on the call. */
export async function runCallTool(memory: Memory, learnerId: string, name: string, params: Record<string, unknown>): Promise<ToolResult> {
  try {
    switch (name) {
      case "get_learner_profile": {
        const r = await memory.recall(learnerId, "phone call");
        const parts = [
          r.facts.length ? `Facts: ${r.facts.join("; ")}.` : "No facts yet.",
          r.memories.length ? `Memories: ${r.memories.join(" | ")}` : "",
          r.struggles.length ? `Struggles with: ${r.struggles.join(", ")}.` : "",
        ];
        return { ok: true, result: parts.filter(Boolean).join("\n") };
      }
      case "remember_fact": {
        const object = typeof params.object === "string" ? params.object.trim() : "";
        if (!isRelation(params.rel)) return { ok: false, error: `rel must be one of: ${RELATIONS.join(", ")}` };
        if (!object) return { ok: false, error: "object is required" };
        await memory.rememberFact(learnerId, { rel: params.rel, object: object.slice(0, 200) });
        return { ok: true, result: `Remembered: ${params.rel} ${object}` };
      }
      default:
        return { ok: false, error: `unknown tool ${name}` };
    }
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : String(e) };
  }
}
