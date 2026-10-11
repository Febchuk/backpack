> For clean Markdown of any page, append .md to the page URL.
> For a complete documentation index, see https://docs.getdial.ai/llms.txt.
> For AI client integration (Claude Code, Cursor, etc.), connect to the MCP server at https://docs.getdial.ai/_mcp/server.

# Node SDK

> Use the @getdial/sdk TypeScript/Node client to send messages, place calls, and stream events.

The `@getdial/sdk` package is a typed client for Node and TypeScript.

#### [Full API reference](https://sdk.getdial.ai/ts)

Every class and method for `@getdial/sdk`, generated from the package source with examples.

## Install

```bash
npm install @getdial/sdk
```

## Construct a client

```typescript
import { DialClient } from "@getdial/sdk";

const dial = new DialClient({ apiKey: process.env.DIAL_API_KEY! });
// Optional: new DialClient({ apiKey, baseUrl: "https://api.getdial.ai" })
// Optional: new DialClient({ apiKey, userAgent: "my-app/1.1.1" })
```

### Identifying your application

If you're embedding the SDK in your own product or agent runtime, pass `userAgent` so your traffic is identifiable. It's **prepended** to the SDK's own `User-Agent`, which is always still sent:

```
User-Agent: my-app/1.1.1 @getdial/sdk/0.21.0
```

Use the conventional `name/version` form. The SDK does **not** read this from the environment — you pass it explicitly, exactly as you pass `apiKey`. Omit it and the header goes out unchanged.

## Core operations

```typescript
// List your numbers
const numbers = await dial.listNumbers();

// Send an SMS
const message = await dial.sendMessage({
  to: "+14155550123",
  fromNumberId: numbers[0].id,
  body: "Hello from Dial",
});

// Place an AI voice call
const call = await dial.makeCall({
  to: "+14155550123",
  fromNumberId: numbers[0].id,
  outboundInstruction: "You are confirming a reservation.",
  language: "en-US",
});

// Reply or react to a message (from listMessages or a message.received event)
const reply = await dial.replyToMessage(message.id, { body: "On my way!" });
const reaction = await dial.replyToMessage(message.id, { reaction: "🔥" });

// History
const recentMessages = await dial.listMessages();
const recentCalls = await dial.listCalls();

// Update a number's properties (any subset)
await dial.setNumberProperties(numbers[0].id, {
  nickname: "Support line",
  inboundInstruction: "You are ACME's receptionist.",
});
```

`sendMessage` and `makeCall` choose the from-number with exactly one of
`fromNumber` (a flexible reference — phone number ID, one of your numbers in
E.164, or a nickname) or `fromNumberId` (ID only).

## Typing indicators

Show a typing indicator while composing. iMessage numbers display it; standard
(SMS) numbers have no typing concept and silently ignore it, so the calls are
safe unconditionally.

```typescript
// Primitives
await dial.startTyping({ toNumber: "+14155550123", fromNumber: "Support line" });
await dial.stopTyping({ toNumber: "+14155550123", fromNumber: "Support line" });

// Or scope it to a block (TypeScript 5.2+): starts on creation, stops on dispose
await using session = dial.typing({
  toNumber: "+14155550123",
  fromNumber: "Support line",
});
await session.sendMessage({ body: "Working on it…" }); // to/from prefilled
```

Delivering a message or reaction clears the indicator natively on the
recipient's device. The session compensates: after each `session.sendMessage`
it automatically re-starts the indicator, so inside the block the bubble
persists — the only real stop is the scope exit (or an explicit
`session.stop()` when not using `await using`). With the bare primitives,
remember that a send clears it: call `startTyping` again to keep composing,
and `stopTyping` when you stop without sending. There is no keep-alive, so a
stale indicator may also clear on its own during a very long pause.

> **Note**
>
> The client makes a **single attempt** per call — it never auto-retries. `makeCall` accepts an optional `idempotencyKey`: pass the same key on each retry and a request that actually succeeded returns the original call instead of dialing again. `sendMessage` has no idempotency key — wrapping it in a retry can send a duplicate. See [Retries and idempotency](/documentation/reference/errors#retries-and-idempotency).

## Stream events

`newEventsConnection()` returns an opened, async-iterable connection. Iterate it for live events and close it when done.

```typescript
const conn = await dial.newEventsConnection();
try {
  for await (const event of conn) {
    if (event.type === "message.received") {
      console.log("inbound:", event.data.from, event.data.body);
    }
  }
} finally {
  await conn.close();
}
```

On TypeScript 5.2+ you can also use `await using conn = await dial.newEventsConnection();` to close it automatically.

> **Note**
>
> The stream is **presence-based**, not at-least-once — missed events replay only if you reconnect within 2 minutes. For durable, off-machine delivery, register a [webhook](/documentation/platform/webhooks) — signed and retried at-least-once.

## Types

`DialClient` returns typed `PhoneNumber`, `Message`, and `Call` objects (and `DialConfig`, `SendMessageParams`, `ReplyToMessageParams`, `MakeCallParams`, `TypingParams` for inputs). See [Core concepts](/documentation/get-started/core-concepts) for what each field means.