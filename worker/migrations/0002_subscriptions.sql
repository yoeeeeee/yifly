CREATE TABLE IF NOT EXISTS subscriptions (
  id TEXT PRIMARY KEY,
  firebase_uid TEXT NOT NULL,
  provider TEXT NOT NULL CHECK(provider = 'ecpay'),
  merchant_trade_no TEXT NOT NULL UNIQUE,
  amount INTEGER NOT NULL CHECK(amount > 0),
  currency TEXT NOT NULL DEFAULT 'TWD',
  interval TEXT NOT NULL CHECK(interval = 'month'),
  status TEXT NOT NULL DEFAULT 'pending' CHECK(status IN ('pending','active','past_due','cancelled','expired')),
  started_at TEXT,
  current_period_start TEXT,
  current_period_end TEXT,
  cancelled_at TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_subscriptions_uid_status
  ON subscriptions(firebase_uid, status, created_at DESC);

CREATE TABLE IF NOT EXISTS subscription_payments (
  id TEXT PRIMARY KEY,
  subscription_id TEXT NOT NULL REFERENCES subscriptions(id),
  provider_trade_no TEXT,
  period_number INTEGER NOT NULL CHECK(period_number > 0),
  amount INTEGER NOT NULL CHECK(amount > 0),
  currency TEXT NOT NULL DEFAULT 'TWD',
  status TEXT NOT NULL CHECK(status IN ('paid','failed')),
  paid_at TEXT,
  failure_code TEXT,
  failure_message TEXT,
  created_at TEXT NOT NULL,
  UNIQUE(subscription_id, period_number),
  UNIQUE(provider_trade_no)
);

CREATE INDEX IF NOT EXISTS idx_subscription_payments_subscription
  ON subscription_payments(subscription_id, created_at DESC);
