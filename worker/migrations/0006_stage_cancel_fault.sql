CREATE TABLE stage_fault_injections (
  fault_type TEXT PRIMARY KEY CHECK(fault_type = 'cancel_response_loss'),
  subscription_id TEXT NOT NULL,
  armed_at TEXT NOT NULL,
  consumed_at TEXT,
  consumed_request_id TEXT
);
-- Intentionally empty. Arming is an explicit operator action, never a request action.
