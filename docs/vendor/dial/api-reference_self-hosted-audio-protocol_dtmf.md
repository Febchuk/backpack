> For clean Markdown of any page, append .md to the page URL.
> For a complete documentation index, see https://docs.getdial.ai/llms.txt.
> For AI client integration (Claude Code, Cursor, etc.), connect to the MCP server at https://docs.getdial.ai/_mcp/server.

# dtmf

> A keypad digit the caller pressed.

**Direction:** Dial → your server. Sent when the caller presses a keypad key. The tone itself is
also audible in the [`media`](/api-reference/self-hosted-audio-protocol/media) stream; this frame
gives you the digit without decoding tones.

## Schema

| Field   | Type   | Description                                                 |
| ------- | ------ | ----------------------------------------------------------- |
| `type`  | string | Always `"dtmf"`.                                            |
| `digit` | string | The key pressed: `0`–`9`, `*`, or `#`. One frame per press. |

## Example

```json
{ "type": "dtmf", "digit": "#" }
```