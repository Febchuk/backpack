# Backpack — Contract

The source of truth for lane agents. Every type here lives as a zod schema in `packages/shared/src`. Lanes import from `@backpack/shared` and never redefine these shapes. Changes go through the integrator between levels, never inside a lane.

## IDs

| Kind | Values |
|---|---|
| NPC ids | `clerk` (SIM kiosk), `barista` (café), `girard`, `margaux`, `ines`, `theo` |
| Mission keys | `sim_kiosk`, `cafe_order` (missions); open-play turns send no mission key |
| Districts | `market` |
| Scenes | `Title`, `Airport`, `Street`, `Hostel` |
| Moods | `patient`, `impatient`, `warm`, `cold`, `amused` |

There is one demo player at a time. The game calls `POST /players` on Title, then stores `player_id` in `localStorage`.

## HTTP routes (server, default port 8787)

| Method and path | Body | Response | Effect |
|---|---|---|---|
| `GET /health` | | `{ok: true}` | |
| `POST /players` | `{}` | `PlayerState` | Creates a player with the `sim_kiosk` mission active and `cafe_order` locked |
| `GET /state/:playerId` | | `PlayerState` | The game polls this every 2 s |
| `POST /npc/:npcId/turn` | multipart: `audio` (webm blob) **or** `text`, plus `player_id` and optional `mission_key` | `NpcTurnResponse` | Logs phrases: used → `practicing` (or `mastered` if already practicing), missed → `missed`. `mission_complete: true` sets the mission to `done` and activates the next one |
| `POST /activate` | `{player_id, phone}` | `{ok, call_id}` | Saves the phone number, places Luna's intro call, and sends the SMS "Mission: get a coffee" (an `sms` event, so it shows up in `messages`) |
| `POST /skip-evening` | `{player_id}` | `{ok, call_id}` | Places the debrief call. The call instruction holds Luna's persona plus today's missed phrases |
| `POST /dial/webhook` | `DialTranscript` | `{ok}` | Grades the call transcript. Any phrase that was `missed` before the call and that the player says correctly (normalized match in a `player` turn) becomes `mastered`. On a `debrief` call, `market` unlocks if at least one such phrase was mastered. The transcript is stored as a `call` event |
| `POST /mcp` | MCP Streamable HTTP | | MCP tools (see below) |
| `POST /dev/reset` | `{}` | `{ok}` | Wipes the DB. Only enabled when `NODE_ENV !== 'production'` |

`text` in place of `audio` is the test path, and the fallback when the mic is blocked.

## NpcTurnResponse

```json
{
  "reply_fr": "Bien sûr ! Un café crème ou un expresso ?",
  "reply_en_hint": "Of course! A café crème or an espresso?",
  "heard": "je voudrais un café s'il vous plaît",
  "phrases_used": ["je voudrais", "s'il vous plaît"],
  "phrases_missed": ["c'est combien ?"],
  "hint": "Ask the price: C'est combien ?",
  "mission_complete": false,
  "mood": "patient"
}
```

`mission_complete` is `null` for open-play NPCs.

## PlayerState

```ts
{
  player:   { id: string; phone: string | null; level: number; euros: number; city: "paris" };
  phrases:  { id: string; text_fr: string; text_en: string | null;
              status: "missed" | "practicing" | "mastered"; last_seen: string }[];
  missions: { mission_key: string; status: "locked" | "active" | "done"; stars: number; hints_used: number }[];
  unlocks:  string[];                       // district names
  messages: { id: string; from: "luna"; body: string; created_at: string }[];  // SMS, newest last
}
```

The backpack shows `phrases` where status is `mastered`. The in-game phone shows `messages` and the active mission.

## DialTranscript (our normalized webhook shape)

The Dial adapter maps Dial's real payload to this shape. The mock and the tests post it directly.

```ts
{ call_id: string; player_id: string; kind: "intro" | "debrief";
  turns: { speaker: "luna" | "player"; text: string }[] }
```

## Adapters

- `GeminiAdapter.npcTurn({persona, missionGoal, targetPhrases, level, audio?, text?}) → NpcTurnResponse`
- `DialAdapter.call({to, kind, instruction, player_id}) → {call_id}`
- `DialAdapter.sms({to, body}) → {id}`

