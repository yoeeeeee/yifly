CREATE TABLE IF NOT EXISTS users (
  firebase_uid TEXT PRIMARY KEY,
  email TEXT,
  display_name TEXT,
  photo_url TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

ALTER TABLE orders ADD COLUMN firebase_uid TEXT NULL;

CREATE INDEX IF NOT EXISTS idx_orders_firebase_uid_created_at
  ON orders(firebase_uid, created_at DESC);
