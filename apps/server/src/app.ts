import express from "express";
import type { Config } from "./config";
import type { Adapters } from "./adapters/types";
import { createGeminiAdapter } from "./adapters/gemini";
import { createDialAdapter } from "./adapters/dial";
import { openDb, type Db } from "./db/db";
import { playersRouter } from "./routes/players";
import { stateRouter } from "./routes/state";
import { npcRouter } from "./routes/npc";
import { activateRouter } from "./routes/activate";
import { skipEveningRouter } from "./routes/skipEvening";
import { dialWebhookRouter } from "./routes/dialWebhook";
import { devRouter } from "./routes/dev";
import { mcpRouter } from "./mcp/router";

export interface Deps {
  config: Config;
  db: Db;
  adapters: Adapters;
}

export function createDeps(config: Config, adapters?: Partial<Adapters>): Deps {
  return {
    config,
    db: openDb(config.dbPath),
    adapters: {
      gemini: adapters?.gemini ?? createGeminiAdapter(config),
      dial: adapters?.dial ?? createDialAdapter(config),
    },
  };
}

export function createApp(deps: Deps) {
  const app = express();
  app.use((req, res, next) => {
    res.setHeader("Access-Control-Allow-Origin", "*");
    res.setHeader("Access-Control-Allow-Headers", "*");
    res.setHeader("Access-Control-Allow-Methods", "GET,POST,OPTIONS");
    if (req.method === "OPTIONS") return res.sendStatus(204);
    next();
  });
  app.use(express.json({ limit: "2mb" }));
  app.get("/health", (_req, res) => res.json({ ok: true }));
  app.use(playersRouter(deps));
  app.use(stateRouter(deps));
  app.use(npcRouter(deps));
  app.use(activateRouter(deps));
  app.use(skipEveningRouter(deps));
  app.use(dialWebhookRouter(deps));
  app.use(mcpRouter(deps));
  if (!deps.config.isProduction) app.use(devRouter(deps));
  return app;
}
