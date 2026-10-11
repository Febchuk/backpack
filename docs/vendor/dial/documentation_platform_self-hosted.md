> For clean Markdown of any page, append .md to the page URL.
> For a complete documentation index, see https://docs.getdial.ai/llms.txt.
> For AI client integration (Claude Code, Cursor, etc.), connect to the MCP server at https://docs.getdial.ai/_mcp/server.

# Self-Hosted

> Bring your own agent. Point Dial at a WebSocket server you host — drive calls with your own LLM, or take the raw call audio and bring your entire voice stack.

**Self-Hosted mode** lets you bring your own agent infrastructure. Instead of Dial's managed agent
driving a call, Dial connects to a WebSocket server **you** host. It comes in two variants — one
is active at a time, for all of your account's calls:

* **LLM** (`"type": "llm"`) — Dial still handles the hard parts of voice: telephony,
  speech‑to‑text, text‑to‑speech, turn‑taking, and interruptions. Your server only answers one
  question, live: *given the conversation so far, what should the agent say next?* It speaks the
  [Self-hosted LLM protocol](/api-reference/self-hosted-protocol/overview) — transcripts in, text
  turns out.
* **Audio** (`"type": "audio"`) — Dial pipes the **raw call audio** to your server, full duplex,
  over the [Self-hosted audio protocol](/api-reference/self-hosted-audio-protocol/overview). You
  bring the entire voice stack: a speech-to-speech model (OpenAI Realtime, Gemini Live, …) or your
  own STT → LLM → TTS chain. Audio formats are configurable per direction (G.711 or linear PCM at
  8–24 kHz).

Either way, no voice-infrastructure details leak through — your server sees clean Dial-native
protocols and Dial call ids only.

## How it works

1. You host a WebSocket endpoint and configure Self-Hosted with its `wss://` URL and variant.
2. For each call, Dial opens a socket to `wss://<your-url>/<call_id>`, signed so you can verify
   it's from Dial.
3. **LLM:** Dial streams the live transcript and asks for the agent's turns; your server streams
   back the words to speak. **Audio:** Dial streams the caller's audio; your server streams back
   the agent's audio.

While Self-Hosted is on, it drives **all** of your account's calls — inbound and outbound.

## Request access

Self-Hosted hands the conversation to a server we don't run, so it's approved per account before
you can point calls at one.

Send one `request_access` action describing what you're building. A human reads it, so the more
concrete you are about who you'll be calling and why your own server needs to drive the
conversation, the faster it clears.

```bash
curl -X POST https://api.getdial.ai/v1/self-hosted \
  -H "Authorization: Bearer $DIAL_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{ "action": "request_access",
        "useCase": "We run appointment reminders for our own dental clinics. Our scheduling system already holds the availability, so the agent needs to answer from it live rather than from a static prompt.",
        "companyUrl": "https://example.com" }'
```

`GET /api/v1/self-hosted` reports where you stand in `access`:

| `access`  | What it means                                                                                |
| --------- | -------------------------------------------------------------------------------------------- |
| `none`    | No request on file yet — send one.                                                           |
| `pending` | Submitted and awaiting review.                                                               |
| `granted` | You can `save` and `activate` freely.                                                        |
| `denied`  | Reviewed and turned down; `accessRequest.reviewNote` says why. You may submit a new request. |

Until access is `granted`, `save` and `activate` return **403**. `disable` and `request_access`
always work, so an account can always switch Self-Hosted off.

## Enable it

