CREATE TABLE IF NOT EXISTS players (
  id TEXT PRIMARY KEY,
  phone TEXT,
  level INTEGER NOT NULL DEFAULT 1,
  euros INTEGER NOT NULL DEFAULT 50,
  city TEXT NOT NULL DEFAULT 'paris',
  created_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS phrases (
  id TEXT PRIMARY KEY,
  player_id TEXT NOT NULL,
  text_fr TEXT NOT NULL,
  text_en TEXT,
  status TEXT NOT NULL CHECK (status IN ('missed','practicing','mastered')),
  last_seen TEXT NOT NULL,
  UNIQUE (player_id, text_fr)
);
CREATE TABLE IF NOT EXISTS missions (
  id TEXT PRIMARY KEY,
  player_id TEXT NOT NULL,
  mission_key TEXT NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('locked','active','done')),
  stars INTEGER NOT NULL DEFAULT 0,
  hints_used INTEGER NOT NULL DEFAULT 0,
  UNIQUE (player_id, mission_key)
);
CREATE TABLE IF NOT EXISTS unlocks (
  player_id TEXT NOT NULL,
  district TEXT NOT NULL,
  PRIMARY KEY (player_id, district)
);
CREATE TABLE IF NOT EXISTS events (
  id TEXT PRIMARY KEY,
  player_id TEXT NOT NULL,
  source TEXT NOT NULL CHECK (source IN ('game','call','sms')),
  payload TEXT NOT NULL,
  created_at TEXT NOT NULL
);