Setting `MOCK_GEMINI=1` or `MOCK_DIAL=1` selects the mocks; both default to on in tests. The mock Gemini adapter is deterministic: on the `text` path it marks each target phrase as used if the text contains it (case- and accent-insensitive) and missed otherwise. It returns `mission_complete: true` when every required phrase was used. The mock Dial adapter records calls and SMS in memory and the `events` table, and returns ids prefixed `mock_`.

## MCP tools (exposed to Luna at `/mcp`)

| Tool | Input | Returns / effect |
|---|---|---|
| `get_player_summary` | `player_id` | `{level, missions_done, city}` |
| `get_missed_phrases` | `player_id` | Phrases with status `missed` today, newest first |
| `mark_phrase_mastered` | `player_id, phrase` | Moves the phrase into the backpack |
| `award_star` | `player_id, mission_id` | Adds a star (max 3) |
| `unlock_district` | `player_id, district` | Opens the district in the game |

## SQLite schema

```sql
players  (id TEXT PK, phone TEXT, level INT DEFAULT 1, euros INT DEFAULT 50, city TEXT DEFAULT 'paris', created_at TEXT)
phrases  (id TEXT PK, player_id TEXT, text_fr TEXT, text_en TEXT, status TEXT, last_seen TEXT, UNIQUE(player_id, text_fr))
missions (id TEXT PK, player_id TEXT, mission_key TEXT, status TEXT, stars INT DEFAULT 0, hints_used INT DEFAULT 0)
unlocks  (player_id TEXT, district TEXT, PRIMARY KEY(player_id, district))
events   (id TEXT PK, player_id TEXT, source TEXT CHECK(source IN ('game','call','sms')), payload TEXT, created_at TEXT)
```

## Mission definitions (`packages/shared/src/missions.ts`)

| Mission | NPC | Goal | Required phrases | Bonus phrases |
|---|---|---|---|---|
| `sim_kiosk` | `clerk` | Buy a SIM card | `bonjour`, `je voudrais une carte SIM` | `merci` |
| `cafe_order` | `barista` | Order a coffee | `bonjour`, `je voudrais un café`, `s'il vous plaît` | `c'est combien ?`, `merci` |

## Game ↔ test hooks

The game exposes `window.__backpack` in dev and test builds, so Playwright can drive it without pixel-hunting:

```ts
{ scene(): string; playerId(): string | null; teleport(x: number, y: number): void;
  talk(npcId: string, text: string): Promise<NpcTurnResponse>;  // the text path of hold-to-talk
  submitPhone(phone: string): Promise<void>; skipEvening(): Promise<void>;
  state(): PlayerState | null; enter(scene: string): void;
  doors(): { name: string; to: string; x: number; y: number }[];   // door triggers in the current scene
  ui(): { dialogue: string | null; phoneOpen: boolean; phoneFormOpen: boolean; messages: number;
          activeMission: string | null; backpack: string[]; marketUnlocked: boolean; skipEveningVisible: boolean } }
```

Door names: Airport has `exit` (to Street). Street has `airport`, `cafe` (stays in Street; it marks the café area where the `barista` stands), `hostel` (to Hostel) and `market` (blocked until unlocked). Hostel has `street`. Teleporting onto a door that leads to another scene switches scenes within 1 s.

## Server data layer

`apps/server/src/db/repo.ts` (owned by the integrator) is the only place that writes SQL: `createPlayer`, `getState`, `setPhone`, `logTurn`, `markMastered`, `missedPhrases`, `completeMission`, `awardStar`, `unlock`, `addEvent`, `summary`, and others. Routes use `deps.repo`. If a lane needs a new repo function, it adds it at the bottom of `repo.ts` and says so in its report.

## Assets

`apps/game/public/assets/manifest.json` is owned by the assets lane:

```json
{ "images": { "airport_bg": "airport_bg.png", "street_bg": "street_bg.png", "hostel_bg": "hostel_bg.png",
              "player": "player.png", "npc_clerk": "npc_clerk.png", "npc_barista": "npc_barista.png",
              "npc_girard": "npc_girard.png", "npc_margaux": "npc_margaux.png" } }
```

The game loads the manifest at boot and loads each image it lists. Every scene must still render if a texture is missing, by falling back to a colored rectangle. Backgrounds are 960×540; character sprites are 32×32 (a single frame at L1).

