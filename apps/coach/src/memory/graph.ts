import type { FactView, Relation } from "@backpack/shared/coach";
import type { Db } from "../db/db";

const OBJECT_KIND: Partial<Record<Relation, string>> = {
  trip_to: "place",
  travelling_with: "person",
  knows_phrase: "phrase",
  level: "level",
  trip_date: "date",
};

/** Relations a learner holds at most one of: a new value replaces the old. */
const SINGLE_VALUED: Relation[] = ["level", "trip_date"];

const OPPOSITE: Partial<Record<Relation, Relation>> = { likes: "dislikes", dislikes: "likes" };

export const learnerNode = (learnerId: string) => `learner:${learnerId}`;

/** Trimmed, lowercased, single-spaced; CEFR levels stay uppercase ("A2"). */
export function normalizeLabel(rel: Relation, object: string): string {
  const label = object.trim().replace(/\s+/g, " ").toLowerCase();
  return rel === "level" ? label.toUpperCase() : label;
}

export function objectNode(rel: Relation, object: string) {
  const kind = OBJECT_KIND[rel] ?? "topic";
  const label = normalizeLabel(rel, object);
  return { id: `${kind}:${label}`, kind, label };
}

export function createGraph(db: Db) {
  const upsertNode = (id: string, kind: string, label: string) =>
    db.query(`INSERT INTO kg_nodes (id, kind, label) VALUES ($1, $2, $3) ON CONFLICT (id) DO NOTHING`, [id, kind, label]);

  return {
    async upsertEdge(learnerId: string, rel: Relation, object: string, evidenceEventId: string | null = null) {
      const dst = objectNode(rel, object);
      if (!dst.label) return;
      const src = learnerNode(learnerId);
      await upsertNode(src, "learner", learnerId);
      await upsertNode(dst.id, dst.kind, dst.label);
      const opposite = OPPOSITE[rel];
      if (opposite) await db.query(`DELETE FROM kg_edges WHERE src = $1 AND rel = $2 AND dst = $3`, [src, opposite, dst.id]);
      if (SINGLE_VALUED.includes(rel))
        await db.query(`DELETE FROM kg_edges WHERE src = $1 AND rel = $2 AND dst <> $3`, [src, rel, dst.id]);
      await db.query(
        `INSERT INTO kg_edges (src, rel, dst, evidence_event_id) VALUES ($1, $2, $3, $4)
         ON CONFLICT (src, rel, dst) DO UPDATE SET weight = kg_edges.weight + 1, updated_at = now(),
           evidence_event_id = COALESCE(EXCLUDED.evidence_event_id, kg_edges.evidence_event_id)`,
        [src, rel, dst.id, evidenceEventId],
      );
    },

    /** The learner's facts, most recently touched first. */
    async facts(learnerId: string): Promise<FactView[]> {
      const { rows } = await db.query<{ rel: Relation; object: string; weight: number; updated_at: unknown }>(
        `SELECT e.rel, n.label AS object, e.weight, e.updated_at
         FROM kg_edges e JOIN kg_nodes n ON n.id = e.dst
         WHERE e.src = $1 ORDER BY e.updated_at DESC, e.rel, n.label`,
        [learnerNode(learnerId)],
      );
      return rows.map((r) => ({
        rel: r.rel,
        object: r.object,
        weight: Number(r.weight),
        updated_at: r.updated_at instanceof Date ? r.updated_at.toISOString() : String(r.updated_at),
      }));
    },

    /** Removes the learner's edges and node. Object nodes are shared between learners and stay. */
    async forget(learnerId: string) {
      const src = learnerNode(learnerId);
      await db.query(`DELETE FROM kg_edges WHERE src = $1`, [src]);
      await db.query(`DELETE FROM kg_nodes WHERE id = $1`, [src]);
    },
  };
}

export type Graph = ReturnType<typeof createGraph>;
