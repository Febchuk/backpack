> For clean Markdown of any page, append .md to the page URL.
> For a complete documentation index, see https://docs.getdial.ai/llms.txt.
> For AI client integration (Claude Code, Cursor, etc.), connect to the MCP server at https://docs.getdial.ai/_mcp/server.

# Receive a voice call

> Let an AI voice answer calls to your Dial number, then read the transcript once the call ends.

When someone calls one of your Dial numbers, Dial **answers automatically** with an AI voice, using the number's `inboundInstruction` as the agent's system prompt. You set this when you [provision the number](/documentation/platform/manage-phone-numbers#purchase-a-number) and can change it any time with [`dial number set`](/documentation/platform/manage-phone-numbers#set-the-inbound-instruction). There's nothing to place and nothing to accept — the conversation runs on its own, and you observe it once it finishes.

## How it works

* **The call is answered for you.** Inbound calls are on by default for a provisioned number that has an `inboundInstruction`; the AI handles the conversation in real time. (Numbers provisioned before this field existed reject inbound calls until you set one.) A number whose [`callingEnabled` is `false`](/documentation/platform/manage-phone-numbers#turn-calling-off-for-a-number) does not connect inbound calls at all — the caller is never answered, and no `call.ended` event is emitted, because no call was accepted. A number with [`forwardTo` set](/documentation/platform/manage-phone-numbers#forward-inbound-calls-to-another-phone) rings that phone instead of answering with the AI.
* **The agent speaks the caller's language.** By default the language is detected from the caller's country prefix, and the agent handles both it and `en-US`. To pin every inbound call to a single language, set the number's [`inboundLanguage`](/documentation/platform/manage-phone-numbers#set-the-inbound-language).
* **You're notified when the call ends.** Dial emits a `call.ended` event carrying `direction: inbound`. To react while the call is still live — as it rings or is answered — listen for [`call.status_changed`](/api-reference/events/call-status-changed) instead.
* **The outcome looks like an outbound call.** Once it ends, the call's `status`, `duration`, and `transcript` are available.

> **Note**
>
> The event stream is **presence-based**, not at-least-once — a listener replays missed events only if it reconnects within 2 minutes. For guaranteed delivery, register an [at-least-once webhook](/documentation/platform/webhooks).

## Wait for an inbound call to end

Block until an inbound call wraps up, matching on `direction` so you skip your own outbound calls:

**`CLI`**

```bash title="CLI"
dial wait-for call.ended --field direction=inbound --timeout 120 --json
```

**`Python`**

```python title="Python"
from dial_sdk import DialClient, DialConfig

dial = DialClient(DialConfig(api_key="sk_live_..."))
async with dial.new_events_connection() as conn:
    async for event in conn:
        if event["type"] == "call.ended" and event["data"]["direction"] == "inbound":
            print("inbound call from", event["data"]["from"], "ended:", event["data"]["status"])
            break
```

**`Node`**

```typescript title="Node"
import { DialClient } from "@getdial/sdk";

const dial = new DialClient({ apiKey: process.env.DIAL_API_KEY! });
const conn = await dial.newEventsConnection();
try {
  for await (const event of conn) {
    if (event.type === "call.ended" && event.data.direction === "inbound") {
      console.log("inbound call from", event.data.from, "ended:", event.data.status);
      break;
    }
  }
} finally {
  await conn.close();
}
```

**`cURL`**

```bash title="cURL"
curl -X POST https://api.getdial.ai/v1/events/wait \
  -H "Authorization: Bearer sk_live_..." \
  -H "Content-Type: application/json" \
  -d '{"eventType":"call.ended","timeout":120}'
```

The CLI's `--field` and `--regex` flags filter on event fields, so you only wake for inbound calls. To keep a continuous listener instead of a single wait, open a [live stream](/documentation/platform/stream-account-events).

## Read the transcript

The `call.ended` event tells you a call finished; the transcript and other details live on the call record. The transcript is produced a moment later — when it's ready, Dial fires a separate [`call.transcribed`](/api-reference/events/call-transcribed) event for that call (only for calls that produced a transcript; cancelled / no-answer / failed calls emit `call.ended` only). Wait for `call.transcribed` if you need the transcript itself, then fetch the call. `GET /api/v1/calls` returns both inbound and outbound calls, newest first — filter on the `direction` field to keep just the inbound ones:

```bash
curl https://api.getdial.ai/v1/calls \
  -H "Authorization: Bearer sk_live_..."
```

Each call carries its `status`, `duration`, and `transcript` — the same fields you get for an [outbound call](/documentation/capabilities/place-a-voice-call).

## Next

#### [Place a voice call](/documentation/capabilities/place-a-voice-call)

Make an outbound AI voice call.

#### [Stream account events](/documentation/platform/stream-account-events)

Keep a long-lived connection open.