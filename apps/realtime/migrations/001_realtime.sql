-- Durable authoritative state for one realtime game session per deployment.
CREATE TABLE IF NOT EXISTS realtime_snapshots (
  session_id text PRIMARY KEY,
  version bigint NOT NULL,
  schema_version text NOT NULL,
  snapshot jsonb NOT NULL,
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS viewer_progress (
  session_id text NOT NULL,
  viewer_id text NOT NULL,
  username text NOT NULL,
  nickname text NOT NULL,
  progress double precision NOT NULL DEFAULT 0,
  boost_until bigint,
  finish_order integer,
  xp double precision NOT NULL DEFAULT 0,
  crowns integer NOT NULL DEFAULT 0,
  podiums integer NOT NULL DEFAULT 0,
  participations integer NOT NULL DEFAULT 0,
  gift_points double precision NOT NULL DEFAULT 0,
  streak integer NOT NULL DEFAULT 0,
  likes integer NOT NULL DEFAULT 0,
  hype double precision NOT NULL DEFAULT 0,
  best_time_ms bigint,
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (session_id, viewer_id)
);
CREATE INDEX IF NOT EXISTS viewer_progress_leaderboard_idx ON viewer_progress(session_id, xp DESC, crowns DESC, progress DESC);
