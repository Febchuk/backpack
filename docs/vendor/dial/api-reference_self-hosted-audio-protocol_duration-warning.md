> For clean Markdown of any page, append .md to the page URL.
> For a complete documentation index, see https://docs.getdial.ai/llms.txt.
> For AI client integration (Claude Code, Cursor, etc.), connect to the MCP server at https://docs.getdial.ai/_mcp/server.

# duration_warning

> The call is approaching its maximum-duration cap — wrap up before Dial ends it.

**Direction:** Dial → your server. Sent once, \~30 seconds before the call hits
its [maximum-duration cap](/api-reference/rest-api/calls/make-call), so your agent can wrap up
naturally before Dial ends the call. If no cap applies to the call, this frame
never arrives.

This is the audio variant's analog of the spoken warning Dial injects on managed
and LLM self-hosted calls — but since Dial isn't running the voice here, it
notifies **your** stack instead, and your agent speaks the wind-down.

When the cap is reached Dial ends the call with
[`call_ended`](/api-reference/self-hosted-audio-protocol/ending-calls) and
`reason: "duration_limit"`.

## Schema

| Field               | Type   | Description                                                    |
| ------------------- | ------ | -------------------------------------------------------------- |
| `type`              | string | Always `"duration_warning"`.                                   |
| `seconds_remaining` | number | Approximate seconds left before the hard cut (typically `30`). |

## Example

```json
{ "type": "duration_warning", "seconds_remaining": 30 }
```