> For clean Markdown of any page, append .md to the page URL.
> For a complete documentation index, see https://docs.getdial.ai/llms.txt.
> For AI client integration (Claude Code, Cursor, etc.), connect to the MCP server at https://docs.getdial.ai/_mcp/server.

# end_call & call_ended

> Hanging up from your side, and how Dial tells you the call is over.

## `end_call` — hang up gracefully

**Direction:** your server → Dial. Ends the call. Anything already queued for playback is
discarded — if the agent should say goodbye first, send the goodbye
[`media`](/api-reference/self-hosted-audio-protocol/media), a
[`mark`](/api-reference/self-hosted-audio-protocol/playback-control), and `end_call` only when the
mark echoes back.

Once sent, the call is over for good: Dial will refuse
[reconnection](/api-reference/self-hosted-audio-protocol/overview#reconnection) attempts for this
`call_id`.

| Field  | Type   | Description          |
| ------ | ------ | -------------------- |
| `type` | string | Always `"end_call"`. |

```json
{ "type": "end_call" }
```

`end_call` needs an open socket. To cancel an outbound call **before** your socket connects —
while it's still `Queued` or `Ringing` — use [Stop a call](/api-reference/calls/stop-call)
(`POST /api/v1/calls/{id}/stop`) instead. Dial opens the socket only once the call is answered, so a
call cancelled before that never reaches your server.

## `call_ended` — the call is over

**Direction:** Dial → your server. The last frame before Dial closes the socket. Your Call record
(status, duration, `call.ended` event) is finalized regardless of what happens to this socket —
treat the frame as a courtesy signal for cleanup, not as the source of truth.

| Field    | Type   | Description                                                                                                                                                                                                                                                           |
| -------- | ------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `type`   | string | Always `"call_ended"`.                                                                                                                                                                                                                                                |
| `reason` | string | `"caller_hangup"` — the other party hung up. `"customer_hangup"` — you sent `end_call`. `"duration_limit"` — the call hit its configured duration cap. `"error"` — Dial could not sustain the call (e.g. your endpoint stayed unreachable past the reconnect budget). |

```json
{ "type": "call_ended", "reason": "caller_hangup" }
```