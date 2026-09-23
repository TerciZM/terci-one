const json = (data, status = 200) => Response.json(data, { status });

function datePrefix(value) {
  const d = new Date(`${value}T12:00:00`);
  if (Number.isNaN(d.getTime())) throw new Error("A valid receipt date is required");
  return `SR-${String(d.getFullYear()).slice(-2)}${String(d.getMonth() + 1).padStart(2, "0")}${String(d.getDate()).padStart(2, "0")}`;
}

async function nextReceiptNumber(db, receiptDate) {
  const prefix = datePrefix(receiptDate);
  const row = await db.prepare("SELECT receipt_number FROM sales_receipts WHERE receipt_number LIKE ? ORDER BY receipt_number DESC LIMIT 1").bind(`${prefix}%`).first();
  const current = Number(String(row?.receipt_number || "").slice(prefix.length)) || 0;
  return `${prefix}${String(current + 1).padStart(3, "0")}`;
}

export async function onRequestGet({ env, request }) {
  try {
    const url = new URL(request.url), id = Number(url.searchParams.get("id"));
    const requestedDate = url.searchParams.get("date");
    if (requestedDate) return json({ receipt_number: await nextReceiptNumber(env.DB, requestedDate) });
    if (id) {
      const receipt = await env.DB.prepare("SELECT r.*,c.name AS customer_name,c.email AS customer_email,c.address AS customer_address,i.invoice_number FROM sales_receipts r JOIN customers c ON c.id=r.customer_id LEFT JOIN invoices i ON i.id=r.invoice_id WHERE r.id=?").bind(id).first();
      return receipt ? json(receipt) : json({ error: "Sales receipt not found" }, 404);
    }
    const rows = await env.DB.prepare("SELECT r.id,r.receipt_number,r.customer_id,r.invoice_id,r.receipt_date,r.payment_method,r.payment_reference,r.amount,r.status,c.name AS customer_name,i.invoice_number FROM sales_receipts r JOIN customers c ON c.id=r.customer_id LEFT JOIN invoices i ON i.id=r.invoice_id ORDER BY r.receipt_date DESC,r.id DESC LIMIT 1000").all();
    return json(rows.results || []);
  } catch (error) { return json({ error: error.message }, 500); }
}

export async function onRequestPost({ env, request }) {
  try {
    const body = await request.json();
    const customerId = Number(body.customer_id), invoiceId = Number(body.invoice_id) || null;
    const receiptDate = String(body.receipt_date || "");
    const amount = Number(body.amount);
    const method = String(body.payment_method || "Bank Transfer");
    if (!customerId) return json({ error: "Select a customer" }, 400);
    if (!receiptDate || Number.isNaN(new Date(`${receiptDate}T12:00:00`).getTime())) return json({ error: "Enter a valid receipt date" }, 400);
    if (!Number.isFinite(amount) || amount <= 0) return json({ error: "Receipt amount must be greater than zero" }, 400);
    if (!["Cash", "Bank Transfer", "Mobile Money", "Card", "Cheque", "Other"].includes(method)) return json({ error: "Choose a valid payment method" }, 400);
    let invoice = null, invoicePaidAfter = 0, invoiceBalanceAfter = 0, invoiceStatusAfter = "";
    if (invoiceId) {
      invoice = await env.DB.prepare("SELECT id,customer_id,total,amount_paid,balance_due,status FROM invoices WHERE id=?").bind(invoiceId).first();
      if (!invoice) return json({ error: "Selected invoice was not found" }, 404);
      if (Number(invoice.customer_id) !== customerId) return json({ error: "The selected invoice belongs to a different customer" }, 400);
      const balance = Math.max(0, Number(invoice.balance_due ?? (Number(invoice.total || 0) - Number(invoice.amount_paid || 0))));
      if (amount > balance + 0.005) return json({ error: `Amount is greater than the invoice balance of K${balance.toFixed(2)}` }, 400);
      invoicePaidAfter = Number(invoice.amount_paid || 0) + amount;
      invoiceBalanceAfter = Math.max(0, Number(invoice.total || 0) - invoicePaidAfter);
      invoiceStatusAfter = invoiceBalanceAfter <= 0.005 ? "Paid" : "Partial";
    }
    const receiptNumber = await nextReceiptNumber(env.DB, receiptDate);
    const statements = [env.DB.prepare("INSERT INTO sales_receipts (receipt_number,customer_id,invoice_id,receipt_date,payment_method,payment_reference,amount,notes,status) VALUES (?,?,?,?,?,?,?,?, 'Issued')").bind(receiptNumber, customerId, invoiceId, receiptDate, method, String(body.payment_reference || "").trim() || null, amount, String(body.notes || "").trim() || null)];
    if (invoiceId) statements.push(env.DB.prepare("UPDATE invoices SET amount_paid=?,balance_due=?,status=?,payment_type=?,payment_date=?,payment_reference=?,updated_at=CURRENT_TIMESTAMP WHERE id=?").bind(invoicePaidAfter, invoiceBalanceAfter, invoiceStatusAfter, invoiceStatusAfter === "Paid" ? "Full" : "Partial", receiptDate, String(body.payment_reference || "").trim() || null, invoiceId));
    await env.DB.batch(statements);
    const receipt = await env.DB.prepare("SELECT id,receipt_number FROM sales_receipts WHERE receipt_number=?").bind(receiptNumber).first();
    return json({ ok: true, ...receipt, invoice_status: invoiceStatusAfter || null }, 201);
  } catch (error) { return json({ error: error.message }, 500); }
}
