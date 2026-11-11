const json = (data, status = 200) => Response.json(data, { status });
const validId = value => Number.isSafeInteger(value) && value > 0;
const amount = (value, decimals) =>
  typeof value === "number" && Number.isFinite(value) && value >= 0 &&
  value <= 1_000_000 && Number(value.toFixed(decimals)) === value;
const text = (value, max = 160) => String(value ?? "").trim().slice(0, max);
const validKey = value => typeof value === "string" && /^[a-f0-9-]{36}$/i.test(value);
const date = value => /^\d{4}-\d{2}-\d{2}$/.test(value) &&
  new Date(value).toJSON()?.slice(0, 10) === value;
const activeGoods = item => item.item_type !== "Service" && item.status !== "Inactive";

async function all(db, sql, ...args) {
  return (await db.prepare(sql).bind(...args).all()).results;
}

async function order(db, id) {
  const [orders, lines, stock, payments] = await db.batch([
    db.prepare("SELECT * FROM purchase_order_balances WHERE id = ?").bind(id),
    db.prepare("SELECT * FROM purchase_line_balances WHERE order_id = ? ORDER BY id").bind(id),
    db.prepare(`SELECT e.* FROM purchase_stock_entries e
      JOIN purchase_order_lines l ON l.id = e.line_id WHERE l.order_id = ? ORDER BY e.id DESC`).bind(id),
    db.prepare("SELECT * FROM purchase_payments WHERE order_id = ? ORDER BY id DESC").bind(id)
  ]);
  const [record] = orders.results;
  if (!record) return null;
  return { ...record, lines: lines.results, stock: stock.results, payments: payments.results };
}

function errorResponse(error) {
  const message = error.message || "";
  if (message.includes("no such table") || message.includes("no such view")) {
    return json({ error: "The purchasing database migration is required." }, 503);
  }
  const conflict = [
    "Quantity exceeds the amount available for this action",
    "Payment exceeds the balance or the order is not approved"
  ].find(reason => message.includes(reason));
  if (conflict) return json({ error: conflict }, 409);
  if (message.includes("purchase_payments.order_id, purchase_payments.reference")) {
    return json({ error: "That payment reference is already recorded on this order." }, 409);
  }
  if (message.includes("FOREIGN KEY constraint failed")) {
    return json({ error: "A selected vendor or item is no longer available. Reload and try again." }, 409);
  }
  if (error instanceof SyntaxError) return json({ error: "Invalid request data." }, 400);
  console.error("Purchasing request failed", error);
  return json({ error: "Purchasing request failed. Please try again." }, 500);
}

export async function onRequestGet({ env, request }) {
  const db = env.DB;
  const url = new URL(request.url);
  const id = Number(url.searchParams.get("id"));
  try {
    if (id) {
      const record = await order(db, id);
      return record ? json(record) : json({ error: "Purchase order not found." }, 404);
    }
    if (url.searchParams.get("view") === "quotes") {
      return json(await all(db, `SELECT q.*, i.name AS item_name, v.display_name AS vendor_name
        FROM purchase_vendor_quotes q JOIN items i ON i.id = q.item_id JOIN vendors v ON v.id = q.vendor_id
        ORDER BY q.quoted_on DESC, q.id DESC`));
    }
    if (url.searchParams.get("view") === "stock") {
      const items = await all(db, `SELECT i.*, r.quantity AS reorder_level,
        coalesce(b.reserved, 0) AS reserved, coalesce(b.on_order, 0) AS on_order,
        round(i.quantity - coalesce(b.reserved, 0), 3) AS available
        FROM items i LEFT JOIN purchase_item_balances b ON b.item_id = i.id
        LEFT JOIN item_reorder_levels r ON r.item_id = i.id ORDER BY i.name COLLATE NOCASE`);
      return json(items.filter(activeGoods).map(item => ({
        id: item.id, name: item.name, sku: item.sku, unit: item.unit_of_measure || "Each",
        quantity: item.quantity, available: item.available, reserved: item.reserved, on_order: item.on_order,
        reorder_level: item.reorder_level, preferred_supplier: item.preferred_supplier,
        reorder: item.reorder_level !== null && item.available <= item.reorder_level && item.on_order === 0
      })));
    }
    return json(await all(db, `SELECT id, number, vendor_name, purpose, reference, expected_date, created_at,
      status, total_cents, paid_cents FROM purchase_order_balances ORDER BY id DESC`));
  } catch (error) {
    return errorResponse(error);
  }
}