## Level 2 additions (real Dial, real Gemini)

Dial reference docs are vendored in `docs/vendor/dial/`. The API is `https://api.getdial.ai`, authenticated with `Authorization: Bearer $DIAL_API_KEY`.

**Env:** `DIAL_API_KEY`, `DIAL_FROM_NUMBER_ID` (the Dial number Luna calls and texts from), `DIAL_WEBHOOK_SECRET` (`whsec_…`; signature checks are skipped when it's unset), `DIAL_CALL_LANGUAGE` (default `fr-FR`), `PUBLIC_URL` (https tunnel or deploy), `GEMINI_API_KEY`.

**DialAdapter**
- `call`: `POST /v1/calls {to, fromNumberId, outboundInstruction, language}`; the response `id` is the `call_id`.
- `sms`: `POST /v1/messages` (see `send-message.md`).
- `getCall(id)`: `GET /v1/calls/{id}`, mapping `transcriptTurns` speakers `agent` → `luna` and `user` → `player`; `transfer_target` turns are dropped.

**`POST /dial/webhook` accepts two body shapes:**
1. Our normalized `DialTranscript` (mocks and tests). Unchanged.
2. A Dial event envelope `{id, type, data, ...}` with the headers `X-Dial-Event-Type`, `X-Dial-Event-ID` and `X-Dial-Signature: t=…,v1=…`:
   - When `DIAL_WEBHOOK_SECRET` is set, the signature is checked as HMAC-SHA256 over `${t}.${rawBody}` and must be at most 300 s old. A bad signature gets **401**.
   - Deliveries are deduplicated on the event id: a redelivery returns **200** and does nothing. The event id is stored in the `call` event payload.
   - `call.transcribed`: look up the player and kind (`intro`/`debrief`) from the `call` event written when the call was placed (its payload has `call_id`), call `dial.getCall(callId)`, then run the same grading as shape 1.
   - Every other type (`webhook.ping`, `call.ended`, …), and any unknown call id, gets 200 and is ignored. Dial retries anything that isn't 2xx, so we never answer 404 to Dial.

**MCP per-call authorization:**
- When the `X-Dial-User-Number` header is present, every tool acts only on the player whose `phone` equals that number.
- `player_id` becomes optional: if it's omitted, the player is resolved from the header. If it's given but doesn't match the header's player, the tool returns `isError: true`.
- With no header (local tests, tool discovery), `player_id` is required, as in L1.
- `district` is validated with `District`, and `mission_id` with `MissionKey`.

**NpcTurnInput** now includes `npcId`.

## Level 3 additions (full loop with live state)

No new shapes. L3 makes the existing contract true end to end:
- Café mission grading writes phrases into `phrases`, and the backpack shows the mastered ones.
- `/skip-evening` places a debrief call whose instruction names today's missed phrases. The `/dial/webhook` grading masters the phrases the player says, and on a debrief it unlocks `market`.
- Luna's Dial agent uses Context MCP at `${PUBLIC_URL}/mcp`, so `mark_phrase_mastered` and `unlock_district` reach the game through `/state` polling in under 4 s.
- `girard` (Street bench) and `margaux` (Street boulangerie) are open play: no mission key, `mission_complete: null`, phrases still logged.

## Level 4 additions (P1)

- **Euros** (`ECONOMY` in `missions.ts`): completing a mission subtracts `ECONOMY.missionCost[key]`. An NPC turn with a non-empty `phrases_missed` and mood `impatient` or `cold` subtracts `ECONOMY.fumblePenalty`. The floor is 0. The repo adds `spendEuros(playerId, n)`.
- **Stars**: on mission completion the server sets `stars = starsForHints(hints_used)`. The MCP tool `award_star` still adds 1 (max 3).
- **Adaptive NPCs**: at `level` 1, personas speak slowly in short sentences, and `reply_en_hint` may begin with a stage direction in asterisks (`*points at the menu*`), which the dialogue box shows in italics. TTS speaks at a slower rate at level 1. No schema change.
- **Inès** (`ines`, Hostel desk) and **Théo** (`theo`, Street corner) are open play. The manifest adds `npc_ines` and `npc_theo`.
- **Hostel day summary** shows phrases learned, stars per mission, and euros left.
