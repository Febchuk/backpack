# Backpack — scaffold + breadth-first build with agents, level-order testing

## Context
The PRD (Google Doc "Backpack — Voice-First Language Game PRD") specifies a 5-minute hackathon demo: airport → SIM kiosk by voice → real phone call from Luna (Dial) → café mission → "skip to evening" debrief call → market unlock. The hard checkpoint is the airport-to-phone-call loop working end to end by 3pm.

Breadth-first means every layer of the journey exists (stubbed) before any one layer goes deep, so the whole demo is always runnable. Each **level** deepens all lanes at once, built by parallel Claude subagents (one per PRD role). Level-order testing means a level's test suite, plus every lower level's tests, must pass before the next level starts.

Repo: `~/Projects/backpack` (new git repo, pnpm workspaces, Node 22, which is already installed).

## Repo layout
```
backpack/
  packages/shared/      # THE contract: zod schemas + TS types, fixtures
    src/npc.ts          # NpcTurnResponse {reply_fr, reply_en_hint, heard, phrases_used, phrases_missed, hint, mission_complete, mood}
    src/state.ts        # PlayerState {player, phrases, missions, unlocks}
    src/api.ts          # route paths + request/response schemas
    fixtures/           # canned NPC turns, player states
  apps/server/          # Node + Express + better-sqlite3
    src/routes/{npc,activate,skipEvening,state,dialWebhook}.ts
    src/mcp/            # MCP tools: get_player_summary, get_missed_phrases, mark_phrase_mastered, award_star, unlock_district
    src/adapters/gemini.ts, dial.ts   # real + mock impls chosen by MOCK_GEMINI / MOCK_DIAL env
    src/db/schema.sql   # players, phrases, missions, unlocks, events
  apps/game/            # Phaser 3 + Vite + TS
    src/scenes/{Title,Airport,Street,Hostel}.ts
    src/ui/{Dialogue,Phone,Backpack,Hud}.ts
    src/net/api.ts      # typed client from packages/shared; polls GET /state every 2s
    src/voice/holdToTalk.ts
    public/assets/      # placeholders first, Gemini art later
  tests/
    level0/ … level4/   # level-tagged tests
  scripts/test-level.sh # runs levels 0..N in order, stops at first failure
```

Every lane imports types only from `packages/shared`. Mock adapters return the shared fixtures, so the game and server can be tested with no API keys.

## Lanes (one subagent each, own git worktree)
| Lane | PRD role | Owns |
|---|---|---|
| **game** | A | `apps/game` scenes, movement, triggers, dialogue/phone/backpack UI |
| **voice** | B | `apps/server/src/routes/npc.ts`, `adapters/gemini.ts`, NPC persona prompts, `holdToTalk.ts` |
| **backend** | C | Express app, SQLite, `adapters/dial.ts`, activate/skip-evening/webhook, MCP, hosting |
| **assets** | D | `public/assets`, locked style prompt, sounds, demo script |

The main session (me) does Level 0 alone, then at each level: spawn the 4 lane agents in parallel with `isolation: "worktree"` → merge their branches → run `scripts/test-level.sh N` → fix or re-dispatch failures → advance only when green. Lanes never edit `packages/shared`. Contract changes go through me between levels.

## Levels

**L0: Skeleton and contracts (serial, me).**
`git init`, workspaces, tsconfig, vitest, Playwright; the `packages/shared` schemas and fixtures; an Express server with every route returning fixtures; a Phaser app booting to the Title scene; `test-level.sh`.
*Gate L0:* `pnpm build` passes; schema tests validate the fixtures; the server boots and every route returns schema-valid JSON; Playwright sees the Phaser canvas.

**L1: Walking skeleton, whole journey on mocks (4 lanes).**
- game: all 4 scenes with rectangle placeholders, WASD movement, door triggers, a dialogue box, a phone panel, a backpack panel, a phone-number form, a "Skip to evening" button, and `/state` polling.
- voice: hold-to-talk records audio and POSTs it to `/npc/:id/turn`; the mock returns a fixture.
- backend: SQLite schema; `/activate`, `/skip-evening` and `/dial/webhook` write events through the mock Dial adapter; the MCP tools work on real SQLite.
- assets: the locked style prompt and an airport background.

*Gate L1:* a Playwright e2e walks title → airport → kiosk → enter number → street → café → skip evening → unlock appears through polling, with everything mocked. This is the whole demo, shallow.

**L2: Real integrations (4 lanes). 3pm checkpoint = L2 gate.**
- voice: a real Gemini audio-in call returning schema-valid JSON, with replies spoken through TTS.
- backend: real Dial calls and SMS; provision Luna's number; deploy to Railway or Render (ngrok as fallback).
- game: collisions, camera follow, typewriter text, and a "thinking" animation.
- assets: airport, street and hostel art plus sprites.

*Gate L2:* contract tests check that the real Gemini output parses into `NpcTurnResponse`, with p50 latency logged against the 3-second target. A smoke script hits `/activate` with a teammate's number, and the phone rings in under 30 seconds (checked by a human). All L0 and L1 tests stay green in mock mode.

**L3: Full loop with live state (4 lanes).**
- The café mission with grading writes phrases into the backpack.
- The debrief call instruction includes the phrases missed today, and the call transcript is graded through the webhook.
- Dial Context MCP points at `/mcp`, so `unlock_district` makes the market appear in the game.
- The NPCs Monsieur Girard and Margaux run in open play.

*Gate L3:* an e2e test with a mocked Dial webhook payload checks that a missed phrase leads to a debrief that names that phrase, then `mark_phrase_mastered`, then the unlock showing in the game within 4 seconds. The live demo also has to run end to end once on real services.

**L4: P1 and demo hardening, following the PRD's cut order.**
Euros, stars, adaptive NPCs, Inès and Théo; the backup video; testing on a phone hotspot.

*Gate L4:* three full rehearsals in a row with no crash.

## Level-order testing rules
- Tests live in `tests/levelN/`. Running `scripts/test-level.sh N` runs levels 0 to N in order and stops at the first failure, so a deeper level can never break a shallower one unnoticed.
- CI-style tests always run in mock mode (deterministic, no keys). Tests that need real services are tagged `@live` and run with `pnpm test:live`. Their results are recorded, but only L2 and L3 gates require them.
- Each lane agent's prompt includes: its level scope, the paths it owns, the shared contract, and "do not finish until `scripts/test-level.sh N` passes for your lane's tests."

## Inputs needed before L2
- `GEMINI_API_KEY`
- Dial API key and docs (lane agents will read the Dial docs; whether Context MCP needs auth is a PRD open question)
- A test phone number

## Verification
- After L0: `pnpm i && pnpm build && scripts/test-level.sh 0`
- After each level: `scripts/test-level.sh N` is green on the merged main branch; for L2 and L3 also `pnpm test:live`, plus a real phone ring and a real debrief call.
- Final: `pnpm dev`, open Chrome, run the 5-minute demo script from the PRD.

## What I execute on approval
First, create `~/Projects/backpack` with a `docs/` directory containing:
- `docs/PRD.md`: the Google Doc PRD as Markdown
- `docs/BUILD_PLAN.md`: this plan (layout, lanes, levels, gates, testing rules)
- `docs/CONTRACT.md`: the NPC JSON, routes, MCP tools and SQLite schema, extracted for lane agents

Lane agents are pointed at `docs/` as their source of truth.

Then L0 myself, then L1 with 4 parallel worktree subagents, merge, and the L1 gate. I stop after the L1 gate to report, since L2 needs your API keys.
