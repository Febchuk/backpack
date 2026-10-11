import { randomBytes } from "node:crypto";
import { nanoid } from "nanoid";
import type { AgentView, Channel, EventView, LearnerView } from "@backpack/shared/coach";
import type { Db } from "./db";

export type Agent = AgentView;
export type Learner = LearnerView;
export type CoachEvent = EventView & { learner_id: string; dial_id: string | null };

const iso = (v: unknown) => (v instanceof Date ? v.toISOString() : String(v));
const withIso = <T extends { created_at: unknown }>(row: T) => ({ ...row, created_at: iso(row.created_at) });

type AgentPatch = Partial<Omit<Agent, "id" | "created_at">>;
type LearnerPatch = Partial<Pick<Learner, "display_name" | "level" | "onboarding_step">>;

/** Builds `SET a = $2, b = $3` from a patch; params start after the id at $1. */
function setClause(patch: Record<string, unknown>) {
  const keys = Object.keys(patch).filter((k) => patch[k] !== undefined);
  return { sql: keys.map((k, i) => `${k} = $${i + 2}`).join(", "), values: keys.map((k) => patch[k]) };
}

export function repo(db: Db) {
  const one = async <T>(sql: string, params: unknown[]) => (await db.query<T>(sql, params)).rows[0] ?? null;

  const r = {
    // ─── agents ───
    async createAgent(input: { name: string; language: string; persona_city: string }): Promise<Agent> {
      const row = await one<Agent>(
        `INSERT INTO agents (id, name, language, persona_city) VALUES ($1, $2, $3, $4) RETURNING *`,
        [`ag_${nanoid(10)}`, input.name, input.language, input.persona_city],
      );
      return withIso(row!);
    },
    async getAgent(id: string): Promise<Agent | null> {
      const row = await one<Agent>(`SELECT * FROM agents WHERE id = $1`, [id]);
      return row && withIso(row);
    },
    async listAgents(): Promise<Agent[]> {
      return (await db.query<Agent>(`SELECT * FROM agents ORDER BY created_at DESC`)).rows.map(withIso);
    },
    /** The agent that owns a Dial line, by E.164 number or Dial number id. */
    async agentByNumber(numberOrId: string): Promise<Agent | null> {
      const row = await one<Agent>(`SELECT * FROM agents WHERE dial_number = $1 OR dial_number_id = $1`, [numberOrId]);
      return row && withIso(row);
    },
    async updateAgent(id: string, patch: AgentPatch): Promise<Agent | null> {
      const { sql, values } = setClause(patch);
      if (!sql) return r.getAgent(id);
      const row = await one<Agent>(`UPDATE agents SET ${sql} WHERE id = $1 RETURNING *`, [id, ...values]);
      return row && withIso(row);
    },
    async deleteAgent(id: string) {
      await db.query(`DELETE FROM agents WHERE id = $1`, [id]);
    },

    // ─── learners ───
    /** Idempotent on (agent, phone): returns the existing learner if already registered. */
    async upsertLearner(agentId: string, phone: string, displayName?: string | null): Promise<{ learner: Learner; created: boolean }> {
      const inserted = await one<Learner>(
        `INSERT INTO learners (id, agent_id, phone, display_name) VALUES ($1, $2, $3, $4)
         ON CONFLICT (agent_id, phone) DO NOTHING RETURNING *`,
        [`ln_${nanoid(10)}`, agentId, phone, displayName ?? null],
      );
      if (inserted) return { learner: withIso(inserted), created: true };
      return { learner: (await r.learnerByPhone(agentId, phone))!, created: false };
    },
    async getLearner(id: string): Promise<Learner | null> {
      const row = await one<Learner>(`SELECT * FROM learners WHERE id = $1`, [id]);
      return row && withIso(row);
    },
    async learnerByPhone(agentId: string, phone: string): Promise<Learner | null> {
      const row = await one<Learner>(`SELECT * FROM learners WHERE agent_id = $1 AND phone = $2`, [agentId, phone]);
      return row && withIso(row);
    },
    async listLearners(agentId: string): Promise<Learner[]> {
      return (await db.query<Learner>(`SELECT * FROM learners WHERE agent_id = $1 ORDER BY created_at`, [agentId])).rows.map(withIso);
    },
    async updateLearner(id: string, patch: LearnerPatch): Promise<Learner | null> {
      const { sql, values } = setClause(patch);
      if (!sql) return r.getLearner(id);
      const row = await one<Learner>(`UPDATE learners SET ${sql} WHERE id = $1 RETURNING *`, [id, ...values]);
      return row && withIso(row);
    },
    /** Wipes the learner and, by cascade, their events, memories and media. Graph rows are removed by Memory.forget. */
    async deleteLearner(id: string) {
      await db.query(`DELETE FROM learners WHERE id = $1`, [id]);
    },

    // ─── events ───
    /** Returns null when `dial_id` was already stored: the caller has a duplicate delivery. */
    async addEvent(input: {
      learner_id: string;
      channel: Channel;
      direction: "in" | "out";
      text: string;
      media_url?: string | null;
      dial_id?: string | null;
      feedback?: CoachEvent["feedback"];
    }): Promise<CoachEvent | null> {
      const row = await one<CoachEvent>(
        `INSERT INTO events (id, learner_id, channel, direction, text, media_url, dial_id, feedback)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8) ON CONFLICT (dial_id) DO NOTHING RETURNING *`,
        [
          `ev_${nanoid(12)}`,
          input.learner_id,
          input.channel,
          input.direction,
          input.text,
          input.media_url ?? null,
          input.dial_id ?? null,
          input.feedback ? JSON.stringify(input.feedback) : null,
        ],
      );
      return row && withIso(row);
    },
    async getEvent(id: string): Promise<CoachEvent | null> {
      const row = await one<CoachEvent>(`SELECT * FROM events WHERE id = $1`, [id]);
      return row && withIso(row);
    },
    async updateEventFeedback(id: string, feedback: CoachEvent["feedback"]) {
      await db.query(`UPDATE events SET feedback = $2 WHERE id = $1`, [id, JSON.stringify(feedback)]);
    },
    async hasDialId(dialId: string): Promise<boolean> {
      return !!(await one(`SELECT 1 FROM events WHERE dial_id = $1`, [dialId]));
    },
    /** The last `limit` events, oldest first. */
    async recentEvents(learnerId: string, limit = 10): Promise<CoachEvent[]> {
      const { rows } = await db.query<CoachEvent>(
        `SELECT * FROM (SELECT * FROM events WHERE learner_id = $1 ORDER BY seq DESC LIMIT $2) e ORDER BY seq`,
        [learnerId, limit],
      );
      return rows.map(withIso);
    },

    // ─── media ───
    async putMedia(learnerId: string | null, mimeType: string, data: Buffer): Promise<string> {
      const id = randomBytes(18).toString("base64url");
      await db.query(`INSERT INTO media (id, learner_id, mime_type, data) VALUES ($1, $2, $3, $4)`, [id, learnerId, mimeType, data]);
      return id;
    },
    async getMedia(id: string): Promise<{ mime_type: string; data: Buffer } | null> {
      const row = await one<{ mime_type: string; data: Uint8Array }>(`SELECT mime_type, data FROM media WHERE id = $1`, [id]);
      return row && { mime_type: row.mime_type, data: Buffer.from(row.data) };
    },
  };
  return r;
}

export type Repo = ReturnType<typeof repo>;
