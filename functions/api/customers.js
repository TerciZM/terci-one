export async function onRequestGet({ env, request }) {
  const q = (new URL(request.url).searchParams.get('q') || '').trim();
  const result = q ? await env.DB.prepare('SELECT id,name,email,phone,address FROM customers WHERE name LIKE ? OR email LIKE ? ORDER BY name LIMIT 20').bind(`%${q}%`,`%${q}%`).all() : await env.DB.prepare('SELECT id,name,email,phone,address FROM customers ORDER BY name LIMIT 100').all();
  return Response.json(result.results || []);
}

export async function onRequestPost({ env, request }) {
  try {
    const b = await request.json();
    const name = String(b.name || "").trim();
    if (!name) return Response.json({ error: "Customer name is required" }, { status: 400 });
    const result = await env.DB.prepare(
      "INSERT INTO customers (name,email,phone,address) VALUES (?,?,?,?)",
    ).bind(name, b.email || null, b.phone || null, b.address || null).run();
    return Response.json({ id: result.meta.last_row_id, name, email: b.email || "", phone: b.phone || "", address: b.address || "" }, { status: 201 });
  } catch (e) { return Response.json({ error: e.message }, { status: 500 }); }
}

export async function onRequestPut({ env, request }) {
  try {
    const b = await request.json();
    const id = Number(b.id);
    const name = String(b.name || "").trim();
    if (!id || !name) return Response.json({ error: "Customer ID and name are required" }, { status: 400 });
    await env.DB.prepare("UPDATE customers SET name=?,email=?,phone=?,address=? WHERE id=?").bind(name, b.email || null, b.phone || null, b.address || null, id).run();
    return Response.json({ id, name, email: b.email || "", phone: b.phone || "", address: b.address || "" });
  } catch (e) { return Response.json({ error: e.message }, { status: 500 }); }
}

export async function onRequestDelete({ env, request }) {
  try {
    const id = Number(new URL(request.url).searchParams.get("id"));
    if (!id) return Response.json({ error: "Customer ID is required" }, { status: 400 });
    const linked = await env.DB.prepare("SELECT COUNT(*) AS count FROM quotations WHERE customer_id=?").bind(id).first();
    if (Number(linked?.count || 0)) return Response.json({ error: "This customer has quotations and cannot be deleted." }, { status: 409 });
    await env.DB.prepare("DELETE FROM customers WHERE id=?").bind(id).run();
    return Response.json({ ok: true });
  } catch (e) { return Response.json({ error: e.message }, { status: 500 }); }
}
