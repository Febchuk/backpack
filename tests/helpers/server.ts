import type { AddressInfo } from "node:net";
import type { Server } from "node:http";
import { loadConfig } from "../../apps/server/src/config";
import { createApp, createDeps, type Deps } from "../../apps/server/src/app";
import type { Adapters } from "../../apps/server/src/adapters/types";

export interface TestServer {
  url: string;
  deps: Deps;
  close(): Promise<void>;
  post(path: string, body?: unknown): Promise<Response>;
  get(path: string): Promise<Response>;
}

/** Boots the real Express app on an ephemeral port with an in-memory DB and mock adapters. */
export async function startTestServer(adapters?: Partial<Adapters>): Promise<TestServer> {
  const deps = createDeps(loadConfig({ dbPath: ":memory:", mockGemini: true, mockDial: true, isProduction: false }), adapters);
  const app = createApp(deps);
  const server: Server = await new Promise((resolve) => {
    const s = app.listen(0, () => resolve(s));
  });
  const url = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  return {
    url,
    deps,
    close: () => new Promise((r) => server.close(() => r())),
    post: (path, body = {}) =>
      fetch(url + path, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) }),
    get: (path) => fetch(url + path),
  };
}
