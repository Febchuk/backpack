import { Router, type Response } from "express";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import type { Deps } from "../app";
import { createLunaMcpServer } from "./server";

/** Stateless MCP Streamable HTTP: a fresh server and transport per request. */
export function mcpRouter(deps: Deps) {
  const r = Router();
  r.post("/mcp", async (req, res) => {
    const server = createLunaMcpServer(deps, { userNumber: req.get("x-dial-user-number") });
    const transport = new StreamableHTTPServerTransport({ sessionIdGenerator: undefined });
    res.on("close", () => {
      void transport.close();
      void server.close();
    });
    try {
      await server.connect(transport);
      await transport.handleRequest(req, res, req.body);
    } catch (e) {
      console.error("[mcp]", e);
      if (!res.headersSent)
        res.status(500).json({ jsonrpc: "2.0", error: { code: -32603, message: "Internal server error" }, id: null });
    }
  });
  const notAllowed = (_req: unknown, res: Response) =>
    res.status(405).json({ jsonrpc: "2.0", error: { code: -32000, message: "Method not allowed." }, id: null });
  r.get("/mcp", notAllowed);
  r.delete("/mcp", notAllowed);
  return r;
}
