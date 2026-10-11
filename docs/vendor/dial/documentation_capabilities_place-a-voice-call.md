> For clean Markdown of any page, append .md to the page URL.
> For a complete documentation index, see https://docs.getdial.ai/llms.txt.
> For AI client integration (Claude Code, Cursor, etc.), connect to the MCP server at https://docs.getdial.ai/_mcp/server.

# Place a voice call

> Place an outbound AI voice call with a system prompt, language, and voice.

Place an outbound voice call that an AI voice agent handles in real time. You provide an **outbound instruction** — the system prompt describing how the agent should behave — and a **language** for the conversation. The call is placed from one of your Dial numbers (`fromNumberId`).

**`CLI`**

```bash title="CLI"
dial call \
  --to +14155550123 \
  --outbound-instruction "You are confirming a dinner reservation for 7pm." \
  --language en-US \
  --from-number-id pn_123
```

**`Node`**

```typescript title="Node"
import { DialClient } from "@getdial/sdk";

const dial = new DialClient({ apiKey: process.env.DIAL_API_KEY! });
const call = await dial.makeCall({
  to: "+14155550123",
  fromNumberId: "pn_123",
  outboundInstruction: "You are confirming a dinner reservation for 7pm.",
  language: "en-US",
});
console.log(call.id, call.status);
```

**`Python`**

```python title="Python"
from dial_sdk import DialClient, DialConfig

dial = DialClient(DialConfig(api_key="sk_live_..."))
call = await dial.make_call(
    to="+14155550123",
    from_number_id="pn_123",
    outbound_instruction="You are confirming a dinner reservation for 7pm.",
    language="en-US",
)
print(call.id, call.status)
```

**`LangChain`**

```python title="LangChain"
from dial_langchain import MakeCallTool

call = MakeCallTool(api_key="sk_live_...")
await call.ainvoke({
    "to": "+14155550123",
    "from_number_id": "pn_123",
    "outbound_instruction": "You are confirming a dinner reservation for 7pm.",
    "language": "en-US",
})
```

**`cURL`**

```bash title="cURL"
curl -X POST https://api.getdial.ai/v1/calls \
  -H "Authorization: Bearer sk_live_..." \
  -H "Content-Type: application/json" \
  -d '{
    "to": "+14155550123",
    "fromNumberId": "pn_123",
    "outboundInstruction": "You are confirming a dinner reservation for 7pm.",
    "language": "en-US"
  }'
```

The call returns immediately, with `status.state` of `Queued`. The conversation runs on its own; once it ends, the call's final `status`, `duration`, and transcript are available via `GET /api/v1/calls` or by listening for the `call.ended` [event](/documentation/platform/stream-account-events). However the call ends — completed, failed, or cancelled — it emits exactly one `call.ended` carrying the terminal `status`, so a wait always resolves; a cancelled call additionally carries `canceled: true`. To end a call early — cancel it while it's still ringing, or hang up one in progress — use [Stop a call](/api-reference/calls/stop-call).

The transcript arrives in two shapes on the call record. `transcript` is the flat text of the conversation. `transcriptTurns` is the same conversation split into timed turns, each carrying a `speaker` (`agent`, `user`, or `transfer_target` for a human the call was handed off to), its `text`, and approximate `startMs`/`endMs` offsets in milliseconds into the call's audio. Reach for the turns when you want to analyse how the call went rather than just what was said: the pause before a turn is its `startMs` minus the previous turn's `endMs`, so long silences become measurable.

