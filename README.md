# Backpack

A 16-bit pixel-art game where you learn French by talking your way through Paris. Your guide, Luna, follows you onto your real phone with calls and texts.

- **Game:** Phaser 3 + Vite + TypeScript (`apps/game`)
- **Server:** Node + Express + SQLite; Gemini NPC turns; Dial calls, webhooks and a Context MCP server (`apps/server`)
- **Contract:** shared zod schemas (`packages/shared`)

Read `docs/PRD.md` for the product, `docs/CONTRACT.md` for the API, and `docs/BUILD_PLAN.md` for how it's built.

## Run it

```bash
pnpm install
cp .env.example .env   # mocks are on by default, so no keys are needed
pnpm dev               # game on http://localhost:5173, server on :8787
```

To use real Gemini and Dial, set `MOCK_GEMINI=0` / `MOCK_DIAL=0`, add your keys, and follow `docs/DIAL_SETUP.md`.

## Tests

The build is breadth-first, in levels. `scripts/test-level.sh N` runs the tests for levels 0 to N in order and stops at the first failure.

```bash
bash scripts/test-level.sh 2   # unit + browser tests, all on mocks
pnpm test:live                 # tests against real services (needs keys)
```
