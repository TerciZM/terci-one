const fields = "id,name,company_name,email,phone,address,status,portal_enabled,template_name,created_at";

export async function onRequestGet({ env, request }) {
  const url = new URL(request.url), q = (url.searchParams.get("q") || "").trim(), id = Number(url.searchParams.get("id"));
  if (id) {
    const customer = await env.DB.prepare(`SELECT ${fields} FROM customers WHERE id=?`).bind(id).first();
    return customer ? Response.json(customer) : Response.json({ error: "Customer not found" }, { status: 404 });
  }
  const sql = q ? `SELECT ${fields} FROM customers WHERE name LIKE ? OR company_name LIKE ? OR email LIKE ? OR phone LIKE ? ORDER BY name LIMIT 500` : `SELECT ${fields} FROM customers ORDER BY name LIMIT 500`;
  const result = q ? await env.DB.prepare(sql).bind(...Array(4).fill(`%${q}%`)).all() : await env.DB.prepare(sql).all();
  return Response.json(result.results || []);
}

export async function onRequestPost({ env, request }) {
  try {
    const b = await request.json(), name = String(b.name || "").trim();
    if (!name) return Response.json({ error: "Customer name is required" }, { status: 400 });
    const result = await env.DB.prepare("INSERT INTO customers (name,company_name,email,phone,address,status,portal_enabled,template_name) VALUES (?,?,?,?,?,?,?,?)")
      .bind(name, b.company_name || null, b.email || null, b.phone || null, b.address || null, b.status || "Active", Number(Boolean(b.portal_enabled)), b.template_name || null).run();
    return Response.json({ id: result.meta.last_row_id }, { status: 201 });
  } catch (e) { return Response.json({ error: e.message }, { status: 500 }); }
}

export async function onRequestPut({ env, request }) {
  try {
    const b = await request.json(), id = Number(b.id), name = String(b.name || "").trim();
    if (!id || !name) return Response.json({ error: "Customer ID and name are required" }, { status: 400 });
    await env.DB.prepare("UPDATE customers SET name=?,company_name=?,email=?,phone=?,address=?,status=?,portal_enabled=?,template_name=? WHERE id=?")
      .bind(name, b.company_name || null, b.email || null, b.phone || null, b.address || null, b.status || "Active", Number(Boolean(b.portal_enabled)), b.template_name || null, id).run();
    return Response.json({ ok: true, id });
  } catch (e) { return Response.json({ error: e.message }, { status: 500 }); }
}

export async function onRequestPatch({ env, request }) {
  try {
    const b = await request.json(), ids = [...new Set((b.ids || []).map(Number).filter(Boolean))];
    if (!ids.length) return Response.json({ error: "Select at least one customer" }, { status: 400 });
    let statements = [];
    if (b.action === "status") {
      const status = b.value === "Inactive" ? "Inactive" : "Active";
      statements = ids.map(id => env.DB.prepare("UPDATE customers SET status=? WHERE id=?").bind(status, id));
    } else if (b.action === "template") {
      statements = ids.map(id => env.DB.prepare("UPDATE customers SET template_name=? WHERE id=?").bind(String(b.value || "").trim() || null, id));
    } else if (b.action === "bulk-update") {
      const allowed = new Set(["company_name", "email", "phone", "address", "status"]);
      if (!allowed.has(b.field)) return Response.json({ error: "Unsupported field" }, { status: 400 });
      statements = ids.map(id => env.DB.prepare(`UPDATE customers SET ${b.field}=? WHERE id=?`).bind(b.value || null, id));
    } else if (b.action === "merge") {
      const primary = Number(b.primary_id), duplicates = ids.filter(id => id !== primary);
      if (!primary || !duplicates.length) return Response.json({ error: "Choose a primary customer and at least one duplicate" }, { status: 400 });
      statements = duplicates.flatMap(id => [env.DB.prepare("UPDATE quotations SET customer_id=? WHERE customer_id=?").bind(primary, id), env.DB.prepare("DELETE FROM customers WHERE id=?").bind(id)]);
    } else return Response.json({ error: "Unsupported action" }, { status: 400 });
    if (statements.length) await env.DB.batch(statements);
    return Response.json({ ok: true });
  } catch (e) { return Response.json({ error: e.message }, { status: 500 }); }
}

export async function onRequestDelete({ env, request }) {
  try {
    const url = new URL(request.url), ids = (url.searchParams.get("ids") || url.searchParams.get("id") || "").split(",").map(Number).filter(Boolean);
    if (!ids.length) return Response.json({ error: "Customer ID is required" }, { status: 400 });
    for (const id of ids) {
      const linked = await env.DB.prepare("SELECT COUNT(*) AS count FROM quotations WHERE customer_id=?").bind(id).first();
      if (Number(linked?.count || 0)) return Response.json({ error: "One or more selected customers have quotations and cannot be deleted." }, { status: 409 });
    }
    await env.DB.batch(ids.map(id => env.DB.prepare("DELETE FROM customers WHERE id=?").bind(id)));
    return Response.json({ ok: true });
  } catch (e) { return Response.json({ error: e.message }, { status: 500 }); }
}
