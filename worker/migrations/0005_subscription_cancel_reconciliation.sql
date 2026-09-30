ALTER TABLE subscriptions ADD COLUMN cancel_state TEXT NOT NULL DEFAULT 'none'
  CHECK(cancel_state IN ('none','pending','confirmed','reconciliation_required'));
ALTER TABLE subscriptions ADD COLUMN cancellation_checked_at TEXT;
CREATE INDEX idx_subscription_cancel_state ON subscriptions(cancel_state,cancellation_requested_at);
