import express from "express";
import type { Config } from "./config";
import { openDb, type Db } from "./db/db";
import { repo, type Repo } from "./db/repo";
import type { DialClient, Embedder, Engine, Llm, Memory, Tts, VoiceNotes, VoiceProvisioner } from "./coach/contract";
import { createDial } from "./dial/client";
import { createLlm } from "./llm/gemini";
import { createEmbedder } from "./memory/embed";
import { createMemory } from "./memory/index";
import { createTts } from "./voice/tts";
import { createVoiceNotes } from "./voice/notes";
import { createVoiceProvisioner } from "./voice/provision";
import { createEngine } from "./coach/engine";
import { createDemoEngine } from "./demo/engine";
import { dialWebhookRouter } from "./dial/webhook";
import { mediaRouter } from "./routes/media";
import { apiRouter } from "./routes/api";

export interface Deps {
  config: Config;
  db: Db;
  repo: Repo;
  dial: DialClient;
  llm: Llm;
  embedder: Embedder;
  memory: Memory;
  tts: Tts;
  voiceNotes: VoiceNotes;
  provisioner: VoiceProvisioner;
  engine: Engine;
}

/** Any dependency can be overridden (tests inject recording mocks); the rest follow the config's MOCK_* flags. */
export async function createDeps(config: Config, overrides: Partial<Omit<Deps, "config">> = {}): Promise<Deps> {
  const db = overrides.db ?? (await openDb({ databaseUrl: config.databaseUrl, pgliteDir: config.pgliteDir }));
  const r = overrides.repo ?? repo(db);
  const dial = overrides.dial ?? createDial(config);
  const llm = overrides.llm ?? createLlm(config);
  const embedder = overrides.embedder ?? createEmbedder(config);
  const memory = overrides.memory ?? createMemory({ db, repo: r, llm, embedder });
  const tts = overrides.tts ?? createTts(config);
  const voiceNotes = overrides.voiceNotes ?? createVoiceNotes({ config, repo: r, llm, tts });
  const provisioner = overrides.provisioner ?? createVoiceProvisioner(config);
  const base = { config, db, repo: r, dial, llm, embedder, memory, tts, voiceNotes, provisioner };
  return { ...base, engine: overrides.engine ?? (config.demo ? createDemoEngine(base) : createEngine(base)) };
}

export function createApp(deps: Deps) {
  const app = express();
  app.use((req, res, next) => {
    res.setHeader("Access-Control-Allow-Origin", "*");
    res.setHeader("Access-Control-Allow-Headers", "*");
    res.setHeader("Access-Control-Allow-Methods", "GET,POST,PATCH,DELETE,OPTIONS");
    if (req.method === "OPTIONS") return res.sendStatus(204);
    next();
  });
  app.use(express.json({ limit: "2mb", verify: (req, _res, buf) => ((req as unknown as { rawBody: string }).rawBody = buf.toString()) }));
  app.get("/health", (_req, res) => res.json({ ok: true }));
  app.use(dialWebhookRouter(deps));
  app.use(mediaRouter(deps));
  app.use(apiRouter(deps));
  return app;
}
