import { loadConfig } from "./config";
import { createApp, createDeps } from "./app";
import { attachVoiceBridge } from "./voice/bridge";

const config = loadConfig();
const deps = await createDeps(config);
const server = createApp(deps).listen(config.port, () => {
  console.log(
    `[coach] on :${config.port} (db=${config.databaseUrl ? "postgres" : "pglite"}, mockGemini=${config.mockGemini}, mockDial=${config.mockDial}, mockElevenLabs=${config.mockElevenLabs})`,
  );
});
// Self-hosted audio: Dial streams every call on the account to wss://<PUBLIC_HOST>/dial/voice/<call_id>.
attachVoiceBridge(server, deps);
