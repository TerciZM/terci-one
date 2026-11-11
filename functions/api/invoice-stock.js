const json = (data, status = 200) => Response.json(data, { status });
const validId = value => Number.isSafeInteger(value) && value > 0;
const errors = [
  "Check the invoice status, item unit and quantity still to issue",
  "Check available stock and link any prior job issue first",
  "The selected job does not have enough reserved stock for this invoice",
  "The prior job issue cannot cover this invoice quantity",
  "Return quantity exceeds goods issued for this invoice",
  "Quantity exceeds the amount available for this action",
  "Stock cannot be set below the quantity reserved for jobs"
];

function handleError(error) {
  const message = String(error.message);
  const conflict = errors.find(reason => message.includes(reason));
  if (conflict) return json({ error: conflict }, 409);
  if (/no such (?:table|view|column)/.test(message)) {
    return json({ error: "Invoice stock tracking requires the database migration." }, 503);
  }
  if (error instanceof SyntaxError) return json({ error: "Invalid request data." }, 400);
  if (message.includes("FOREIGN KEY constraint failed")) {
    return json({ error: "The invoice or item is no longer available." }, 409);
  }
  console.error("Invoice stock request failed", error);
  return json({ error: "Could not process the invoice stock request." }, 500);
}

export async function onRequestGet({ env, request }) {
  const params = new URL(request.url).searchParams;
  const itemId = Number(params.get("item"));
  const invoiceId = Number(params.get("id"));
  try {
    if (validId(itemId)) {
      const history = await env.DB.prepare(`SELECT m.*, i.invoice_number FROM invoice_stock_movements m
        JOIN invoices i ON i.id = m.invoice_id WHERE m.item_id = ? ORDER BY m.id DESC LIMIT 100`).bind(itemId).all();
      return json(history.results);
    }
    if (!validId(invoiceId)) return json({ error: "Invoice ID is required." }, 400);
    const [invoices, lines, jobs, prior, movements] = await env.DB.batch([
      env.DB.prepare("SELECT id, invoice_number, order_number, status FROM invoices WHERE id = ?").bind(invoiceId),
      env.DB.prepare("SELECT * FROM invoice_stock_lines WHERE invoice_id = ? ORDER BY name").bind(invoiceId),
      env.DB.prepare("SELECT * FROM invoice_job_stock WHERE invoice_id = ? AND reserved > 0 ORDER BY number").bind(invoiceId),
      env.DB.prepare("SELECT * FROM invoice_prior_job_issues WHERE invoice_id = ? AND available > 0 ORDER BY prior_issue_id").bind(invoiceId),
      env.DB.prepare(`SELECT m.*, i.name FROM invoice_stock_movements m JOIN items i ON i.id = m.item_id
        WHERE m.invoice_id = ? ORDER BY m.id DESC`).bind(invoiceId)
    ]);
    if (!invoices.results.length) return json({ error: "Invoice not found." }, 404);
    return json({ invoice: invoices.results[0], lines: lines.results, jobs: jobs.results,
      prior: prior.results, movements: movements.results });
  } catch (error) {
    return handleError(error);
  }
}

export async function onRequestPost({ env, request }) {
  try {
    const body = await request.json();
    if (!body || typeof body !== "object") return json({ error: "Invalid request data." }, 400);
    const { request_key, invoice_id, item_id, kind, quantity, purchase_line_id = null, prior_issue_id = null } = body;
    if (typeof request_key !== "string" || !/^[a-f0-9-]{36}$/i.test(request_key) ||
        !validId(invoice_id) || !validId(item_id) || !["Issue", "Return"].includes(kind) ||
        typeof quantity !== "number" || !(quantity > 0 && quantity <= 1_000_000) || Number(quantity.toFixed(3)) !== quantity ||
        (purchase_line_id !== null && !validId(purchase_line_id)) || (prior_issue_id !== null && !validId(prior_issue_id)) ||
        (purchase_line_id !== null && prior_issue_id !== null) ||
        (kind === "Return" && (purchase_line_id !== null || prior_issue_id !== null))) {
      return json({ error: "Select a valid item, stock source and quantity." }, 400);
    }
    const reference = String(body.reference ?? "").trim().slice(0, 160) || null;
    await env.DB.prepare(`INSERT INTO invoice_stock_movements
      (request_key, invoice_id, item_id, kind, quantity, purchase_line_id, prior_issue_id, reference)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?) ON CONFLICT(request_key) DO NOTHING`)
      .bind(request_key, invoice_id, item_id, kind, quantity, purchase_line_id, prior_issue_id, reference).run();
    const saved = await env.DB.prepare(`SELECT id FROM invoice_stock_movements WHERE request_key = ? AND invoice_id = ?
      AND item_id = ? AND kind = ? AND quantity = ? AND purchase_line_id IS ? AND prior_issue_id IS ? AND reference IS ?`)
      .bind(request_key, invoice_id, item_id, kind, quantity, purchase_line_id, prior_issue_id, reference).first();
    return saved ? json({ ok: true, id: saved.id }) : json({ error: "That request has already recorded a different movement. Reload the invoice." }, 409);
  } catch (error) {
    return handleError(error);
  }
}
