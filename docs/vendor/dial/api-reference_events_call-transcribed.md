> For clean Markdown of any page, append .md to the page URL.
> For a complete documentation index, see https://docs.getdial.ai/llms.txt.
> For AI client integration (Claude Code, Cursor, etc.), connect to the MCP server at https://docs.getdial.ai/_mcp/server.

# call.transcribed

> Event emitted when a voice call's transcript is ready.

Emitted when a voice call's transcript has been processed and is ready to read. This is a **thin** event — it carries only the call id. Fetch the transcript (and the rest of the call record) from `relatedObject.url` (`GET /api/v1/calls/{id}`).

It is separate from [`call.ended`](/api-reference/events/call-ended) because the transcript is produced by the voice provider *after* the call terminates. `call.ended` fires the moment the call reaches its terminal status; `call.transcribed` follows once the transcript lands — typically a few seconds later, sometimes more.

The fetched call carries the conversation twice. `transcript` is the flat text. `transcriptTurns` is the same conversation split into timed turns, each with a `speaker` (`agent`, `user`, or `transfer_target` for a human the call was handed off to), its `text`, and approximate `startMs`/`endMs` offsets in milliseconds into the call's audio. Turn timing is what lets you measure pacing: the pause before any turn is its `startMs` minus the previous turn's `endMs`, which the flat string gives you no way to recover.

## Schema

Shares the common [event envelope](/api-reference/events/overview#envelope) (`id`, `object`, `type`, `version`, `createdAt`, `relatedObject`). `relatedObject` is `{ id: <callId>, type: "call", url: "/api/v1/calls/<callId>" }`. The `data` payload is intentionally minimal:

| `data` field | Type   | Description                                                                                                           |
| ------------ | ------ | --------------------------------------------------------------------------------------------------------------------- |
| `callId`     | string | Dial-issued ID for the call. Matches the `id` returned by `GET /api/v1/calls`. Fetch the call to read the transcript. |

## Example

```json
{
  "id": "evt_9d2e1f3a4b5c6d7e8f90a1b2c3d4e5f6a7b8c9d0",
  "object": "event",
  "type": "call.transcribed",
  "version": 1,
  "createdAt": "2026-05-28T14:35:29.402Z",
  "relatedObject": { "id": "call_01HW3X7P5QF6K2YQ9YJ7Q8R5N3", "type": "call", "url": "/api/v1/calls/call_01HW3X7P5QF6K2YQ9YJ7Q8R5N3" },
  "data": { "callId": "call_01HW3X7P5QF6K2YQ9YJ7Q8R5N3" }
}
```

## When it fires

* **Only for calls that produced a transcript.** A cancelled, no-answer, or failed call emits `call.ended` but never `call.transcribed`.
* **Exactly once per call**, when the transcript is first persisted. Late re-deliveries from the voice provider do not produce duplicate events.
* **After `call.ended`.** Wait for it (or poll the call record) when you need the transcript rather than just the fact that the call ended.