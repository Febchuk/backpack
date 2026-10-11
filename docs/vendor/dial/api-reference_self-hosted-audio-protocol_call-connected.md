> For clean Markdown of any page, append .md to the page URL.
> For a complete documentation index, see https://docs.getdial.ai/llms.txt.
> For AI client integration (Claude Code, Cursor, etc.), connect to the MCP server at https://docs.getdial.ai/_mcp/server.

# call_connected

> Sent when Dial connects to your server — on every connection, including mid-call reconnects.

**Direction:** Dial → your server. Sent **once per connection**, immediately after the socket
opens, before any audio. Use it to set up per-call state keyed by `call_id` — or, when
`reconnect` is `true`, to restore it and resume streaming.

## Schema

| Field         | Type           | Description                                                                                                                                                                                                                                    |
| ------------- | -------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `type`        | string         | Always `"call_connected"`.                                                                                                                                                                                                                     |
| `call_id`     | string         | Dial's call identifier — the same value as in the connection path. Stable across reconnects. The only call id you receive.                                                                                                                     |
| `direction`   | string         | `"inbound"` if someone called your Dial number; `"outbound"` if the call originated from your account.                                                                                                                                         |
| `from`        | string         | Calling phone number, E.164.                                                                                                                                                                                                                   |
| `to`          | string         | Called phone number, E.164.                                                                                                                                                                                                                    |
| `instruction` | string \| null | The instruction the call was placed/answered with, if any — useful as your model's system prompt. `null` if none was set.                                                                                                                      |
| `language`    | string \| null | The call's primary language, BCP-47 (e.g. `en-US`). `null` if unset.                                                                                                                                                                           |
| `formats`     | object         | The audio formats in effect: `{ "inbound": <format>, "outbound": <format> }` — see [Audio formats](/api-reference/self-hosted-audio-protocol/overview#audio-formats). `inbound` is what Dial sends you; `outbound` is what you must send back. |
| `reconnect`   | boolean        | Absent or `false` on the first connection of a call; `true` when Dial re-established a dropped socket mid-call. Restore state instead of initializing.                                                                                         |

## Example

```json
{
  "type": "call_connected",
  "call_id": "call_01HW3X7P5QF6K2YQ9YJ7Q8R5N3",
  "direction": "inbound",
  "from": "+14155550123",
  "to": "+14155559876",
  "instruction": "Answer billing questions for Acme Corp.",
  "language": "en-US",
  "formats": { "inbound": "mulaw_8000", "outbound": "mulaw_8000" }
}
```