async function create(db, body) {
  const { vendor_id, purpose, request_key, lines } = body;
  const delivery = body.delivery ?? 0;
  const reference = text(body.reference);
  const expectedDate = text(body.expected_date, 10);
  if (!validKey(request_key) || !validId(vendor_id) || !["Stock", "Job"].includes(purpose) ||
      (purpose === "Job" && !reference) || !amount(delivery, 2) ||
      (expectedDate && !date(expectedDate)) ||
      !Array.isArray(lines) || !lines.length || lines.length > 40 ||
      lines.some(line => !line || !validId(line.item_id) || !amount(line.quantity, 3) ||
        line.quantity === 0 || !amount(line.unit_price, 2)) ||
      new Set(lines.map(line => line.item_id)).size !== lines.length) {
    return json({ error: "Select an active vendor, use distinct items with valid quantities and prices, and enter a reference for job purchases." }, 400);
  }
  const existing = await db.prepare("SELECT id FROM purchase_orders WHERE request_key = ?").bind(request_key).first();
  if (existing) return json(existing);
  const vendor = await db.prepare("SELECT status FROM vendors WHERE id = ?").bind(vendor_id).first();
  if (vendor?.status !== "Active") return json({ error: "Select an active vendor." }, 400);
  const ids = lines.map(line => line.item_id);
  const items = await all(db, `SELECT * FROM items WHERE id IN (${ids.map(() => "?").join(",")})`, ...ids);
  if (items.filter(activeGoods).length !== lines.length) return json({ error: "Only active goods can be purchased." }, 400);
  const byId = new Map(items.map(item => [item.id, item]));
  try {
    const [insert] = await db.batch([
      db.prepare(`INSERT INTO purchase_orders
        (request_key, vendor_id, purpose, reference, expected_date, vendor_quote, delivery_cents)
        VALUES (?, ?, ?, ?, ?, ?, ?)`).bind(request_key, vendor_id, purpose, reference || null,
        expectedDate || null, text(body.vendor_quote) || null, Math.round(delivery * 100)),
      ...lines.map(line => {
        const item = byId.get(line.item_id);
        return db.prepare(`INSERT INTO purchase_order_lines
          (order_id, item_id, description, unit, quantity, unit_cents)
          VALUES ((SELECT id FROM purchase_orders WHERE request_key = ?), ?, ?, ?, ?, ?)`)
          .bind(request_key, item.id,
            [item.name, item.purchase_description || item.description].filter(Boolean).join(" — "),
            item.unit_of_measure || "Each", line.quantity, Math.round(line.unit_price * 100));
      })
    ]);
    return json({ id: insert.meta.last_row_id }, 201);
  } catch (error) {
    const duplicate = await db.prepare("SELECT id FROM purchase_orders WHERE request_key = ?").bind(request_key).first();
    if (duplicate) return json(duplicate);
    throw error;
  }
}

async function changeState(db, body) {
  const approve = body.action === "approve";
  const result = await db.prepare(approve
    ? `UPDATE purchase_orders SET state = 'Ordered' WHERE id = ? AND state = 'Draft'
       AND EXISTS (SELECT 1 FROM vendors WHERE id = vendor_id AND status = 'Active')`
    : `UPDATE purchase_orders SET state = 'Cancelled' WHERE id = ? AND state IN ('Draft', 'Ordered')
       AND NOT EXISTS (SELECT 1 FROM purchase_line_balances WHERE order_id = purchase_orders.id AND received > 0)
       AND NOT EXISTS (SELECT 1 FROM purchase_payments WHERE order_id = purchase_orders.id)`
  ).bind(body.id).run();
  if (result.meta.changes) return json({ ok: true });
  return json({ error: approve ? "Only a draft with an active vendor can be approved." :
    "Only an order with no receipts or payments can be cancelled." }, 409);
}

