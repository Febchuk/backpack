> For clean Markdown of any page, append .md to the page URL.
> For a complete documentation index, see https://docs.getdial.ai/llms.txt.
> For AI client integration (Claude Code, Cursor, etc.), connect to the MCP server at https://docs.getdial.ai/_mcp/server.

# mark & clear

> Playback checkpoints and barge-in — how your server tracks and interrupts what the caller is hearing.

Audio you send is **queued** and paced out to the caller in real time, so "sent" and "heard" can be
seconds apart. Two frames manage that gap.

## `mark` — playback checkpoints

**Direction:** both — you set a checkpoint; Dial echoes it when playback reaches it.

Send `mark` after a batch of [`media`](/api-reference/self-hosted-audio-protocol/media) frames;
when everything queued **before** it has finished playing to the caller, Dial sends the same frame
back. Use it to know when the agent finished saying something (e.g. to start a response timer, or
to hang up after a goodbye).

| Field  | Type   | Description                                  |
| ------ | ------ | -------------------------------------------- |
| `type` | string | Always `"mark"`.                             |
| `name` | string | Your checkpoint label, echoed back verbatim. |

```json
{ "type": "mark", "name": "goodbye-done" }
```

A `clear` flushes pending audio **and** its unreached marks — flushed marks are never echoed.

## `clear` — barge-in

**Direction:** your server → Dial. Immediately stops playback and discards everything queued.
Send it the moment your stack detects the caller speaking over the agent, then start streaming the
new response.

| Field  | Type   | Description       |
| ------ | ------ | ----------------- |
| `type` | string | Always `"clear"`. |

```json
{ "type": "clear" }
```