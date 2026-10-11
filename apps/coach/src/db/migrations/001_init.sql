CREATE EXTENSION IF NOT EXISTS vector;

CREATE TABLE IF NOT EXISTS agents (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  language TEXT NOT NULL,                 -- BCP-47, e.g. fr-FR
  persona_city TEXT NOT NULL,
  voice_id TEXT,                          -- ElevenLabs voice on this account
  voice_source TEXT,                      -- library | designed
  voice_description TEXT,
  el_agent_id TEXT,                       -- ElevenLabs Agents id used on calls
  dial_number_id TEXT UNIQUE,
  dial_number TEXT UNIQUE,                -- E.164, set once Dial reports it
  setup_status TEXT NOT NULL DEFAULT 'none', -- none | provisioning | ready | failed
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS learners (
  id TEXT PRIMARY KEY,
  agent_id TEXT NOT NULL REFERENCES agents(id) ON DELETE CASCADE,
  phone TEXT NOT NULL,                    -- E.164
  display_name TEXT,
  level TEXT,                             -- A1..C1
  onboarding_step TEXT NOT NULL DEFAULT 'trip',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (agent_id, phone)
);

CREATE TABLE IF NOT EXISTS events (
  id TEXT PRIMARY KEY,
  learner_id TEXT NOT NULL REFERENCES learners(id) ON DELETE CASCADE,
  channel TEXT NOT NULL,                  -- sms | voice_note | call
  direction TEXT NOT NULL,                -- in | out
  text TEXT NOT NULL DEFAULT '',
  media_url TEXT,
  dial_id TEXT UNIQUE,                    -- Dial message/call/event id: idempotency key
  feedback JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT clock_timestamp()
);
CREATE INDEX IF NOT EXISTS events_learner_idx ON events (learner_id, created_at);

-- Vector store: free-text memories about a learner.
CREATE TABLE IF NOT EXISTS memories (
  id TEXT PRIMARY KEY,
  learner_id TEXT NOT NULL REFERENCES learners(id) ON DELETE CASCADE,
  text TEXT NOT NULL,
  source TEXT NOT NULL,                   -- sms | voice_note | call | tool
  source_event_id TEXT,
  embedding vector(768) NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS memories_embedding_idx ON memories USING hnsw (embedding vector_cosine_ops);
CREATE INDEX IF NOT EXISTS memories_learner_idx ON memories (learner_id);

-- Knowledge graph. Node ids: 'learner:<id>', 'place:lyon', 'topic:food', 'thing:tea', 'person:sister', 'phrase:<text>'.
CREATE TABLE IF NOT EXISTS kg_nodes (
  id TEXT PRIMARY KEY,
  kind TEXT NOT NULL,
  label TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS kg_edges (
  src TEXT NOT NULL REFERENCES kg_nodes(id) ON DELETE CASCADE,
  rel TEXT NOT NULL,
  dst TEXT NOT NULL REFERENCES kg_nodes(id) ON DELETE CASCADE,
  weight REAL NOT NULL DEFAULT 1,
  evidence_event_id TEXT,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (src, rel, dst)
);
CREATE INDEX IF NOT EXISTS kg_edges_dst_idx ON kg_edges (dst, rel);

-- Voice notes we synthesise, served publicly at /media/<id>.mp3 so Dial can fetch them.
CREATE TABLE IF NOT EXISTS media (
  id TEXT PRIMARY KEY,                    -- unguessable
  learner_id TEXT REFERENCES learners(id) ON DELETE CASCADE,
  mime_type TEXT NOT NULL,
  data BYTEA NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
