// L2 gate: real Gemini NPC turns, schema-checked, with p50/p95 latency against the
// PRD's 3 s target. Writes docs/LATENCY.md. Needs GEMINI_API_KEY in .env; makes ~16 API calls.
//
//   pnpm exec tsx scripts/gemini/latency.ts
//
// Optional audio turn: put a real recording of someone saying "Bonjour, je voudrais une carte SIM"
// at scripts/gemini/fixtures/bonjour.webm (e.g. saved from the game's hold-to-talk). Skipped if absent.
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { MISSIONS, NpcTurnResponse, type MissionKey, type NpcId } from "@backpack/shared";
import { loadConfig } from "../../apps/server/src/config";
import { createRealGeminiAdapter, DEFAULT_NPC_MODEL, fallbackTurn } from "../../apps/server/src/adapters/gemini";
import type { NpcTurnInput } from "../../apps/server/src/adapters/types";
import { PERSONAS } from "../../apps/server/src/npc/personas";
import { OPEN_PLAY_PHRASES } from "../../apps/server/src/npc/mockGrader";

const REPO = join(import.meta.dirname, "../..");
const OUT = join(REPO, "docs/LATENCY.md");
const AUDIO_FIXTURE = join(import.meta.dirname, "fixtures/bonjour.webm");
const TARGET_MS = 3000;

type Case = { npc: NpcId; kind: string; input: NpcTurnInput };

function missionInput(npc: NpcId, key: MissionKey, extra: Partial<NpcTurnInput>): NpcTurnInput {
  const m = MISSIONS[key];
  return {
    npcId: npc,
    persona: PERSONAS[npc],
    missionGoal: m.goal,
    targetPhrases: [...m.required, ...m.bonus],
    requiredPhrases: [...m.required],
    level: 1,
    ...extra,
  };
}

function openInput(npc: NpcId, text: string): NpcTurnInput {
  return { npcId: npc, persona: PERSONAS[npc], missionGoal: null, targetPhrases: OPEN_PLAY_PHRASES[npc], requiredPhrases: [], level: 1, text };
}

const clerk = (kind: string, text: string): Case => ({ npc: "clerk", kind, input: missionInput("clerk", "sim_kiosk", { text }) });
const barista = (kind: string, text: string): Case => ({ npc: "barista", kind, input: missionInput("barista", "cafe_order", { text }) });
const open = (npc: NpcId, kind: string, text: string): Case => ({ npc, kind, input: openInput(npc, text) });

const CASES: Case[] = [
  clerk("correct", "Bonjour, je voudrais une carte SIM, s'il vous plaît."),
  clerk("correct", "Bonjour ! Je voudrais une carte SIM. Merci beaucoup !"),
  clerk("partial", "Bonjour... euh... une carte SIM ?"),
  clerk("english-heavy", "Hi, um, bonjour, I need a SIM card for my phone please"),
  clerk("partial", "Je voudrais... the SIM card, merci"),
  barista("correct", "Bonjour, je voudrais un café, s'il vous plaît."),
  barista("partial", "Bonjour, je voudrais un café."),
  barista("english-heavy", "Hello, can I get un café please?"),
  barista("correct", "Bonjour ! C'est combien un café ? Je voudrais un café, s'il vous plaît. Merci !"),
  barista("partial", "Hello, coffee, s'il vous plaît"),
  open("girard", "greeting", "Bonjour monsieur ! Ça va ?"),
  open("girard", "small talk", "Il est mignon, votre chien !"),
  open("girard", "english-heavy", "Hello, euh, il fait beau today, non ?"),
  open("margaux", "polite", "Bonjour madame, une baguette, s'il vous plaît."),
  open("margaux", "rude", "Un croissant."),
  open("margaux", "english-heavy", "Hi, two croissants please, merci"),
];

interface Row {
  npc: string;
  kind: string;
  said: string;
  ms: number;
  schemaOk: boolean;
  fallback: boolean;
  retries: number;
  turn: NpcTurnResponse | null;
  error?: string;
}

function percentile(sorted: number[], p: number) {
  if (!sorted.length) return NaN;
  return sorted[Math.min(sorted.length - 1, Math.max(0, Math.ceil((p / 100) * sorted.length) - 1))];
}

