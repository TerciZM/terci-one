export async function onRequestGet({ env, request }) {
  const q = (new URL(request.url).searchParams.get('q') || '').trim();
  const result = q ? await env.DB.prepare('SELECT id,name,email,phone,address FROM customers WHERE name LIKE ? OR email LIKE ? ORDER BY name LIMIT 20').bind(`%${q}%`,`%${q}%`).all() : await env.DB.prepare('SELECT id,name,email,phone,address FROM customers ORDER BY name LIMIT 100').all();
  return Response.json(result.results || []);
}
