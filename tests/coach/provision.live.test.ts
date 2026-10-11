// Live ElevenLabs checks for voice/provision.ts. Read-only plus design previews (nothing is saved to the account).
import { describe, expect, it } from "vitest";
import { loadConfig } from "../../apps/coach/src/config";
import { createRealVoiceProvisioner } from "../../apps/coach/src/voice/provision";
import { sampleText } from "../../apps/coach/src/coach/persona";

const LIVE = process.env.LIVE === "1" && !!process.env.ELEVENLABS_API_KEY;

describe.skipIf(!LIVE)("@live coach ElevenLabs provisioning", () => {
  const el = () => createRealVoiceProvisioner(loadConfig({ mockElevenLabs: false }));

  it("@live searches the shared library for French voices", async () => {
    const voices = await el().searchLibrary({ language: "fr-FR" });
    expect(voices.length).toBeGreaterThan(0);
    for (const v of voices) {
      expect(v.voice_id).toBeTruthy();
      expect(v.public_owner_id).toBeTruthy();
    }
  }, 30_000);

  it("@live designs three previews from a description and a French sample line", async () => {
    const previews = await el().design({
      language: "fr-FR",
      description: "A native French speaker. Warm woman from Lyon, early 30s, relaxed and clear.",
      sampleText: sampleText("fr-FR"),
    });
    expect(previews.length).toBeGreaterThan(0);
    for (const p of previews) {
      expect(p.generated_voice_id).toBeTruthy();
      expect(Buffer.from(p.audio_base_64, "base64").length).toBeGreaterThan(1000);
    }
  }, 90_000);
});
