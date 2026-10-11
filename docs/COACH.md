# Backpack Coach

A phone-only language agent. Learners text it, send it voice notes and call it. It answers in the native accent of the language they are learning and remembers who they are. The game (`apps/game`, `apps/server`) is frozen; none of this touches it.

```
learner phone ⇄ Dial line (one per agent, bought from the console)
  ├─ message.received → POST /dial/webhook → engine → Gemini → text reply (+ ElevenLabs voice-note reply)
  └─ call ⇄ wss /dial/voice/<call_id> → bridge → that agent's ElevenLabs agent (language, voice, memory)
every turn → events → memory.remember → kg_edges (graph) + memories (pgvector) → recall() in every prompt
apps/console → /api: create agent, provision voice + ElevenLabs agent, buy number, add learner, view memory
```

## Layout (`apps/coach/src`)

| Path | What | Lane |
| --- | --- | --- |
| `coach/contract.ts` | Every seam between modules. Changes need agreement. | contract |
| `mocks.ts` | Deterministic mock of each interface (no network). | contract |
| `db/` | Postgres or PGlite, migrations, `repo` | contract |
| `dial/client.ts` | Dial REST: messages, calls, number purchase | contract |
| `dial/webhook.ts`, `coach/engine.ts`, `coach/prompt.ts`, `coach/onboarding.ts`, `llm/reply.ts` | Texts and onboarding | A |
| `memory/*`, `llm/extract.ts` | Knowledge graph and vector memory | B |
| `voice/notes.ts`, `voice/tts.ts`, `routes/media.ts`, `llm/transcribe.ts` | Voice notes in and out | C |
| `voice/bridge.ts`, `voice/elevenlabs.ts`, `voice/codec.ts`, `voice/tools.ts` | Calls | D |
| `routes/api.ts`, `voice/provision.ts`, `apps/console/**`, `scripts/coach/*` | Console and provisioning | E |

## Run

- Tests: `bash scripts/test-level.sh coach`. They run on in-memory PGlite with every adapter mocked.
- Dev: `pnpm --filter @backpack/coach dev` (port 8788) and `pnpm --filter @backpack/console dev` (port 5174).
- Real services: set `MOCK_GEMINI=0`, `MOCK_DIAL=0`, `MOCK_ELEVENLABS=0`, plus the keys, `DATABASE_URL` and `PUBLIC_URL` (see `.env.example`).

## Dial is account-wide

Webhooks and self-hosted audio apply to every number on the Dial account. Pointing them at the coach takes calls away from the game's Luna. Use a separate Dial account, or accept that.

## Calls

Dial self-hosted audio streams every call on the account to `wss://<PUBLIC_HOST>/dial/voice/<call_id>` (`voice/bridge.ts`). The bridge checks `X-Dial-Signature` against `DIAL_SELF_HOSTED_SECRET` (no secret: every call is refused), finds the agent that owns the Dial number (`to` on inbound, `from` on outbound) and the learner on the other end (registered if new), and opens that agent's ElevenLabs conversation. Calls on a number no agent owns, or whose agent has no `el_agent_id`, get `end_call`. Without `ELEVENLABS_API_KEY` the server still boots and hangs up every call.

Each conversation starts with a `conversation_config_override`, so **every ElevenLabs agent must allow these overrides** (Agent → Security → Overrides): system prompt, first message, language and voice. Missing toggles make ElevenLabs reject the conversation.

- `agent.prompt.prompt`: built by `voice/callPrompt.ts` from the persona city, language, learner level and `memory.recall(learner, "phone call")`.
- `agent.first_message`: a short greeting in the target language with the learner's name.
- `agent.language`: `elLanguage(agent.language)`; `tts.voice_id`: `agent.voice_id`.

Client tools (`voice/tools.ts`, register them on the ElevenLabs agent as client tools that wait for a response): `get_learner_profile` (no parameters) and `remember_fact` (`rel`, one of `RELATIONS`; `object`, string). At call end the transcript is stored as one `call` event (`dial_id` = call id) and handed to `memory.remember`.

Point Dial at the coach with `pnpm exec tsx scripts/coach/self-hosted.ts save|secret|activate [<url>]` (defaults to `PUBLIC_URL`); `disable` rolls back.
