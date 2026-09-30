ALTER TABLE subscriptions ADD COLUMN cancel_at_period_end INTEGER NOT NULL DEFAULT 0;
ALTER TABLE subscriptions ADD COLUMN cancellation_request_id TEXT;
ALTER TABLE subscriptions ADD COLUMN cancellation_requested_at TEXT;

CREATE INDEX IF NOT EXISTS idx_subscriptions_cancellation_request
  ON subscriptions(cancellation_request_id);
