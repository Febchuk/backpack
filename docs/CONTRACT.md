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
