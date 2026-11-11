CREATE TABLE IF NOT EXISTS purchase_orders (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  request_key TEXT NOT NULL UNIQUE,
  vendor_id INTEGER NOT NULL REFERENCES vendors(id),
  purpose TEXT NOT NULL CHECK (purpose IN ('Stock', 'Job')),
  reference TEXT,
  expected_date TEXT,
  vendor_quote TEXT,
  delivery_cents INTEGER NOT NULL DEFAULT 0 CHECK (delivery_cents >= 0),
  state TEXT NOT NULL DEFAULT 'Draft' CHECK (state IN ('Draft', 'Ordered', 'Cancelled')),
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CHECK (purpose = 'Stock' OR length(trim(coalesce(reference, ''))) > 0)
);

CREATE TABLE IF NOT EXISTS purchase_order_lines (
  id INTEGER PRIMARY KEY,
  order_id INTEGER NOT NULL REFERENCES purchase_orders(id),
  item_id INTEGER NOT NULL REFERENCES items(id),
  description TEXT NOT NULL,
  unit TEXT NOT NULL,
  quantity REAL NOT NULL CHECK (quantity > 0),
  unit_cents INTEGER NOT NULL CHECK (unit_cents >= 0),
  UNIQUE (order_id, item_id)
);
CREATE INDEX IF NOT EXISTS purchase_lines_by_item ON purchase_order_lines(item_id);

CREATE TABLE IF NOT EXISTS purchase_stock_entries (
  id INTEGER PRIMARY KEY,
  request_key TEXT NOT NULL UNIQUE,
  line_id INTEGER NOT NULL REFERENCES purchase_order_lines(id),
  kind TEXT NOT NULL CHECK (kind IN ('Receive', 'Issue')),
  quantity REAL NOT NULL CHECK (quantity > 0),
  reference TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS purchase_entries_by_line ON purchase_stock_entries(line_id);

CREATE TABLE IF NOT EXISTS purchase_payments (
  id INTEGER PRIMARY KEY,
  request_key TEXT NOT NULL UNIQUE,
  order_id INTEGER NOT NULL REFERENCES purchase_orders(id),
  cents INTEGER NOT NULL CHECK (cents > 0),
  reference TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE (order_id, reference)
);

CREATE TABLE IF NOT EXISTS item_reorder_levels (
  item_id INTEGER PRIMARY KEY REFERENCES items(id) ON DELETE CASCADE,
  quantity REAL NOT NULL CHECK (quantity >= 0)
);

CREATE TABLE IF NOT EXISTS purchase_vendor_quotes (
  id INTEGER PRIMARY KEY,
  request_key TEXT NOT NULL UNIQUE,
  vendor_id INTEGER NOT NULL REFERENCES vendors(id),
  item_id INTEGER NOT NULL REFERENCES items(id),
  unit_cents INTEGER NOT NULL CHECK (unit_cents >= 0),
  quoted_on TEXT NOT NULL,
  lead_days INTEGER CHECK (lead_days >= 0),
  terms TEXT,
  reference TEXT
);
CREATE INDEX IF NOT EXISTS purchase_quotes_by_item ON purchase_vendor_quotes(item_id, vendor_id, quoted_on DESC);

CREATE VIEW IF NOT EXISTS purchase_line_balances AS
SELECT l.*, round(l.quantity * l.unit_cents) AS line_cents,
  round(coalesce(sum(CASE WHEN e.kind = 'Receive' THEN e.quantity END), 0), 3) AS received,
  round(coalesce(sum(CASE WHEN e.kind = 'Issue' THEN e.quantity END), 0), 3) AS issued
FROM purchase_order_lines l
LEFT JOIN purchase_stock_entries e ON e.line_id = l.id
GROUP BY l.id;

CREATE VIEW IF NOT EXISTS purchase_order_balances AS
SELECT p.*,
  printf('PO-%04d', p.id) AS number,
  v.display_name AS vendor_name,
  p.delivery_cents + coalesce((SELECT sum(round(l.quantity * l.unit_cents)) FROM purchase_order_lines l WHERE l.order_id = p.id), 0) AS total_cents,
  coalesce((SELECT sum(cents) FROM purchase_payments WHERE order_id = p.id), 0) AS paid_cents,
  CASE
    WHEN p.state <> 'Ordered' THEN p.state
    WHEN NOT EXISTS (SELECT 1 FROM purchase_line_balances l WHERE l.order_id = p.id AND l.received < l.quantity) THEN 'Received'
    WHEN EXISTS (SELECT 1 FROM purchase_line_balances l WHERE l.order_id = p.id AND l.received > 0) THEN 'Part Received'
    ELSE 'Ordered'
  END AS status
FROM purchase_orders p
JOIN vendors v ON v.id = p.vendor_id;

CREATE VIEW IF NOT EXISTS purchase_item_balances AS
SELECT l.item_id,
  round(sum(CASE WHEN p.purpose = 'Job' THEN l.received - l.issued ELSE 0 END), 3) AS reserved,
  round(sum(CASE WHEN p.purpose = 'Stock' AND p.state = 'Ordered' THEN l.quantity - l.received ELSE 0 END), 3) AS on_order
FROM purchase_line_balances l
JOIN purchase_orders p ON p.id = l.order_id
GROUP BY l.item_id;

CREATE TRIGGER IF NOT EXISTS validate_purchase_stock_entry
BEFORE INSERT ON purchase_stock_entries
WHEN NOT EXISTS (SELECT 1 FROM purchase_stock_entries WHERE request_key = NEW.request_key)
BEGIN
  SELECT CASE WHEN NOT EXISTS (
    SELECT 1 FROM purchase_line_balances l
    JOIN purchase_orders p ON p.id = l.order_id
    JOIN items i ON i.id = l.item_id
    WHERE l.id = NEW.line_id AND p.state = 'Ordered'
    AND (
      (NEW.kind = 'Receive' AND NEW.quantity <= round(l.quantity - l.received, 3))
      OR (NEW.kind = 'Issue' AND p.purpose = 'Job'
          AND NEW.quantity <= round(l.received - l.issued, 3) AND NEW.quantity <= i.quantity)
    )
  ) THEN RAISE(ABORT, 'Quantity exceeds the amount available for this action') END;
END;

CREATE TRIGGER IF NOT EXISTS apply_purchase_stock_entry
AFTER INSERT ON purchase_stock_entries
BEGIN
  UPDATE items
  SET quantity = round(quantity + CASE WHEN NEW.kind = 'Receive' THEN NEW.quantity ELSE -NEW.quantity END, 3)
  WHERE id = (SELECT item_id FROM purchase_order_lines WHERE id = NEW.line_id);
END;

CREATE TRIGGER IF NOT EXISTS validate_purchase_payment
BEFORE INSERT ON purchase_payments
WHEN NOT EXISTS (SELECT 1 FROM purchase_payments WHERE request_key = NEW.request_key)
BEGIN
  SELECT CASE WHEN NOT EXISTS (
    SELECT 1 FROM purchase_order_balances
    WHERE id = NEW.order_id AND state = 'Ordered' AND NEW.cents <= total_cents - paid_cents
  ) THEN RAISE(ABORT, 'Payment exceeds the balance or the order is not approved') END;
END;

CREATE TRIGGER IF NOT EXISTS keep_reserved_purchase_stock
BEFORE UPDATE OF quantity ON items
WHEN NEW.quantity < coalesce((SELECT reserved FROM purchase_item_balances WHERE item_id = OLD.id), 0)
BEGIN
  SELECT RAISE(ABORT, 'Stock cannot be set below the quantity reserved for jobs');
END;