async function runCase(adapter: ReturnType<typeof createRealGeminiAdapter>, c: Case, said: string): Promise<Row> {
  // The adapter logs a line per turn and a warning per failed attempt; capture them instead of interleaving.
  const warnings: string[] = [];
  const { log, warn } = console;
  console.log = () => {};
  console.warn = (...a: unknown[]) => void warnings.push(a.join(" "));
  const t0 = performance.now();
  try {
    const turn = await adapter.npcTurn(c.input);
    const ms = Math.round(performance.now() - t0);
    const schemaOk = NpcTurnResponse.safeParse(turn).success;
    // The adapter never throws: after two bad attempts it returns the in-character fallback. Count that as a failure.
    const fallback = warnings.length >= 2 && turn.reply_fr === fallbackTurn(c.input).reply_fr;
    return { npc: c.npc, kind: c.kind, said, ms, schemaOk, fallback, retries: warnings.length, turn, error: fallback ? warnings.at(-1) : undefined };
  } catch (e) {
    return { npc: c.npc, kind: c.kind, said, ms: Math.round(performance.now() - t0), schemaOk: false, fallback: false, retries: warnings.length, turn: null, error: (e as Error).message };
  } finally {
    console.log = log;
    console.warn = warn;
  }
}

const cell = (s: string) => s.replace(/\|/g, "\\|").replace(/\n/g, " ");

async function main() {
  const config = loadConfig({ mockGemini: false });
  if (!config.geminiApiKey) {
    console.error("GEMINI_API_KEY is not set. Add it to .env at the repo root.");
    process.exit(1);
  }
  const model = process.env.GEMINI_NPC_MODEL || DEFAULT_NPC_MODEL;
  const adapter = createRealGeminiAdapter(config);
  const rows: Row[] = [];

  console.log(`Gemini latency: ${CASES.length} text turns on ${model}, target p50 ≤ ${TARGET_MS} ms\n`);
  for (const c of CASES) {
    const r = await runCase(adapter, c, c.input.text!);
    rows.push(r);
    console.log(`${r.schemaOk && !r.fallback ? "✓" : "✗"} ${r.npc.padEnd(8)} ${String(r.ms).padStart(5)} ms  ${c.kind.padEnd(14)} ${r.error ?? ""}`);
  }

  let audioNote: string;
  if (existsSync(AUDIO_FIXTURE)) {
    const data = readFileSync(AUDIO_FIXTURE);
    const c: Case = { npc: "clerk", kind: "audio", input: missionInput("clerk", "sim_kiosk", { audio: { data, mimeType: "audio/webm" } }) };
    const r = await runCase(adapter, c, `(audio ${data.length} bytes)`);
    rows.push(r);
    audioNote = `Audio turn: ${r.ms} ms from scripts/gemini/fixtures/bonjour.webm, heard "${r.turn?.heard ?? ""}".`;
    console.log(`${r.schemaOk && !r.fallback ? "✓" : "✗"} clerk    ${String(r.ms).padStart(5)} ms  audio          heard="${r.turn?.heard ?? ""}"`);
  } else {
    audioNote = "Audio turn: skipped, no recording at scripts/gemini/fixtures/bonjour.webm (add a real one to time audio-in).";
    console.log(`\n(${audioNote})`);
  }

  const sorted = rows.map((r) => r.ms).sort((a, b) => a - b);
  const p50 = percentile(sorted, 50);
  const p95 = percentile(sorted, 95);
  const failed = rows.filter((r) => !r.schemaOk || r.fallback);
  const pass = p50 <= TARGET_MS && failed.length === 0;

  const table = [
    "| # | npc | kind | player said | ms | mission_complete | used | missed | retries | ok |",
    "|---|---|---|---|---:|---|---|---|---:|---|",
    ...rows.map((r, i) =>
      [
        i + 1,
        r.npc,
        r.kind,
        cell(r.said),
        r.ms,
        r.turn ? String(r.turn.mission_complete) : "-",
        cell(r.turn?.phrases_used.join(", ") ?? ""),
        cell(r.turn?.phrases_missed.join(", ") ?? ""),
        r.retries,
        r.schemaOk && !r.fallback ? "✓" : `✗ ${cell(r.error ?? "schema")}`,
      ].join(" | ").replace(/^/, "| ") + " |",
    ),
  ];
  const md = [
    "# Gemini NPC latency (L2 gate)",
    "",
    `Generated by \`pnpm exec tsx scripts/gemini/latency.ts\` on ${new Date().toISOString()}. Model: \`${model}\`. Real API calls, run sequentially; ms is wall-clock per turn including the adapter's single retry.`,
    "",
    `**p50 ${p50} ms, p95 ${p95} ms** over ${rows.length} turns. PRD target: p50 ≤ ${TARGET_MS} ms. Schema failures or fallbacks: ${failed.length}. **${pass ? "PASS" : "FAIL"}**`,
    "",
    audioNote,
    "",
    ...table,
    "",
  ].join("\n");
  writeFileSync(OUT, md);

  console.log(`\np50 ${p50} ms · p95 ${p95} ms · target ${TARGET_MS} ms · schema failures/fallbacks ${failed.length}`);
  console.log(`wrote docs/LATENCY.md → ${pass ? "PASS" : "FAIL"}`);
  if (!pass) process.exit(1);
}

main().catch((e) => {
  console.error(e instanceof Error ? e.message : e);
  process.exit(1);
});
