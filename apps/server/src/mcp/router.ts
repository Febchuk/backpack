import { Router } from "express";
import type { Deps } from "../app";

/** L0 stub. Backend lane: MCP Streamable HTTP server with the five tools in docs/CONTRACT.md. */
export function mcpRouter(_deps: Deps) {
  const r = Router();
  r.post("/mcp", (_req, res) => res.status(501).json({ ok: false, error: "mcp not implemented" }));
  return r;
}
