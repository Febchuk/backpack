> For clean Markdown of any page, append .md to the page URL.
> For a complete documentation index, see https://docs.getdial.ai/llms.txt.
> For AI client integration (Claude Code, Cursor, etc.), connect to the MCP server at https://docs.getdial.ai/_mcp/server.

# media

> Audio frames, both directions — caller audio to your server, agent audio back to the caller.

**Direction:** both. The same frame type carries caller audio to you and your agent's audio back;
each direction uses its configured format (see
[Audio formats](/api-reference/self-hosted-audio-protocol/overview#audio-formats)).

## Dial → your server (caller audio)

Sent continuously for the life of the call — including silence — in your **inbound** format,
\~20 ms per frame.

| Field     | Type   | Description                                                                                                                                                                                                               |
| --------- | ------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `type`    | string | Always `"media"`.                                                                                                                                                                                                         |
| `payload` | string | Base64-encoded audio bytes in the inbound format.                                                                                                                                                                         |
| `seq`     | number | Frame counter from 1, incremented per frame on this connection. Gaps after a [reconnect](/api-reference/self-hosted-audio-protocol/overview#reconnection) are expected — audio during the gap is dropped, never replayed. |

```json
{ "type": "media", "payload": "fn5+fn5+fn5+…", "seq": 412 }
```

## Your server → Dial (agent audio)

Send whenever your agent should speak. Chunk size is up to you — Dial buffers and paces playback
to the caller. Everything you send queues in order; use
[`clear`](/api-reference/self-hosted-audio-protocol/playback-control) to flush the queue on
barge-in and [`mark`](/api-reference/self-hosted-audio-protocol/playback-control) to learn when
playback reaches a checkpoint.

| Field     | Type   | Description                                            |
| --------- | ------ | ------------------------------------------------------ |
| `type`    | string | Always `"media"`.                                      |
| `payload` | string | Base64-encoded audio bytes in the **outbound** format. |

```json
{ "type": "media", "payload": "UklGRiQAAABXQVZF…" }
```