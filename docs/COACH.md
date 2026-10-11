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
