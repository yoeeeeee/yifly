ALTER TABLE subscriptions ADD COLUMN pending_expires_at TEXT;
ALTER TABLE subscriptions ADD COLUMN terminal_period_end TEXT;

CREATE TABLE IF NOT EXISTS subscription_slots (
  firebase_uid TEXT PRIMARY KEY,
  subscription_id TEXT NOT NULL UNIQUE,
  reserved_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_subscriptions_pending_expiry
  ON subscriptions(status, pending_expires_at);
