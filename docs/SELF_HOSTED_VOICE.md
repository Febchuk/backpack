# Self-hosted voice: Luna on ElevenLabs

Dial's managed agent speaks French with an American accent. In Dial **Self-Hosted AUDIO** mode, Dial pipes
the raw call audio to our server, and we voice Luna with an ElevenLabs Agents conversation and a native French voice.

## Architecture

```
player's phone ⇄ Dial ⇄ wss://<PUBLIC_HOST>/dial/voice/<call_id> ⇄ apps/server/src/voice ⇄ ElevenLabs Agents WS
                 (μ-law 8 kHz, JSON frames)          bridge.ts            (ulaw_8000; STT + LLM + TTS)
```

- `voice/bridge.ts` attaches a `ws` server to the Express HTTP server (`main.ts`, only when `VOICE_MODE=selfhosted`).
  It verifies `X-Dial-Signature` (HMAC-SHA256 of `<t>.<call_id>`, at most 300 s old) and rejects everything else with 401.
- Per call: `repo.findPlacedCall(call_id)` gives the player and kind. The prompt is `introInstruction()` or
  `debriefInstruction(missedPhrases)`, sent as overrides with `first_message`, `language: "fr"` and `ELEVENLABS_VOICE_ID`.
- Audio: Dial `media` → `user_audio_chunk`; ElevenLabs `audio` → Dial `media`. μ-law passes through untouched;
  other formats are transcoded by `voice/codec.ts`. ElevenLabs `interruption` → Dial `clear` (and stale audio is dropped).
- Tools: `get_missed_phrases`, `mark_phrase_mastered` and `unlock_district` are ElevenLabs **client tools**, run in-process
  for the call's player (`mcp/tools.ts`, shared with the MCP server). Context MCP is inert in self-hosted mode.
- Transcript: Dial produces none in audio mode. The bridge collects `user_transcript`/`agent_response` and, at call end,
  runs `gradeTranscript` (same as the `call.transcribed` webhook), stored as a `call` event with `voice: "selfhosted"`.
- Lifecycle: Dial `ping_pong` is echoed, ElevenLabs `ping` gets `pong`. `duration_warning` → a `contextual_update` telling Luna
  to wrap up. When Luna ends the call, the bridge sends a `mark` and then `end_call` once it is played. On `call_ended`
  the ElevenLabs socket is closed. A dropped Dial socket keeps the conversation for 20 s so Dial's reconnect resumes it.
- Logs carry call ids and event names only, never keys or audio.

## Env

| Var | Meaning |
| --- | --- |
| `VOICE_MODE` | `managed` (default: nothing changes) or `selfhosted` |
| `DIAL_SELF_HOSTED_SECRET` | Audio-mode signing secret from Dial. Without it every connection is rejected |
| `ELEVENLABS_API_KEY` | Server-side key, sent as the `xi-api-key` header |
| `ELEVENLABS_AGENT_ID` | The agent from `scripts/elevenlabs/README.md` |
| `ELEVENLABS_VOICE_ID` | Native French voice (optional; else the agent's voice) |

`/activate` and `/skip-evening` place calls exactly as before; only the voice changes.

## Setup order

1. **Dial access:** `pnpm exec tsx scripts/dial/self-hosted.ts request-access "<use case>"`, then `status` until `access: granted`.
2. **ElevenLabs agent:** follow `scripts/elevenlabs/README.md`. Put the key, agent id and voice id in `.env`.
3. **Save:** `self-hosted.ts save wss://<PUBLIC_HOST>/dial/voice` (μ-law 8 kHz both ways; mints the secret).
4. **Secret:** `self-hosted.ts secret`, paste `DIAL_SELF_HOSTED_SECRET=…` into `.env`, set `VOICE_MODE=selfhosted`, restart the server.
5. **Activate:** `self-hosted.ts activate wss://<PUBLIC_HOST>/dial/voice`. From now on Dial routes **all** calls to the bridge.
6. Smoke test: `/activate` a test player and answer the phone.

## Rollback

`pnpm exec tsx scripts/dial/self-hosted.ts disable`, then `VOICE_MODE=managed` and restart. Calls go back to Dial's
managed agent, with Context MCP tools and the `call.transcribed` webhook grading.
