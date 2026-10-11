import { nanoid } from "nanoid";
import { ECONOMY, GLOSSARY, MISSIONS, PlayerState, normalizePhrase, starsForHints, type MissionKey } from "@backpack/shared";
import type { Db } from "./db";

const now = () => new Date().toISOString();

export type EventSource = "game" | "call" | "sms";

/** Data access shared by every route. Lanes call these instead of writing SQL in routes. */
export function repo(db: Db) {
  const findPhrase = (playerId: string, text: string) => {
    const norm = normalizePhrase(text);
    const rows = db.prepare("SELECT id, text_fr, status FROM phrases WHERE player_id = ?").all(playerId) as {
      id: string;
      text_fr: string;
      status: string;
    }[];
    return rows.find((r) => normalizePhrase(r.text_fr) === norm);
  };

  const upsertPhrase = (playerId: string, text: string, status: "missed" | "practicing" | "mastered") => {
    const existing = findPhrase(playerId, text);
    if (existing) {
      db.prepare("UPDATE phrases SET status = ?, last_seen = ? WHERE id = ?").run(status, now(), existing.id);
    } else {
      db.prepare("INSERT INTO phrases (id, player_id, text_fr, text_en, status, last_seen) VALUES (?, ?, ?, ?, ?, ?)").run(
        nanoid(),
        playerId,
        text,
        GLOSSARY[text] ?? null,
        status,
        now(),
      );
    }
  };

  const self = {
    playerExists(playerId: string): boolean {
      return !!db.prepare("SELECT 1 FROM players WHERE id = ?").get(playerId);
    },

    createPlayer(): string {
      const id = `p_${nanoid(10)}`;
      const tx = db.transaction(() => {
        db.prepare("INSERT INTO players (id, created_at) VALUES (?, ?)").run(id, now());
        for (const key of Object.keys(MISSIONS) as MissionKey[]) {
          db.prepare("INSERT INTO missions (id, player_id, mission_key, status) VALUES (?, ?, ?, ?)").run(
            nanoid(),
            id,
            key,
            key === "sim_kiosk" ? "active" : "locked",
          );
        }
      });
      tx();
      return id;
    },

    getState(playerId: string): PlayerState | null {
      const p = db.prepare("SELECT id, phone, level, euros, city FROM players WHERE id = ?").get(playerId) as
        | PlayerState["player"]
        | undefined;
      if (!p) return null;
      const phrases = db
        .prepare("SELECT id, text_fr, text_en, status, last_seen FROM phrases WHERE player_id = ? ORDER BY last_seen DESC")
        .all(playerId);
      const missions = db
        .prepare("SELECT mission_key, status, stars, hints_used FROM missions WHERE player_id = ? ORDER BY rowid")
        .all(playerId);
      const unlocks = (db.prepare("SELECT district FROM unlocks WHERE player_id = ?").all(playerId) as { district: string }[]).map(
        (u) => u.district,
      );
      const messages = (
        db.prepare("SELECT id, payload, created_at FROM events WHERE player_id = ? AND source = 'sms' ORDER BY created_at, rowid").all(
          playerId,
        ) as { id: string; payload: string; created_at: string }[]
      ).map((e) => ({ id: e.id, from: "luna" as const, body: JSON.parse(e.payload).body as string, created_at: e.created_at }));
      return PlayerState.parse({ player: p, phrases, missions, unlocks, messages });
    },

    setPhone(playerId: string, phone: string) {
      db.prepare("UPDATE players SET phone = ? WHERE id = ?").run(phone, playerId);
    },

    /** Used phrases: new/missed → practicing, practicing/mastered → mastered. Missed: never downgrades mastered. */
    logTurn(playerId: string, used: string[], missed: string[]) {
      const tx = db.transaction(() => {
        for (const text of used) {
          const ex = findPhrase(playerId, text);
          upsertPhrase(playerId, ex?.text_fr ?? text, ex && ex.status !== "missed" ? "mastered" : "practicing");
        }
        for (const text of missed) {
          const ex = findPhrase(playerId, text);
          if (ex?.status === "mastered") continue;
          upsertPhrase(playerId, ex?.text_fr ?? text, "missed");
        }
      });
      tx();
    },

    markMastered(playerId: string, text: string) {
      const ex = findPhrase(playerId, text);
      upsertPhrase(playerId, ex?.text_fr ?? text, "mastered");
    },

    missedPhrases(playerId: string): string[] {
      return (
        db.prepare("SELECT text_fr FROM phrases WHERE player_id = ? AND status = 'missed' ORDER BY last_seen DESC, rowid DESC").all(
          playerId,
        ) as { text_fr: string }[]
      ).map((r) => r.text_fr);
    },

    phraseStatus(playerId: string, text: string): string | null {
      return findPhrase(playerId, text)?.status ?? null;
    },

    /** Marks a mission done and activates the next one in the chain. */
    completeMission(playerId: string, key: MissionKey) {
      const tx = db.transaction(() => {
        db.prepare("UPDATE missions SET status = 'done' WHERE player_id = ? AND mission_key = ?").run(playerId, key);
        const next = MISSIONS[key].next;
        if (next)
          db.prepare("UPDATE missions SET status = 'active' WHERE player_id = ? AND mission_key = ? AND status = 'locked'").run(
            playerId,
            next,
          );
      });
      tx();
    },

    missionStatus(playerId: string, key: string): string | null {
      const row = db.prepare("SELECT status FROM missions WHERE player_id = ? AND mission_key = ?").get(playerId, key) as
        | { status: string }
        | undefined;
      return row?.status ?? null;
    },

    addHint(playerId: string, key: string) {
      db.prepare("UPDATE missions SET hints_used = hints_used + 1 WHERE player_id = ? AND mission_key = ?").run(playerId, key);
    },

    awardStar(playerId: string, key: string) {
      db.prepare("UPDATE missions SET stars = MIN(stars + 1, 3) WHERE player_id = ? AND mission_key = ?").run(playerId, key);
    },

    unlock(playerId: string, district: string) {
      db.prepare("INSERT OR IGNORE INTO unlocks (player_id, district) VALUES (?, ?)").run(playerId, district);
    },

    addEvent(playerId: string, source: EventSource, payload: unknown) {
      db.prepare("INSERT INTO events (id, player_id, source, payload, created_at) VALUES (?, ?, ?, ?, ?)").run(
        nanoid(),
        playerId,
        source,
        JSON.stringify(payload),
        now(),
      );
    },

    summary(playerId: string) {
      const s = self.getState(playerId);
      if (!s) return null;
      return { level: s.player.level, missions_done: s.missions.filter((m) => m.status === "done").length, city: s.player.city };
    },

    /** L2 backend: the `call` event written when a call was placed (`{type:"placed", call_id, kind}`). */
    findPlacedCall(callId: string): { player_id: string; kind: "intro" | "debrief" } | null {
      const row = db
        .prepare(
          "SELECT player_id, json_extract(payload, '$.kind') AS kind FROM events WHERE source = 'call' AND json_extract(payload, '$.type') = 'placed' AND json_extract(payload, '$.call_id') = ? ORDER BY rowid DESC LIMIT 1",
        )
        .get(callId) as { player_id: string; kind: string } | undefined;
      if (!row || (row.kind !== "intro" && row.kind !== "debrief")) return null;
      return { player_id: row.player_id, kind: row.kind };
    },

    /** L2 backend: true once a Dial webhook delivery with this event id has been stored on a `call` event. */
    hasDialEvent(eventId: string): boolean {
      return !!db
        .prepare("SELECT 1 FROM events WHERE source = 'call' AND json_extract(payload, '$.dial_event_id') = ? LIMIT 1")
        .get(eventId);
    },

    /** L2 backend: the newest player whose phone matches (ignoring spaces, dashes, dots and parentheses). */
    playerByPhone(phone: string): string | null {
      const norm = (p: string) => p.replace(/[\s\-().]/g, "");
      const want = norm(phone);
      if (!want) return null;
      const rows = db
        .prepare("SELECT id, phone FROM players WHERE phone IS NOT NULL ORDER BY created_at DESC, rowid DESC")
        .all() as { id: string; phone: string }[];
      return rows.find((r) => norm(r.phone) === want)?.id ?? null;
    },

    /** L4 backend: subtracts euros, never going below 0. */
    spendEuros(playerId: string, n: number) {
      db.prepare("UPDATE players SET euros = MAX(euros - ?, 0) WHERE id = ?").run(Math.max(0, n), playerId);
    },

    /**
     * L4 backend: completes a mission once. The first completion runs `completeMission`, sets
     * stars = starsForHints(hints_used) and charges ECONOMY.missionCost. Returns false if it was already done.
     */
    settleMission(playerId: string, key: MissionKey): boolean {
      let settled = false;
      db.transaction(() => {
        const row = db.prepare("SELECT status, hints_used FROM missions WHERE player_id = ? AND mission_key = ?").get(playerId, key) as
          | { status: string; hints_used: number }
          | undefined;
        if (!row || row.status === "done") return;
        self.completeMission(playerId, key);
        db.prepare("UPDATE missions SET stars = ? WHERE player_id = ? AND mission_key = ?").run(starsForHints(row.hints_used), playerId, key);
        self.spendEuros(playerId, ECONOMY.missionCost[key]);
        settled = true;
      })();
      return settled;
    },
  };
  return self;
}

export type Repo = ReturnType<typeof repo>;
