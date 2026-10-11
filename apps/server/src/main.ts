import { loadConfig } from "./config";
import { createApp, createDeps } from "./app";
import { attachVoiceBridge } from "./voice";

const config = loadConfig();
const deps = createDeps(config);
const server = createApp(deps).listen(config.port, () => {
  console.log(
    `[backpack] server on :${config.port} (mockGemini=${config.mockGemini}, mockDial=${config.mockDial}, voice=${config.voiceMode})`,
  );
});
// Self-hosted audio: Dial streams every call to wss://<PUBLIC_HOST>/dial/voice/<call_id>, voiced by ElevenLabs.
if (config.voiceMode === "selfhosted") attachVoiceBridge(server, deps);
