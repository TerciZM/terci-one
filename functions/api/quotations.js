export async function onRequestGet({ env }) {
  const result = await env.DB.prepare(
    "SELECT q.id,q.quote_number,q.quote_date,q.validity_days,q.status,q.total,c.name AS customer_name FROM quotations q LEFT JOIN customers c ON c.id=q.customer_id ORDER BY q.created_at DESC LIMIT 10",
  ).all();
  return Response.json(result.results || []);
}
export async function onRequestPost({ env, request }) {
  try {
    const b = await request.json();
    const lines = Array.isArray(b.lines) ? b.lines : [];
    const costs = Array.isArray(b.additional_costs) ? b.additional_costs : [];
    if (!b.quote_date)
      return Response.json(
        { error: "Quote date is required" },
        { status: 400 },
      );
    let quoteNumber = String(b.quote_number || "").trim();
    const duplicate = quoteNumber
      ? await env.DB.prepare(
          "SELECT id FROM quotations WHERE quote_number = ? LIMIT 1",
        )
          .bind(quoteNumber)
          .first()
      : null;
    if (!quoteNumber || duplicate) {
      const year = String(b.quote_date).slice(0, 4);
      const prefix = `QT-${year}-`;
      const latest = await env.DB.prepare(
        "SELECT quote_number FROM quotations WHERE quote_number LIKE ? ORDER BY id DESC LIMIT 1",
      )
        .bind(`${prefix}%`)
        .first();
      const next = latest?.quote_number?.match(/(\\d+)$/)?.[1]
        ? Number(latest.quote_number.match(/(\\d+)$/)[1]) + 1
        : 1;
      quoteNumber = `${prefix}${String(next).padStart(4, "0")}`;
    }
    const subtotal = lines.reduce(
      (s, l) => s + Number(l.quantity || 1) * Number(l.selling_price || 0),
      0,
    );
    const additional = costs.reduce((s, c) => s + Number(c.amount || 0), 0);
    const profit = lines.reduce(
      (s, l) =>
        s +
        Number(l.quantity || 1) *
          (Number(l.selling_price || 0) - Number(l.internal_cost || 0)),
      0,
    );
    const total = subtotal + additional;
    const r = await env.DB.prepare(
      "INSERT INTO quotations (quote_number,customer_id,quote_date,validity_days,status,subtotal,additional_costs,profit,total) VALUES (?,?,?,?, 'Draft',?,?,?,?)",
    )
      .bind(
        quoteNumber,
        b.customer_id || null,
        b.quote_date,
        Number(b.validity_days || 30),
        subtotal,
        additional,
        profit,
        total,
      )
      .run();
    const id = r.meta.last_row_id;
    for (const l of lines)
      await env.DB.prepare(
        "INSERT INTO quotation_lines (quotation_id,item_id,description,quantity,selling_price,internal_cost,profit) VALUES (?,?,?,?,?,?,?)",
      )
        .bind(
          id,
          l.item_id || null,
          l.description || "Item",
          Number(l.quantity || 1),
          Number(l.selling_price || 0),
          Number(l.internal_cost || 0),
          Number(l.quantity || 1) *
            (Number(l.selling_price || 0) - Number(l.internal_cost || 0)),
        )
        .run();
    for (const c of costs)
      await env.DB.prepare(
        "INSERT INTO quotation_additional_costs (quotation_id,description,amount) VALUES (?,?,?)",
      )
        .bind(id, c.description || "Additional cost", Number(c.amount || 0))
        .run();
    return Response.json(
      { id, total, quote_number: quoteNumber },
      { status: 201 },
    );
  } catch (e) {
    return Response.json({ error: e.message }, { status: 500 });
  }
}
