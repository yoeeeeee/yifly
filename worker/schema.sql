CREATE TABLE IF NOT EXISTS orders (
  order_id TEXT PRIMARY KEY,
  merchant_trade_no TEXT NOT NULL UNIQUE,
  amount INTEGER NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending' CHECK(status IN ('pending','paid','failed')),
  created_at TEXT NOT NULL,
  paid_at TEXT,
  trade_no TEXT,
  payment_type TEXT,
  rtn_code TEXT
);
