export async function onRequestGet({ env }) {
  if (!env.DB) return Response.json({ error: "Database binding DB is not configured" }, { status: 503 });
  const { results } = await env.DB.prepare("SELECT id,name,email,phone,address FROM customers ORDER BY name LIMIT 100").all();
  return Response.json(results);
}