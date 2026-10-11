/**
 * End-to-end smoke test through OUR server: creates a player and activates it with TEST_PHONE,
 * which places Luna's real intro call and SMS when the server runs with MOCK_DIAL=0.
 *
 * Usage: pnpm exec tsx scripts/dial/smoke-call.ts [SERVER_URL]   (default http://localhost:$PORT or :8787)
 */
import "dotenv/config";

async function post(url: string, body: unknown) {
  const res = await fetch(url, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });
  const json = (await res.json().catch(() => ({}))) as Record<string, unknown>;
  if (!res.ok) throw new Error(`POST ${url} → ${res.status} ${JSON.stringify(json)}`);
  return json;
}

async function main() {
  const phone = process.env.TEST_PHONE;
  if (!phone) throw new Error("Set TEST_PHONE (E.164, e.g. +15551234567) in .env");
  const server = (process.argv[2] ?? `http://localhost:${process.env.PORT ?? 8787}`).replace(/\/+$/, "");
  const started = Date.now();
  const player = (await post(`${server}/players`, {})) as { player?: { id?: string } };
  const playerId = player.player?.id;
  if (!playerId) throw new Error("POST /players returned no player id");
  console.log(`player ${playerId}`);
  const { call_id } = await post(`${server}/activate`, { player_id: playerId, phone });
  console.log(`intro call ${call_id} placed to ${phone} in ${Date.now() - started} ms`);
  if (String(call_id).startsWith("mock_")) console.log("(mock id: the server is running with MOCK_DIAL=1)");
}

main().catch((e) => {
  console.error(e instanceof Error ? e.message : e);
  process.exit(1);
});