> **Warning**
>
> Placing a call isn't idempotent — there's no idempotency key, so a retry places a **second** call. If a request fails ambiguously, [confirm before retrying](/documentation/reference/errors#retries-and-idempotency) rather than blind-retrying.

## Choosing the voice and prompt

You shape each call **per request** — the same number can run a reservation-confirming call and a survey call by sending a different `outboundInstruction` each time. (The number's `inboundInstruction` is separate — it only governs calls *into* the number.)

* **Outbound instruction** — the system prompt for how the AI should behave on this call. This is the main lever you control.
* **Language** — a language tag such as `en-US`. The CLI defaults to `en-US`.
* **Voice** — each Dial number speaks with a preset voice, applied automatically; you don't set it per call.

```python
# Same number, different behavior per call.
await dial.make_call(
    to="+14155550123",
    from_number_id="pn_123",
    outbound_instruction="You are a friendly assistant running a 3-question survey.",
    language="en-US",
)
```

## Transferring the call to a human

Pass a `transferTo` number (E.164) to have the agent **forward the call to a person** once the conversation reaches the right moment. The agent rides out hold music and automated menus, and cold-transfers the moment a real human is on the line — it won't hand off to a recording or an IVR. The destination must differ from both `to` and the call's from number.

When the hand-off happens, the call's `transferredAt` timestamp is stamped; you can read it on the `Call` object via `GET /api/v1/calls`.

**`CLI`**

```bash title="CLI"
dial call \
  --to +14155550123 \
  --outbound-instruction "Greet the customer, then connect them to our agent." \
  --transfer-to +14155550100 \
  --from-number-id pn_123
```

**`Node`**

```typescript title="Node"
const call = await dial.makeCall({
  to: "+14155550123",
  fromNumberId: "pn_123",
  outboundInstruction: "Greet the customer, then connect them to our agent.",
  transferTo: "+14155550100",
});
```

**`Python`**

```python title="Python"
call = await dial.make_call(
    to="+14155550123",
    from_number_id="pn_123",
    outbound_instruction="Greet the customer, then connect them to our agent.",
    transfer_to="+14155550100",
)
```

**`LangChain`**

```python title="LangChain"
await call.ainvoke({
    "to": "+14155550123",
    "from_number_id": "pn_123",
    "outbound_instruction": "Greet the customer, then connect them to our agent.",
    "transfer_to": "+14155550100",
})
```

**`cURL`**

```bash title="cURL"
curl -X POST https://api.getdial.ai/v1/calls \
  -H "Authorization: Bearer sk_live_..." \
  -H "Content-Type: application/json" \
  -d '{
    "to": "+14155550123",
    "fromNumberId": "pn_123",
    "outboundInstruction": "Greet the customer, then connect them to our agent.",
    "transferTo": "+14155550100"
  }'
```

## Navigating phone menus

When a call reaches an automated phone menu ("press 1 for sales, press 2 for support…"), the agent can **press keypad digits** (DTMF) to get through it — choosing a menu option, entering an extension, or pressing `#` to confirm. There's nothing to enable: the agent listens to the full menu, then presses whatever digits your `outboundInstruction` calls for. Tell it which branch you want and what to do once it gets there:

**`CLI`**

```bash title="CLI"
dial call \
  --to +14155550123 \
  --outbound-instruction "If a phone menu answers, listen to every option and choose billing. Once a person picks up, ask for the status of invoice 1042." \
  --from-number-id pn_123
```

**`Python`**

```python title="Python"
call = await dial.make_call(
    to="+14155550123",
    from_number_id="pn_123",
    outbound_instruction=(
        "If a phone menu answers, listen to every option and choose billing. "
        "Once a person picks up, ask for the status of invoice 1042."
    ),
)
```

A few things to know:

* **Say what to aim for, not which key.** Menus change and differ by caller; naming the goal ("billing", "leave a voicemail", "an operator") lets the agent pick the right digit from what it actually hears.
* **Pressed digits don't appear in the transcript.** `transcript` and `transcriptTurns` carry what was said, so you see the menu read out and the prompt that followed the press — not the digit itself.
* **Combine it with `transferTo`** to navigate the menu and then hand the call to a person once a human answers (see [above](#transferring-the-call-to-a-human)).
* **Managed agent only.** In [Self-Hosted mode](/documentation/platform/self-hosted) your server drives the conversation, and neither self-hosted protocol can send digits today.

## When a number can't place calls

A call is refused before anything is dialed if the from-number can't place it:

* **`409 calling_disabled`** — calling is switched off for that number (`callingEnabled` is `false`). Nothing was dialed and nothing was billed. Switch it back on with [Update a phone number](/api-reference/rest-api/phone-numbers/update-number), or place the call from a different number.
* **`400`** — an iMessage number that is still being set up. Wait for its `setupStatus` to reach `ready`.
* **`403 unsupported_region`** — the from-number can only call US numbers and `to` is outside the US. Call a US number, or place the call from a different number.
* **`429 call_limit_reached`** — the from-number carries one call at a time and is already on a call. Retry once that call ends, or place the call from a different number.

Apart from the last, none of these clears on its own, so retrying the same call unchanged will keep failing. Read `callingEnabled` and `setupStatus` from [List phone numbers](/api-reference/rest-api/phone-numbers/list-numbers) to check before you dial.