> For clean Markdown of any page, append .md to the page URL.
> For a complete documentation index, see https://docs.getdial.ai/llms.txt.
> For AI client integration (Claude Code, Cursor, etc.), connect to the MCP server at https://docs.getdial.ai/_mcp/server.

# Events

> Reference for the JSON payloads Dial publishes on the account event stream.

Dial publishes a single stream of JSON events per account. Anything that affects your numbers — an inbound SMS, a finished call — arrives on that stream and is the **same** payload whether you consume it via `POST /api/v1/events/wait`, [`dial wait-for`](/documentation/cli/commands#wait-for), or a [local target](/integrations/methods/local-url-target) fanning out from the listen daemon.

## Envelope

Every event shares one envelope; the `type` selects the shape of the `data` payload.

| Field           | Type           | Description                                                                                                                                                                                                      |
| --------------- | -------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `id`            | string         | A stable per-event identifier. On webhook deliveries it is mirrored in the `X-Dial-Event-ID` header; deduplicate on it.                                                                                          |
| `object`        | string         | Always `"event"`.                                                                                                                                                                                                |
| `type`          | string         | The event type — one of the names below.                                                                                                                                                                         |
| `version`       | integer        | Payload schema version. Currently `1` everywhere.                                                                                                                                                                |
| `createdAt`     | string         | ISO-8601 timestamp of when the event happened on Dial's side.                                                                                                                                                    |
| `relatedObject` | object \| null | Pointer to the REST resource the event concerns — `{ id, type, url }`. `url` is the get-by-id path when one exists (calls) or `null` (messages). `null` for events with no underlying resource (`webhook.ping`). |
| `data`          | object         | The event-specific payload, documented per type below.                                                                                                                                                           |

All field names are camelCase, matching the REST surface. Read event-specific values from `data`.

> **Note**
>
> **Provider-specific fields.** Dial may include additional internal identifiers in event payloads (carrier message IDs, voice-provider call IDs, etc.). They aren't part of the public contract — only the fields documented per event type are guaranteed to stay. Ignore anything you don't recognize.

## Event types

#### [message.received](/api-reference/events/message-received)

An inbound SMS arrived on one of your Dial numbers.

#### [message.status\_changed](/api-reference/events/message-status-changed)

An outbound message was delivered, rejected, or read.

#### [call.status\_changed](/api-reference/events/call-status-changed)

A call moved through its lifecycle — queued, ringing, in-progress, terminated.

#### [call.ended](/api-reference/events/call-ended)

A voice call (inbound or outbound) finished.

#### [call.transcribed](/api-reference/events/call-transcribed)

A call's transcript is ready to fetch.

#### [number.status\_changed](/api-reference/events/number-status-changed)

A phone number's setup advanced — provisioning, warming up, ready, failed, or banned.

#### [webhook.ping](/api-reference/events/webhook-ping)

A test event you fire at a single webhook subscription.

## Delivery semantics

The upstream stream Dial publishes is **presence-based** — clients only see events that arrive while they're connected. A `dial wait-for` or REST long-poll catches the next event live; the listen daemon replays events missed during a brief disconnect (up to \~2 minutes). For guaranteed, off-machine delivery, register a [webhook](/documentation/platform/webhooks) — Dial POSTs each event to your HTTPS endpoint, signed and retried at-least-once.