import { loadConfig } from "./config";
import { createApp, createDeps } from "./app";

const config = loadConfig();
const app = createApp(createDeps(config));
app.listen(config.port, () => {
  console.log(`[backpack] server on :${config.port} (mockGemini=${config.mockGemini}, mockDial=${config.mockDial})`);
});
