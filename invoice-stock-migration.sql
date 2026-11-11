CREATE TABLE IF NOT EXISTS invoice_stock_movements (
  id INTEGER PRIMARY KEY,
  request_key TEXT NOT NULL UNIQUE,
  invoice_id INTEGER NOT NULL REFERENCES invoices(id),
  item_id INTEGER NOT NULL REFERENCES items(id),
  kind TEXT NOT NULL CHECK (kind IN ('Issue', 'Return')),
  quantity REAL NOT NULL CHECK (quantity > 0),
  purchase_line_id INTEGER REFERENCES purchase_order_lines(id),
  prior_issue_id INTEGER REFERENCES purchase_stock_entries(id),
  reference TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CHECK (purchase_line_id IS NULL OR prior_issue_id IS NULL),
  CHECK (kind = 'Issue' OR (purchase_line_id IS NULL AND prior_issue_id IS NULL))
);
CREATE INDEX IF NOT EXISTS invoice_stock_by_invoice ON invoice_stock_movements(invoice_id, item_id);
CREATE INDEX IF NOT EXISTS invoice_stock_by_item ON invoice_stock_movements(item_id);
CREATE INDEX IF NOT EXISTS invoice_stock_by_prior_issue ON invoice_stock_movements(prior_issue_id);

CREATE VIEW IF NOT EXISTS invoice_stock_totals AS
SELECT invoice_id, item_id,
  round(sum(CASE WHEN kind = 'Issue' THEN quantity ELSE 0 END), 3) AS issued,
  round(sum(CASE WHEN kind = 'Return' THEN quantity ELSE 0 END), 3) AS returned,
  round(sum(CASE WHEN kind = 'Issue' THEN quantity ELSE -quantity END), 3) AS outstanding
FROM invoice_stock_movements GROUP BY invoice_id, item_id;

CREATE VIEW IF NOT EXISTS invoice_stock_lines AS
SELECT l.invoice_id, l.item_id, i.name, coalesce(nullif(i.unit_of_measure, ''), 'Each') AS unit,
  round(sum(l.quantity), 3) AS invoiced,
  max(CASE WHEN lower(trim(l.unit_of_measure)) <> lower(trim(coalesce(nullif(i.unit_of_measure, ''), 'Each'))) THEN 1 ELSE 0 END) AS unit_mismatch,
  max(0, round(i.quantity - coalesce(p.reserved, 0), 3)) AS available,
  coalesce(t.issued, 0) AS issued, coalesce(t.returned, 0) AS returned, coalesce(t.outstanding, 0) AS outstanding,
  max(0, round(sum(l.quantity) - coalesce(t.outstanding, 0), 3)) AS pending
FROM invoice_lines l JOIN items i ON i.id = l.item_id
LEFT JOIN purchase_item_balances p ON p.item_id = l.item_id
LEFT JOIN invoice_stock_totals t ON t.invoice_id = l.invoice_id AND t.item_id = l.item_id
WHERE coalesce(i.item_type, 'Goods') <> 'Service'
GROUP BY l.invoice_id, l.item_id;

CREATE VIEW IF NOT EXISTS invoice_job_stock AS
SELECT inv.id AS invoice_id, l.id AS purchase_line_id, l.item_id,
  printf('PO-%04d', p.id) AS number, p.reference,
  round(l.received - l.issued, 3) AS reserved
FROM invoices inv
JOIN purchase_orders p ON p.purpose = 'Job' AND p.state = 'Ordered'
  AND lower(trim(p.reference)) IN (lower(trim(inv.invoice_number)), lower(trim(inv.order_number)))
JOIN purchase_line_balances l ON l.order_id = p.id
JOIN invoice_stock_lines s ON s.invoice_id = inv.id AND s.item_id = l.item_id
WHERE lower(trim(l.unit)) = lower(trim(s.unit));

CREATE VIEW IF NOT EXISTS invoice_prior_job_issues AS
SELECT j.invoice_id, j.item_id, j.number, j.reference, e.id AS prior_issue_id, e.created_at,
  round(e.quantity - coalesce((SELECT sum(m.quantity) FROM invoice_stock_movements m WHERE m.prior_issue_id = e.id), 0), 3) AS available
FROM invoice_job_stock j JOIN purchase_stock_entries e ON e.line_id = j.purchase_line_id
WHERE e.kind = 'Issue' AND e.request_key NOT LIKE 'invoice-stock:%';

