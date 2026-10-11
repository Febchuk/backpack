/**
 * Dial Self-Hosted AUDIO mode for the coach: every call on the Dial account streams to the coach's bridge, which
 * voices it with the ElevenLabs agent of the coach agent that owns the number (see docs/COACH.md, "Calls").
 * This takes calls away from the game's Luna on the same account.
 *
 * Usage (from the repo root): pnpm exec tsx scripts/coach/self-hosted.ts <command>
 *   status                      GET /v1/self-hosted: access, active mode, saved configs
 *   request-access "<use case>" ask Dial to enable Self-Hosted for this account (a human reviews it)
 *   save [<url>]                persist the audio config (mints the signing secret on first save)
 *   secret                      print the audio signing secret as a DIAL_SELF_HOSTED_SECRET= line for .env
 *   activate [<url>]            save + route ALL calls (inbound and outbound) to the coach's /dial/voice socket
 *   disable                     back to Dial's managed voice agent (the rollback)
 *
 * <url> defaults to PUBLIC_URL. A wss:// or https:// base works; /dial/voice is appended. Dial appends /<call_id>.
 */
import { dialFromEnv, fail, objectOf } from "../dial/lib";

/** μ-law 8 kHz both ways: native telephony, and ElevenLabs Agents speaks ulaw_8000 in and out, so no transcoding. */
export const AUDIO_FORMAT = "mulaw_8000";

function wsUrlFrom(arg: string | undefined): string {
  const base = arg ?? process.env.PUBLIC_URL;
  if (!base) fail("Missing <url> and PUBLIC_URL is not set, e.g. wss://<your-tunnel>/dial/voice");
  let url = base.replace(/\/+$/, "");
  if (url.startsWith("https://")) url = `wss://${url.slice("https://".length)}`;
  if (!url.startsWith("wss://")) fail(`The URL must be wss:// (or an https:// base): ${base}`);
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
  console.log("\nPaste this line into .env at the repo root, then restart the coach:\n");
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
      if (!process.env.ELEVENLABS_API_KEY) fail("Set ELEVENLABS_API_KEY in .env first, or the coach hangs up every call.");
      const config = audioConfig(wsUrlFrom(arg));
      await dial("POST", "/v1/self-hosted", { action: "activate", config });
      console.log(`Activated: ALL calls on this Dial account now stream to ${config.wsUrl}/<call_id>. Roll back: disable.`);
      return;
    }
    case "disable":
      await dial("POST", "/v1/self-hosted", { action: "disable" });
      console.log("Self-Hosted disabled: calls use Dial's managed voice agent again.");
      return;
    default:
      fail("Usage: tsx scripts/coach/self-hosted.ts status | request-access <use case> | save [<url>] | secret | activate [<url>] | disable");
  }
}

main().catch(fail);
