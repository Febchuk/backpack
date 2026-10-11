> For clean Markdown of any page, append .md to the page URL.
> For a complete documentation index, see https://docs.getdial.ai/llms.txt.
> For AI client integration (Claude Code, Cursor, etc.), connect to the MCP server at https://docs.getdial.ai/_mcp/server.

# ping_pong

> Keepalive between Dial and your server — Dial pings, you echo it back.

**Direction:** both ways. Dial sends a `ping_pong` to your server roughly every **2 seconds**; echo
the **same** frame straight back. If Dial doesn't receive a pong within \~**5 seconds** it treats the
link as dead, closes it, and [reconnects](/api-reference/self-hosted-audio-protocol/overview#reconnection) —
at which point you get a fresh
[`call_connected`](/api-reference/self-hosted-audio-protocol/call-connected) with `reconnect: true`
and resume streaming.

This is an application-level keepalive on top of the WebSocket — the same frame as in the
[LLM protocol](/api-reference/self-hosted-protocol/ping-pong). Note that a steady inbound
[`media`](/api-reference/self-hosted-audio-protocol/media) stream does **not** replace it: only an
echoed `ping_pong` counts as proof the link is alive both ways.

## Schema

| Field       | Type    | Description                                                               |
| ----------- | ------- | ------------------------------------------------------------------------- |
| `type`      | string  | Always `"ping_pong"`.                                                     |
| `timestamp` | integer | Milliseconds since epoch (for round‑trip timing). Echo it back unchanged. |

## Example

Dial → your server:

```json
{ "type": "ping_pong", "timestamp": 1749480000000 }
```

Echo it straight back, your server → Dial:

```json
{ "type": "ping_pong", "timestamp": 1749480000000 }
```