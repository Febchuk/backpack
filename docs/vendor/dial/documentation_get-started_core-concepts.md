> For clean Markdown of any page, append .md to the page URL.
> For a complete documentation index, see https://docs.getdial.ai/llms.txt.
> For AI client integration (Claude Code, Cursor, etc.), connect to the MCP server at https://docs.getdial.ai/_mcp/server.

# Core concepts

> The Dial object model — accounts, API keys, phone numbers, messages, calls, and events.

A handful of objects make up everything in Dial. Each one maps to a resource in the REST API.

## Account & API keys

Your **account** is created when you verify your email. It holds your **API keys** (`sk_live_...`), which authenticate every request. One account can have several keys; `GET /api/v1/account` lists them as previews.

## Phone numbers

A **phone number** is a real number you purchase through Dial. You send messages and place calls *from* a number, identified by its `id` (the `fromNumberId` you'll pass to most operations). Each number also carries an `inboundInstruction` — the system prompt its AI voice agent uses when someone calls *in* — set at purchase and changeable with `dial number set`, plus an optional `nickname`, a human-readable label for telling numbers apart. List them with `dial number list` or `GET /api/v1/numbers`.

## Messages

A **message** is an SMS, either `outbound` (you sent it) or `inbound` (someone texted your number). Each has `from`, `to`, `body`, `status`, and a timestamp. Send with `POST /api/v1/messages`; list with `GET /api/v1/messages`.

## Calls

A **call** is an AI voice call. Outbound calls carry an `outboundInstruction` and `language`; inbound calls use the destination number's `inboundInstruction` (and its `inboundLanguage`, when set — otherwise the language is detected from the caller's country prefix). Once finished, a call exposes its `status`, `duration`, `transcript`, and the `instruction` it ran with. Place with `POST /api/v1/calls`; list with `GET /api/v1/calls`; fetch a single call with `GET /api/v1/calls/{id}`.

## Events

An **event** is something that happened on your account — most importantly `message.received` (an inbound SMS) and `call.ended`. Rather than polling, you consume events:

* **Wait once** — block for the next matching event (`dial wait-for`, `POST /api/v1/events/wait`).
* **Stream continuously** — open a live connection (`new_events_connection()` in an SDK, or the `dial listen` daemon).

Today the stream is **presence-based** — missed events replay only if you reconnect within 2 minutes — not a durable at-least-once queue. For guaranteed, off-machine delivery, register a [webhook](/documentation/platform/webhooks): Dial POSTs each event to your HTTPS endpoint, signed and retried at-least-once. See [Receive an SMS](/documentation/capabilities/receive-an-sms) and [Stream account events](/documentation/platform/stream-account-events).