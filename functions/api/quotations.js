function canonicalQuoteNumber(prefix, value) {
  const number = String(value || "").trim();
  if (!number.startsWith(prefix)) return null;
  const suffix = number.slice(prefix.length);
  // Only count a clean three-digit sequence. Older malformed quote numbers
  // must not inflate the next sequence after the repair migration is run.
  if (!/^\d{3}$/.test(suffix)) return null;
  return Number(suffix) > 0 ? `${prefix}${suffix}` : null;
}

async function nextQuoteNumber(db, prefix) {
  const existing = await db
    .prepare("SELECT quote_number FROM quotations WHERE quote_number LIKE ?")
    .bind(`${prefix}%`)
    .all();
  const highest = (existing.results || []).reduce((max, row) => {
    const canonical = canonicalQuoteNumber(prefix, row.quote_number);
    return canonical
      ? Math.max(max, Number(canonical.slice(-3)))
      : max;
  }, 0);
  return `${prefix}${String(highest + 1).padStart(3, "0")}`;
}

export async function onRequestGet({ env, request }) {
  const id = new URL(request.url).searchParams.get("id");
  if (id) {
    const quote = await env.DB.prepare(
      "SELECT q.*, c.name AS customer_name, c.address AS customer_address FROM quotations q LEFT JOIN customers c ON c.id=q.customer_id WHERE q.id = ?",
    )
      .bind(id)
      .first();
    if (!quote)
      return Response.json({ error: "Quotation not found" }, { status: 404 });
    const lines = await env.DB.prepare(
      "SELECT l.*, i.name, i.description AS item_description FROM quotation_lines l LEFT JOIN items i ON i.id=l.item_id WHERE l.quotation_id = ? ORDER BY l.id",
    )
      .bind(id)
      .all();
    const costs = await env.DB.prepare(
      "SELECT description, amount FROM quotation_additional_costs WHERE quotation_id = ? ORDER BY id",
    )
      .bind(id)
      .all();
    return Response.json({
      ...quote,
      lines: lines.results || [],
      additional_cost_lines: costs.results || [],
    });
  }
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
    const date = String(b.quote_date).replace(/-/g, "");
    const dateCode = date.slice(2, 8);
    const prefix = `QT-${dateCode}`;
    // New quote numbers are server-generated from the date and database sequence.
    // Ignore the browser's default number so stale or malformed values cannot
    // accumulate repeated date prefixes.
    let quoteNumber = b.id
      ? canonicalQuoteNumber(prefix, b.quote_number)
      : await nextQuoteNumber(env.DB, prefix);
    if (b.id) {
      const duplicate = quoteNumber
        ? await env.DB.prepare(
            "SELECT id FROM quotations WHERE quote_number = ? AND id != ? LIMIT 1",
          )
            .bind(quoteNumber, Number(b.id))
            .first()
        : null;
      if (!quoteNumber || duplicate)
        quoteNumber = await nextQuoteNumber(env.DB, prefix);
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
    if (b.id) {
      const existingQuote = await env.DB.prepare(
        "SELECT id FROM quotations WHERE id = ?",
      )
        .bind(b.id)
        .first();
      if (!existingQuote)
        return Response.json({ error: "Quotation not found" }, { status: 404 });
      await env.DB.prepare(
        "UPDATE quotations SET quote_number=?, customer_id=?, subject=?, quote_date=?, validity_days=?, subtotal=?, additional_costs=?, profit=?, total=? WHERE id=?",
      )
        .bind(
          quoteNumber,
          b.customer_id || null,
          b.subject || null,
          b.quote_date,
          Number(b.validity_days || 30),
          subtotal,
          additional,
          profit,
          total,
          b.id,
        )
        .run();
      await env.DB.prepare("DELETE FROM quotation_lines WHERE quotation_id=?")
        .bind(b.id)
        .run();
      await env.DB.prepare(
        "DELETE FROM quotation_additional_costs WHERE quotation_id=?",
      )
        .bind(b.id)
        .run();
      for (const l of lines)
        await env.DB.prepare(
          "INSERT INTO quotation_lines (quotation_id,item_id,description,quantity,unit_of_measure,selling_price,internal_cost,profit) VALUES (?,?,?,?,?,?,?,?)",
        )
          .bind(
            b.id,
            l.item_id || null,
            l.description || "Item",
            Number(l.quantity || 1),
            l.unit_of_measure || "Each",
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
          .bind(b.id, c.description || "Additional cost", Number(c.amount || 0))
          .run();
      return Response.json(
        { id: b.id, total, quote_number: quoteNumber },
        { status: 200 },
      );
    }
    const r = await env.DB.prepare(
      "INSERT INTO quotations (quote_number,customer_id,subject,quote_date,validity_days,status,subtotal,additional_costs,profit,total) VALUES (?,?,?,?,?,'Draft',?,?,?,?)",
    )
      .bind(
        quoteNumber,
        b.customer_id || null,
        b.subject || null,
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
        "INSERT INTO quotation_lines (quotation_id,item_id,description,quantity,unit_of_measure,selling_price,internal_cost,profit) VALUES (?,?,?,?,?,?,?,?)",
      )
        .bind(
          id,
          l.item_id || null,
          l.description || "Item",
          Number(l.quantity || 1),
          l.unit_of_measure || "Each",
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