Once access is granted, set it up from the
[dashboard Self-Hosted page](https://getdial.ai/dashboard/self-hosted), or via the API. LLM and
audio each have their **own independent config** — configure either without affecting the other.

Every change is a single `POST` with one `action`: **`save`** (persist a mode's config; mints that
mode's signing secret on the first URL), **`activate`** (save the config, then enable + route calls
through that mode — enable or switch), or **`disable`**.

```bash
# save the LLM mode's config
curl -X POST https://api.getdial.ai/v1/self-hosted \
  -H "Authorization: Bearer $DIAL_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{ "action": "save", "config": { "type": "llm", "wsUrl": "wss://my-agent.example.com/dial" } }'

# …or the audio mode's config
curl -X POST https://api.getdial.ai/v1/self-hosted \
  -H "Authorization: Bearer $DIAL_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{ "action": "save", "config": { "type": "audio", "wsUrl": "wss://my-voice.example.com/dial",
        "audioInboundFormat": "mulaw_8000", "audioOutboundFormat": "mulaw_8000" } }'
```

> **Note**
>
> `save` never changes which mode is active or whether Self-Hosted is on — it just persists that
> mode's config. Each mode has its own `wsUrl` and signing secret.

Copy that mode's signing secret — from the dashboard, or
`GET /api/v1/self-hosted/secret?mode=llm` — and wire up your server's signature verification with it
(each mode has its own secret). Then **`activate`**: the body is exactly a `save` (the mode's
config), and it *also* enables Self-Hosted and routes **all** your calls (inbound and outbound) at
that mode's server immediately — so make sure it's ready:

```bash
curl -X POST https://api.getdial.ai/v1/self-hosted \
  -H "Authorization: Bearer $DIAL_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{ "action": "activate", "config": { "type": "llm", "wsUrl": "wss://my-agent.example.com/dial" } }'
```

To switch modes, `activate` the other one — its config comes along in the same body (affects new
calls only). To turn Self-Hosted off, `disable`:

```bash
curl -X POST https://api.getdial.ai/v1/self-hosted \
  -H "Authorization: Bearer $DIAL_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{ "action": "activate", "config": { "type": "audio", "wsUrl": "wss://my-voice.example.com/dial",
        "audioInboundFormat": "mulaw_8000", "audioOutboundFormat": "mulaw_8000" } }'

curl -X POST https://api.getdial.ai/v1/self-hosted \
  -H "Authorization: Bearer $DIAL_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{ "action": "disable" }'
```

## Pipecat Cloud

If your voice agent runs on [Pipecat Cloud](https://docs.pipecat.ai/pipecat-cloud/introduction),
point the **audio** mode at the agent instead of a URL, and leave Pipecat's WebSocket token auth on
(`websocket_auth = "token"`). Before every connection Dial calls the agent's
[`/start`](https://docs.pipecat.ai/pipecat-cloud/guides/websocket-authentication) endpoint with your
Pipecat Cloud public key and connects with the single-use token it returns. That includes reconnecting
mid-call, so a token is never reused.

```bash
curl -X POST https://api.getdial.ai/v1/self-hosted \
  -H "Authorization: Bearer $DIAL_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{ "action": "activate", "config": { "type": "audio",
        "pipecatCloud": { "agentName": "my-voice-agent", "publicKey": "pk_..." },
        "audioInboundFormat": "mulaw_8000", "audioOutboundFormat": "mulaw_8000" } }'
```

`pipecatCloud` takes the place of `wsUrl`: send one or the other, and saving one clears the other.

> **Warning**
>
> Treat the Pipecat Cloud public key as a **secret**. Anyone who has it can start sessions on your
> agent, which Pipecat bills to you. Never share it, commit it, or put it in client-side code. Dial
> stores it encrypted and only ever shows it masked.

Your bot receives the call on the WebSocket and speaks the
[audio protocol](/api-reference/self-hosted-audio-protocol/overview). Start from the
[Pipecat Cloud echo playbook](https://github.com/GetDial-AI/playbooks/tree/main/self-hosted/pipecat-cloud-echo):
a ready-to-deploy bot with Pipecat Cloud's `bot(runner_args)` entrypoint and `DialFrameSerializer`,
which plays the caller's voice back so you can prove the whole path before adding any AI. Then swap
in your own pipeline; the [Pipecat playbook](https://github.com/GetDial-AI/playbooks/tree/main/self-hosted/pipecat-python)
has a full speech-to-text, LLM, and text-to-speech example. The `/start` body, `runner_args.body` in
your bot, carries `call_id`, `direction`, `from`, and `to`.

> **Warning**
>
> Set `min_agents` to at least `1` in `pcc-deploy.toml` for real traffic. With no warm agent, Pipecat
> accepts the connection but no bot is running to answer it. Dial notices the silence and reconnects
> to a warm agent, but the caller hears several seconds of nothing first.

Pipecat authenticates the connection with its token, so your bot doesn't need to verify
`X-Dial-Signature`.

### When a call fails

If Dial can't connect a call to your target, the call ends as `failed`, and its
[`failureReason`](/api-reference/calls/get-call) says why. The dashboard shows the same reason under
the call's status.

| `failureReason`               | What happened                                                                     | What to do                                        |
| ----------------------------- | --------------------------------------------------------------------------------- | ------------------------------------------------- |
| `self_hosted_key_rejected`    | Pipecat Cloud rejected the public key.                                            | Save the right key in Self-Hosted settings.       |
| `self_hosted_agent_not_found` | No Pipecat Cloud agent has that name.                                             | Check `agentName` against your `pcc-deploy.toml`. |
| `self_hosted_at_capacity`     | Your agent had no room for another session.                                       | Raise `max_agents`.                               |
| `self_hosted_unreachable`     | Your `wsUrl` server didn't accept the connection, or Pipecat Cloud didn't answer. | Check that your server or agent is up.            |

The same value is on the [`call.ended`](/api-reference/events/call-ended) and
[`call.status_changed`](/api-reference/events/call-status-changed) events.

### Cancelling a call before it connects

On an outbound call, Dial opens the socket to your server only once the callee answers. Until
then the call is `Queued` or `Ringing`, and you can cancel it with
[Stop a call](/api-reference/calls/stop-call) (`POST /api/v1/calls/{id}/stop`, authenticated with
your API key, like every other call endpoint). Your server is never contacted, nothing is
charged, and the call ends with `terminationType: "canceled"`.

```bash
curl -X POST https://api.getdial.ai/v1/calls/$CALL_ID/stop \
  -H "Authorization: Bearer $DIAL_API_KEY"
```

The request returns before the call is over. Wait for [`call.ended`](/api-reference/events/call-ended)
(it carries `canceled: true`) to know it has ended. If the callee answers in the instant before the
stop lands, the call is hung up instead: it ends as `completed` and is billed for the seconds it
was connected. The same endpoint hangs up a call that's already in progress — or send
[`end_call`](/api-reference/self-hosted-audio-protocol/ending-calls) from your socket.

## Verify every connection

Each connection carries an `X-Dial-Signature` header (HMAC‑SHA256 over `<timestamp>.<call_id>`
with your signing secret) — the same scheme in both variants. Your server should verify it and
reject stale or mismatched signatures. The [SDKs](/documentation/sdks/overview) ship a helper for
exactly this, plus the full protocols as ready-made schemas and server helpers — start there rather
than hand‑rolling the message types.

## Reference servers

Don't start from scratch. The
**[OpenAI WebSocket server](https://github.com/GetDial-AI/playbooks/tree/main/self-hosted/openai-node)**
in the Dial playbooks repo is a minimal, runnable LLM-variant server. It verifies the
`X-Dial-Signature`, drives each turn with the OpenAI SDK, echoes the `ping_pong` keepalive, and
focuses on **transcript interrupts** — cancelling the in‑flight reply when the caller speaks again so
the agent never talks over them. Run it, expose it with [ngrok](https://ngrok.com), and point
Self-Hosted at the tunnel's `wss://` URL:

```bash
git clone https://github.com/GetDial-AI/playbooks
cd playbooks/self-hosted/openai-node
npm install
cp .env.example .env   # OPENAI_API_KEY + your Dial signing secret
npm start              # listens on :8080
```

> **Warning**
>
> While Self-Hosted is on, managed features do not apply: built‑in agent tools and any
> [Context MCP](/documentation/platform/context-mcp) connections are **inert**, because the agent
> driving the call is yours. In the audio variant this extends to everything voice: transcripts,
> recordings, and call summaries are not produced — Dial never hears the conversation. Turn
> Self-Hosted off to return to the managed agent.

## Next steps

* **[Self-hosted LLM protocol](/api-reference/self-hosted-protocol/overview)** — the LLM-variant
  WebSocket contract: connection, signing, messages, streaming, interrupts, and resumability.
* **[Self-hosted audio protocol](/api-reference/self-hosted-audio-protocol/overview)** — the
  audio-variant contract: formats, media frames, barge-in, checkpoints, and reconnection.
* **[SDKs](/documentation/sdks/overview)** — protocol schemas, server helpers, and the signature
  helper for Node and Python.