# Dial setup (Levels 2 and 3)

Run everything from the repo root. The scripts read `.env` and never print `DIAL_API_KEY`.

1. **Fill `.env`** with `DIAL_API_KEY=sk_live_…`, `GEMINI_API_KEY=…`, `TEST_PHONE=+1…` (the phone that receives the demo call), and `MOCK_DIAL=0` / `MOCK_GEMINI=0`. `DIAL_CALL_LANGUAGE` defaults to `fr-FR`.
2. **Pick the from-number:** `pnpm exec tsx scripts/dial/numbers.ts`. Copy the id of a number with `setupStatus=ready`, `callingEnabled=true` and `call`+`sms` capabilities into `DIAL_FROM_NUMBER_ID`.
3. **Expose the server over https:** start it (`pnpm --filter @backpack/server dev`), then open a tunnel to port 8787 (e.g. `cloudflared tunnel --url http://localhost:8787`). Put the https URL in `PUBLIC_URL`.
4. **Register with Dial:** `pnpm exec tsx scripts/dial/register.ts "$PUBLIC_URL"`. It creates (or replaces) the webhook for `call.transcribed` + `call.ended` → `/dial/webhook` and the Context MCP "Backpack game" → `/mcp`. Paste the printed `DIAL_WEBHOOK_SECRET=whsec_…` line into `.env`. It is shown once; rerunning reuses the subscription and only fetches the secret again if `.env` lacks it.
5. **Restart the server** so it picks up the secret.
6. **Smoke test:** `pnpm exec tsx scripts/dial/smoke-call.ts`. It creates a player and activates it with `TEST_PHONE`, then prints the call id and how long placing it took. Your phone should ring and get Luna's SMS.
7. **Check the loop:** after hanging up, Dial sends `call.transcribed`. The server fetches the transcript and grades it. Watch the server log, or `GET /state/<player_id>`.

## Level 3: Luna's Context MCP

During a call, Luna (Dial's managed agent) reads and writes game state through our MCP server at `${PUBLIC_URL}/mcp`. Step 4 above already registers it as the Context MCP "Backpack game".

8. **Verify the wiring:** `pnpm exec tsx scripts/dial/check-mcp.ts`. It is read-only (no calls, no SMS). It checks that a Dial Context MCP points at exactly `${PUBLIC_URL}/mcp` and that the URL answers `tools/list` with `get_player_summary`, `get_missed_phrases`, `mark_phrase_mastered`, `award_star` and `unlock_district`.
9. **Check auth mode in the dashboard** (https://getdial.ai/dashboard/context-mcps): "Backpack game" should show `authMode=none` and a connected status. Our `/mcp` has no OAuth; it authorizes each request by `X-Dial-User-Number` instead, so the tools only touch the player whose phone is on the line. If the status is `pending_auth`, open the printed `authorizationUrl` or reconnect it from the dashboard.
10. **Rehearse the debrief:** play the café without saying "c'est combien ?", press *Skip to evening*, and say the phrase back when Luna asks. Within about 4 s of Luna calling `mark_phrase_mastered` and `unlock_district`, the backpack shows the phrase and the market door opens (the game polls `/state` every 2 s). If Luna forgets the tools, the `call.transcribed` webhook grades the transcript after hang-up and unlocks the market anyway.

Context MCP is **inert in self-hosted voice mode** (`VOICE_MODE=selfhosted`, see `SELF_HOSTED_VOICE.md`): there, the same three tools run in-process as ElevenLabs client tools, and the bridge grades the transcript at call end.

Notes
- When the tunnel URL changes, rerun step 4 (old Backpack entries are replaced) and update the secret if a new one is printed.
- With `DIAL_WEBHOOK_SECRET` unset, signatures are not checked. Set it for any public deploy.
- The MCP authorizes each request by `X-Dial-User-Number`: Luna can only touch the player whose phone is on the line.
- Calls fail with `409 calling_disabled`, `403 unsupported_region` (US-only numbers) or `429 call_limit_reached` (one call at a time per number). The error text includes Dial's message.