async function recordStock(db, body) {
  if (!validId(body.line_id) || !validKey(body.request_key) || !amount(body.quantity, 3) || body.quantity === 0) {
    return json({ error: "Enter a positive quantity with up to three decimal places." }, 400);
  }
  const result = await db.prepare(`INSERT INTO purchase_stock_entries (request_key, line_id, kind, quantity, reference)
    SELECT ?, id, ?, ?, ? FROM purchase_order_lines WHERE id = ? AND order_id = ?
    ON CONFLICT(request_key) DO NOTHING`).bind(body.request_key, body.action === "receive" ? "Receive" : "Issue",
    body.quantity, text(body.reference) || null, body.line_id, body.id).run();
  if (result.meta.changes) return json({ ok: true });
  const duplicate = await db.prepare(`SELECT e.id FROM purchase_stock_entries e
    JOIN purchase_order_lines l ON l.id = e.line_id
    WHERE e.request_key = ? AND l.id = ? AND l.order_id = ?`).bind(body.request_key, body.line_id, body.id).first();
  return duplicate ? json({ ok: true }) : json({ error: "Purchase order line not found." }, 404);
}

async function recordQuote(db, body) {
  const { vendor_id, item_id, request_key, unit_price, lead_days } = body;
  if (!validId(vendor_id) || !validId(item_id) || !validKey(request_key) ||
      !amount(unit_price, 2) || !date(body.quoted_on) ||
      (lead_days !== null && (!Number.isInteger(lead_days) || lead_days < 0 || lead_days > 365))) {
    return json({ error: "Enter the vendor, item, quote date, price and optional lead time." }, 400);
  }
  await db.prepare(`INSERT INTO purchase_vendor_quotes
    (request_key, vendor_id, item_id, unit_cents, quoted_on, lead_days, terms, reference)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?) ON CONFLICT(request_key) DO NOTHING`).bind(
    request_key, vendor_id, item_id, Math.round(unit_price * 100), body.quoted_on, lead_days,
    text(body.terms, 300) || null, text(body.reference) || null).run();
  return json({ ok: true });
}

export async function onRequestPost({ env, request }) {
  const db = env.DB;
  try {
    const body = await request.json();
    if (!body || typeof body !== "object") return json({ error: "Invalid request data." }, 400);
    if (body.action === "quote") return await recordQuote(db, body);
    if (body.action === "create") return await create(db, body);
    if (body.action === "reorder") {
      if (!validId(body.id) || (body.quantity !== null && !amount(body.quantity, 3))) {
        return json({ error: "Enter a non-negative reorder level or leave it blank." }, 400);
      }
      if (body.quantity === null) await db.prepare("DELETE FROM item_reorder_levels WHERE item_id = ?").bind(body.id).run();
      else await db.prepare(`INSERT INTO item_reorder_levels (item_id, quantity) VALUES (?, ?)
        ON CONFLICT(item_id) DO UPDATE SET quantity = excluded.quantity`).bind(body.id, body.quantity).run();
      return json({ ok: true });
    }
    if (!validId(body.id)) return json({ error: "Purchase order ID is required." }, 400);
    if (["approve", "cancel"].includes(body.action)) return await changeState(db, body);
    if (["receive", "issue"].includes(body.action)) return await recordStock(db, body);
    if (body.action === "payment") {
      const reference = text(body.reference);
      if (!validKey(body.request_key) || !amount(body.amount, 2) || body.amount === 0 || !reference) {
        return json({ error: "Enter the payment amount and a payment reference." }, 400);
      }
      await db.prepare(`INSERT INTO purchase_payments (request_key, order_id, cents, reference)
        VALUES (?, ?, ?, ?) ON CONFLICT(request_key) DO NOTHING`).bind(
        body.request_key, body.id, Math.round(body.amount * 100), reference).run();
      return json({ ok: true });
    }
    return json({ error: "Unknown purchasing action." }, 400);
  } catch (error) {
    return errorResponse(error);
  }
}
