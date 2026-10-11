> For clean Markdown of any page, append .md to the page URL.
> For a complete documentation index, see https://docs.getdial.ai/llms.txt.
> For AI client integration (Claude Code, Cursor, etc.), connect to the MCP server at https://docs.getdial.ai/_mcp/server.

# Self-hosted audio protocol

> The WebSocket protocol your server speaks in Self-Hosted audio mode — Dial pipes the raw call audio to you, full duplex, and your stack does the rest.

In **Self-Hosted audio mode** (`config.type: "audio"` on the
[Self-Hosted configuration](/documentation/platform/self-hosted)), Dial connects the **raw call
audio** to a WebSocket server you host. Where the [LLM protocol](/api-reference/self-hosted-protocol/overview)
sends you transcripts and asks for text turns — with Dial running speech-to-text and text-to-speech —
the audio protocol hands you the sound itself, both directions. Your server brings the entire voice
stack: a speech-to-speech model (OpenAI Realtime, Gemini Live, …) or your own STT → LLM → TTS chain.

These pages are the complete contract — you can build a conformant server from them alone. The
[SDKs](/documentation/sdks/overview) ship a ready-made server helper (signature verification, frame
codec, keepalive) so you start from handlers, not from a WebSocket loop.

## Connection

Dial opens **one WebSocket per call** to your configured URL with the call id appended to the path:

```
wss://<your-host>/<your-path>/<call_id>
```

`call_id` is Dial's own call identifier — stable for the life of the call, and the only call
identifier you ever receive. If the connection drops mid-call, Dial reconnects to the **same**
path and sends a fresh [`call_connected`](/api-reference/self-hosted-audio-protocol/call-connected)
with `reconnect: true` (see [Reconnection](#reconnection)).

With a [Pipecat Cloud target](/documentation/platform/self-hosted#pipecat-cloud), Dial connects to
Pipecat's generic WebSocket with a fresh single-use token instead, so the path carries no
`call_id`. Read it from `call_connected`, or from the `/start` body (`args.body`).

All frames are JSON text, discriminated by a `type` field, `snake_case` throughout. Audio rides
inside `media` frames as base64.

## Authentication

Identical to the LLM protocol: every connection carries

```
X-Dial-Signature: t=<unix_seconds>,v1=<hex_signature>
```

where `hex_signature` is `HMAC-SHA256(secret, "<t>.<call_id>")` as a hex digest, with the signing
secret from your Self-Hosted configuration. Verify on connect with a constant-time comparison and
reject stale timestamps. The SDK helpers do this for you.

A [Pipecat Cloud target](/documentation/platform/self-hosted#pipecat-cloud) is authenticated by
Pipecat's single-use token instead. Dial still sends the header, but Pipecat may not pass it on
to your bot, so don't depend on it there.

## Audio formats

The audio encoding in each direction is set on your
[Self-Hosted configuration](/documentation/platform/self-hosted) and echoed in every
[`call_connected`](/api-reference/self-hosted-audio-protocol/call-connected) frame — there is no
in-band renegotiation. Both directions support the same five formats:

| Format       | Encoding                                | Sample rate | Notes                                                                        |
| ------------ | --------------------------------------- | ----------- | ---------------------------------------------------------------------------- |
| `mulaw_8000` | G.711 μ-law, 8-bit                      | 8 kHz       | **Default.** Native telephony; zero-transcode into most realtime voice APIs. |
| `alaw_8000`  | G.711 A-law, 8-bit                      | 8 kHz       |                                                                              |
| `l16_8000`   | Linear PCM, 16-bit signed little-endian | 8 kHz       |                                                                              |
| `l16_16000`  | Linear PCM, 16-bit signed little-endian | 16 kHz      | e.g. Gemini Live input.                                                      |
| `l16_24000`  | Linear PCM, 16-bit signed little-endian | 24 kHz      | e.g. OpenAI Realtime / Gemini Live PCM output.                               |

All audio is mono. Dial sends caller audio in your **inbound** format in \~20 ms frames; you send
agent audio in your **outbound** format, any chunking (Dial buffers and paces playback).

## Message types

**From Dial → your server:**

#### [call\_connected](/api-reference/self-hosted-audio-protocol/call-connected)

First frame on every connection — call metadata, formats, reconnect flag.

#### [media](/api-reference/self-hosted-audio-protocol/media)

Caller audio, base64, \~20 ms cadence.

#### [dtmf](/api-reference/self-hosted-audio-protocol/dtmf)

A keypad digit the caller pressed.

#### [mark](/api-reference/self-hosted-audio-protocol/playback-control)

Echo of your checkpoint — playback reached it.

#### [duration\_warning](/api-reference/self-hosted-audio-protocol/duration-warning)

\~30s before the max-duration cut — wrap up.

#### [call\_ended](/api-reference/self-hosted-audio-protocol/ending-calls)

The call is over; the socket closes next.

**From your server → Dial:**

#### [media](/api-reference/self-hosted-audio-protocol/media)

Agent audio to play to the caller.

#### [clear](/api-reference/self-hosted-audio-protocol/playback-control)

Flush queued playback — barge-in.

#### [mark](/api-reference/self-hosted-audio-protocol/playback-control)

Set a playback checkpoint.

#### [end\_call](/api-reference/self-hosted-audio-protocol/ending-calls)

Hang up gracefully.

**Both ways:** [`ping_pong`](/api-reference/self-hosted-audio-protocol/ping-pong) — the keepalive:
Dial pings every \~2 s; echo it back. Miss enough pongs and Dial treats the link as dead and
reconnects.

## Reconnection

If the socket drops mid-call, the call itself stays up: Dial discards caller audio while
disconnected (never replays it — the conversation is live), and re-dials your endpoint with
backoff for up to \~15 seconds. The new connection starts with
[`call_connected`](/api-reference/self-hosted-audio-protocol/call-connected) carrying
`reconnect: true` — restore your per-call state keyed by `call_id` and resume streaming. For a
Pipecat Cloud target, every reconnect uses a new token (and may reach a different agent instance,
so keep per-call state outside the process). If
reconnection fails past the budget, the call ends and your Call record reflects it. After you send
[`end_call`](/api-reference/self-hosted-audio-protocol/ending-calls), reconnect attempts for that
call are refused.