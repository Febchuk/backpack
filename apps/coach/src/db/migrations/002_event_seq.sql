-- Insertion order for events: created_at can tie between writes in the same instant.
ALTER TABLE events ADD COLUMN IF NOT EXISTS seq BIGSERIAL;
CREATE INDEX IF NOT EXISTS events_learner_seq_idx ON events (learner_id, seq);
