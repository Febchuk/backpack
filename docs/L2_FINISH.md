# Finishing the L2 gate

L2 is green on mocks. The items below need real services. Add `GEMINI_API_KEY` (and the Dial keys) to `.env`, then run:

```
bash scripts/l2-finish.sh
```

It stops at the first failure and ends with the manual steps.

| Gate item (BUILD_PLAN.md) | Command | Done when |
|---|---|---|
| Real Gemini output parses into `NpcTurnResponse` | `LIVE=1 pnpm exec vitest run tests/level2/gemini.live.test.ts` (step 1) | 4 tests pass, none skipped: the clerk's correct line completes the mission, the barista lists the missing "s'il vous plaît", Girard's open play returns `mission_complete: null`, and every turn takes < 5 s |
| Dial account is ready | `LIVE=1 … tests/level2/dial.live.test.ts` (step 1) | Passes, not skipped. `DIAL_FROM_NUMBER_ID` is ready and can call |
| p50 latency logged against the 3 s target | `pnpm exec tsx scripts/gemini/latency.ts` (step 2) | Exits 0 with p50 ≤ 3000 ms and no schema failures or fallbacks; `docs/LATENCY.md` is written and committed. Add `scripts/gemini/fixtures/bonjour.webm` (a real recording) to time an audio turn too |
| Assets: airport, street and hostel art plus sprites | `pnpm exec tsx scripts/assets/gen-gemini.ts` (step 3) | All 8 images are in `art/gemini/` at 960×540 (opaque) or 32×32 (transparent), using the locked palette |
| Human art review | Open `art/gemini/contact.png`, then `pnpm exec tsx scripts/assets/promote-gemini.ts <keys…> \| --all` | Approved files are copied into `apps/game/public/assets/` and `tests/level1/assets.test.ts` passes. Redo a bad image with `gen-gemini.ts --only <key> --seed <n>` |
| L0 and L1 stay green in mock mode | `bash scripts/test-level.sh 2 --only-unit` (step 4); also run `bash scripts/test-level.sh 2` for Playwright | All levels 0 to 2 are green |
| Deploy to Railway | `bash scripts/railway/sync-env.sh --real` (try `--dry-run` first), set `PUBLIC_URL`, then `railway up` | `GET https://<domain>/health` returns 200. Variable names are printed, values never are |
| The phone rings in < 30 s (checked by a human) | `TEST_PHONE=+… pnpm exec tsx scripts/dial/smoke-call.ts https://<domain>` | A teammate's phone rings and gets Luna's SMS within 30 s |

## Notes
- Prompts are built at run time from `docs/STYLE_PROMPT.md`. Run `gen-gemini.ts --dry-run` to print them without calling the API.
- Image model: `GEMINI_IMAGE_MODEL` (default `gemini-2.5-flash-image`). An `imagen-*` id switches the call to `models.generateImages`.
- Gemini cannot output alpha. Sprite prompts therefore ask for a flat magenta backdrop, and the script keys it out. Raw model output is kept in `art/gemini/raw/`.
- Steps 1 to 3 make about 30 paid API calls in total.