CREATE TRIGGER IF NOT EXISTS validate_invoice_stock_movement
BEFORE INSERT ON invoice_stock_movements
WHEN NOT EXISTS (SELECT 1 FROM invoice_stock_movements WHERE request_key = NEW.request_key)
BEGIN
  SELECT CASE WHEN NEW.kind = 'Issue' AND NOT EXISTS (
    SELECT 1 FROM invoice_stock_lines s JOIN invoices inv ON inv.id = s.invoice_id
    WHERE s.invoice_id = NEW.invoice_id AND s.item_id = NEW.item_id AND s.unit_mismatch = 0
      AND coalesce(inv.status, 'Draft') NOT IN ('Draft', 'Void', 'Cancelled', 'Pending Approval')
      AND NEW.quantity <= s.pending
  ) THEN RAISE(ABORT, 'Check the invoice status, item unit and quantity still to issue') END;

  SELECT CASE WHEN NEW.kind = 'Issue' AND NEW.purchase_line_id IS NULL AND NEW.prior_issue_id IS NULL
    AND (NEW.quantity > coalesce((SELECT available FROM invoice_stock_lines WHERE invoice_id = NEW.invoice_id AND item_id = NEW.item_id), 0)
      OR EXISTS (SELECT 1 FROM invoice_prior_job_issues WHERE invoice_id = NEW.invoice_id AND item_id = NEW.item_id AND available > 0))
    THEN RAISE(ABORT, 'Check available stock and link any prior job issue first') END;

  SELECT CASE WHEN NEW.purchase_line_id IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM invoice_job_stock WHERE invoice_id = NEW.invoice_id AND item_id = NEW.item_id
      AND purchase_line_id = NEW.purchase_line_id AND reserved >= NEW.quantity
  ) THEN RAISE(ABORT, 'The selected job does not have enough reserved stock for this invoice') END;

  SELECT CASE WHEN NEW.prior_issue_id IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM invoice_prior_job_issues WHERE invoice_id = NEW.invoice_id AND item_id = NEW.item_id
      AND prior_issue_id = NEW.prior_issue_id AND available >= NEW.quantity
  ) THEN RAISE(ABORT, 'The prior job issue cannot cover this invoice quantity') END;

  SELECT CASE WHEN NEW.kind = 'Return' AND NEW.quantity > coalesce((
    SELECT outstanding FROM invoice_stock_totals WHERE invoice_id = NEW.invoice_id AND item_id = NEW.item_id
  ), 0) THEN RAISE(ABORT, 'Return quantity exceeds goods issued for this invoice') END;
END;

CREATE TRIGGER IF NOT EXISTS apply_invoice_stock_movement
AFTER INSERT ON invoice_stock_movements
BEGIN
  INSERT INTO purchase_stock_entries (request_key, line_id, kind, quantity, reference)
  SELECT 'invoice-stock:' || NEW.request_key, NEW.purchase_line_id, 'Issue', NEW.quantity,
    (SELECT invoice_number FROM invoices WHERE id = NEW.invoice_id)
  WHERE NEW.purchase_line_id IS NOT NULL;

  UPDATE items
  SET quantity = round(quantity + CASE WHEN NEW.kind = 'Return' THEN NEW.quantity ELSE -NEW.quantity END, 3)
  WHERE id = NEW.item_id AND NEW.purchase_line_id IS NULL AND NEW.prior_issue_id IS NULL;
END;

CREATE TRIGGER IF NOT EXISTS protect_issued_invoice_lines
BEFORE DELETE ON invoice_lines
WHEN EXISTS (SELECT 1 FROM invoice_stock_movements WHERE invoice_id = OLD.invoice_id)
BEGIN
  SELECT RAISE(ABORT, 'Invoice has stock history and its lines are locked');
END;

CREATE TRIGGER IF NOT EXISTS protect_invoice_stock_status
BEFORE UPDATE OF status ON invoices
WHEN NEW.status IN ('Draft', 'Void', 'Cancelled', 'Pending Approval') AND NEW.status <> OLD.status
  AND EXISTS (SELECT 1 FROM invoice_stock_totals WHERE invoice_id = OLD.id AND outstanding > 0)
BEGIN
  SELECT RAISE(ABORT, 'Receive outstanding goods back before reversing this invoice');
END;

CREATE TRIGGER IF NOT EXISTS protect_item_stock_unit
BEFORE UPDATE OF item_type, unit_of_measure ON items
WHEN (coalesce(NEW.item_type, 'Goods') <> coalesce(OLD.item_type, 'Goods')
  OR lower(trim(coalesce(nullif(NEW.unit_of_measure, ''), 'Each'))) <> lower(trim(coalesce(nullif(OLD.unit_of_measure, ''), 'Each'))))
  AND EXISTS (SELECT 1 FROM invoice_stock_movements WHERE item_id = OLD.id)
BEGIN
  SELECT RAISE(ABORT, 'This item has invoice stock history and its type and unit are locked');
END;
