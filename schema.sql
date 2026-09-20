PRAGMA foreign_keys = ON;
CREATE TABLE IF NOT EXISTS customers (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  email TEXT,
  phone TEXT,
  address TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE TABLE IF NOT EXISTS items (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  description TEXT,
  selling_price REAL NOT NULL DEFAULT 0,
  internal_cost REAL NOT NULL DEFAULT 0,
  quantity REAL NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE TABLE IF NOT EXISTS quotations (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  quote_number TEXT NOT NULL UNIQUE,
  customer_id INTEGER,
  quote_date TEXT NOT NULL,
  validity_days INTEGER NOT NULL DEFAULT 30,
  status TEXT NOT NULL DEFAULT 'Draft',
  subtotal REAL NOT NULL DEFAULT 0,
  additional_costs REAL NOT NULL DEFAULT 0,
  profit REAL NOT NULL DEFAULT 0,
  total REAL NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (customer_id) REFERENCES customers(id)
);
CREATE TABLE IF NOT EXISTS quotation_lines (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  quotation_id INTEGER NOT NULL,
  item_id INTEGER,
  description TEXT NOT NULL,
  quantity REAL NOT NULL DEFAULT 1,
  selling_price REAL NOT NULL DEFAULT 0,
  internal_cost REAL NOT NULL DEFAULT 0,
  profit REAL NOT NULL DEFAULT 0,
  FOREIGN KEY (quotation_id) REFERENCES quotations(id) ON DELETE CASCADE,
  FOREIGN KEY (item_id) REFERENCES items(id)
);
CREATE TABLE IF NOT EXISTS quotation_additional_costs (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  quotation_id INTEGER NOT NULL,
  description TEXT NOT NULL,
  amount REAL NOT NULL DEFAULT 0,
  FOREIGN KEY (quotation_id) REFERENCES quotations(id) ON DELETE CASCADE
);
CREATE INDEX IF NOT EXISTS idx_quotations_created_at ON quotations(created_at);
CREATE INDEX IF NOT EXISTS idx_items_name ON items(name);