/**
 * Dial Self-Hosted AUDIO mode for Luna's ElevenLabs voice (see docs/SELF_HOSTED_VOICE.md).
 *
 * Usage: pnpm exec tsx scripts/dial/self-hosted.ts <command>
 *   status                     GET /v1/self-hosted: access, active mode, saved configs
 *   request-access "<use case>" ask Dial to enable Self-Hosted for this account (a human reviews it)
 *   save <wss-url>             persist the audio config (mints the signing secret on first save)
 *   secret                     print the audio signing secret as a DIAL_SELF_HOSTED_SECRET= line for .env
 *   activate <wss-url>         save + route ALL calls (inbound and outbound) to our /dial/voice socket
 *   disable                    back to Dial's managed voice agent (the rollback)
 *
 * <wss-url> is the public base, e.g. wss://<tunnel>/dial/voice (an https:// base gets /dial/voice appended).
 * Dial appends /<call_id> per call.
 */
import { dialFromEnv, fail, objectOf } from "./lib";

/** μ-law 8 kHz both ways: native telephony, and ElevenLabs Agents speaks ulaw_8000 in and out, so no transcoding. */
export const AUDIO_FORMAT = "mulaw_8000";

function wsUrlFrom(arg: string | undefined): string {
  if (!arg) fail("Missing <wss-url>, e.g. wss://<your-tunnel>/dial/voice");
  let url = arg.replace(/\/+$/, "");
  if (url.startsWith("https://")) url = `wss://${url.slice("https://".length)}`;
  if (!url.startsWith("wss://")) fail(`The URL must be wss:// (or an https:// base): ${arg}`);
  if (!/\/dial\/voice$/.test(url)) url += "/dial/voice";
  return url;
}

const audioConfig = (wsUrl: string) => ({
  type: "audio",
  wsUrl,
  audioInboundFormat: AUDIO_FORMAT,
  audioOutboundFormat: AUDIO_FORMAT,
});

function printSecret(body: unknown) {
  const o = objectOf<Record<string, unknown>>(body, "secret", "data");
  const s = [o.secret, o.signingSecret, o.signing_secret, typeof body === "string" ? body : undefined].find(
    (v): v is string => typeof v === "string" && v.length > 0,
  );
  if (!s) return console.log("No secret in the response: copy it from https://getdial.ai/dashboard/self-hosted (audio mode).");
  console.log("\nPaste this line into .env at the repo root, then restart the server:\n");
  console.log(`DIAL_SELF_HOSTED_SECRET=${s}\n`);
}

async function main() {
  const [cmd, arg] = process.argv.slice(2);
  const dial = dialFromEnv();
  switch (cmd) {
    case "status":
      return console.log(JSON.stringify(await dial("GET", "/v1/self-hosted"), null, 2));
    case "request-access":
      if (!arg) fail('Usage: self-hosted.ts request-access "<what you are building and who you call>"');
      return console.log(JSON.stringify(await dial("POST", "/v1/self-hosted", { action: "request_access", useCase: arg }), null, 2));
    case "save": {
      const config = audioConfig(wsUrlFrom(arg));
      await dial("POST", "/v1/self-hosted", { action: "save", config });
      console.log(`Saved the audio config → ${config.wsUrl} (${AUDIO_FORMAT} both ways). Next: secret, then activate.`);
      return;
    }
    case "secret":
      if (process.env.DIAL_SELF_HOSTED_SECRET) console.log("Note: DIAL_SELF_HOSTED_SECRET is already set in .env.");
      return printSecret(await dial("GET", "/v1/self-hosted/secret?mode=audio"));
    case "activate": {
      if (!process.env.DIAL_SELF_HOSTED_SECRET) fail("Set DIAL_SELF_HOSTED_SECRET in .env first (run: secret), or every call will be rejected.");
      const config = audioConfig(wsUrlFrom(arg));
      await dial("POST", "/v1/self-hosted", { action: "activate", config });
      console.log(`Activated: ALL calls now stream to ${config.wsUrl}/<call_id>. Run with VOICE_MODE=selfhosted. Roll back: disable.`);
      return;
    }
    case "disable":
      await dial("POST", "/v1/self-hosted", { action: "disable" });
      console.log("Self-Hosted disabled: calls use Dial's managed voice agent again. Set VOICE_MODE=managed.");
      return;
    default:
      fail("Usage: tsx scripts/dial/self-hosted.ts status | request-access <use case> | save <wss-url> | secret | activate <wss-url> | disable");
  }
}

main().catch(fail);
