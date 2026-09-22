const editableFields = [
  "name","company_name","email","phone","address","status","portal_enabled","template_name",
  "customer_type","salutation","first_name","last_name","display_name","customer_number","mobile","language",
  "tax_rate","currency","opening_balance","credit_limit","payment_terms",
  "billing_attention","billing_country","billing_address1","billing_address2","billing_city","billing_state","billing_zip","billing_phone","billing_fax",
  "shipping_attention","shipping_country","shipping_address1","shipping_address2","shipping_city","shipping_state","shipping_zip","shipping_phone","shipping_fax",
  "contact_persons","reporting_tags","remarks"
];
const fields = ["id",...editableFields,"created_at"].join(",");
const legacyFields = ["id","name","company_name","email","phone","address","status","portal_enabled","template_name","created_at"];

async function tableColumns(env) {
  try {
    const result = await env.DB.prepare("PRAGMA table_info(customers)").all();
    return new Set((result.results || []).map(row => row.name));
  } catch (_) {
    return new Set(legacyFields);
  }
}

function clean(body) {
  const display = String(body.display_name || body.name || "").trim();
  const personal = [body.salutation,body.first_name,body.last_name].filter(Boolean).join(" ").trim();
  const company = String(body.company_name || "").trim();
  const name = display || company || personal;
  const billing = [body.billing_address1,body.billing_address2,body.billing_city,body.billing_state,body.billing_country].filter(Boolean).join(", ");
  return {
    ...body,
    name,
    display_name: display || name,
    address: String(body.address || billing || "").trim() || null,
    status: body.status === "Inactive" ? "Inactive" : "Active",
    portal_enabled: Number(Boolean(Number(body.portal_enabled))),
    customer_type: body.customer_type === "Individual" ? "Individual" : "Business",
    language: body.language || "English",
    currency: body.currency || "ZMW",
    payment_terms: body.payment_terms || "Due on Receipt",
    opening_balance: Number(body.opening_balance || 0),
    credit_limit: Number(body.credit_limit || 0)
  };
}

function valuesFor(body) {
  return editableFields.map(field => {
    const current = body[field];
    if (["portal_enabled","opening_balance","credit_limit"].includes(field)) return Number(current || 0);
    return current === undefined || current === null || current === "" ? null : current;
  });
}

export async function onRequestGet({ env, request }) {
  try {
    const url=new URL(request.url),q=(url.searchParams.get("q")||"").trim(),id=Number(url.searchParams.get("id"));
    const available = await tableColumns(env), selected = [...new Set([...legacyFields,...editableFields])].filter(field => available.has(field));
    const select = selected.join(","), searchable = ["name","company_name","email","phone","address","display_name","mobile","customer_number"].filter(field => available.has(field));
    if(id){const customer=await env.DB.prepare(`SELECT ${select} FROM customers WHERE id=?`).bind(id).first();return customer?Response.json(customer):Response.json({error:"Customer not found"},{status:404})}
    const sql=q?`SELECT ${select} FROM customers WHERE ${searchable.map(field=>`${field} LIKE ?`).join(" OR ")} ORDER BY name LIMIT 1000`:`SELECT ${select} FROM customers ORDER BY name LIMIT 1000`;
    const result=q?await env.DB.prepare(sql).bind(...Array(searchable.length).fill(`%${q}%`)).all():await env.DB.prepare(sql).all();
    return Response.json(result.results||[]);
  } catch(e){return Response.json({error:e.message},{status:500})}
}

export async function onRequestPost({ env, request }) {
  try {
    const body=clean(await request.json());
    if(!body.name)return Response.json({error:"Display name, company name, or contact name is required"},{status:400});
    const available=await tableColumns(env),columns=editableFields.filter(field=>available.has(field)),placeholders=columns.map(()=>"?").join(",");
    const result=await env.DB.prepare(`INSERT INTO customers (${columns.join(",")}) VALUES (${placeholders})`).bind(...columns.map(field=>valuesFor(body)[editableFields.indexOf(field)])).run();
    return Response.json({id:result.meta.last_row_id},{status:201});
  } catch(e){return Response.json({error:e.message},{status:500})}
}

export async function onRequestPut({ env, request }) {
  try {
    const body=clean(await request.json()),id=Number(body.id);
    if(!id||!body.name)return Response.json({error:"Customer ID and display name are required"},{status:400});
    const available=await tableColumns(env),columns=editableFields.filter(field=>available.has(field)),assignments=columns.map(field=>`${field}=?`).join(",");
    await env.DB.prepare(`UPDATE customers SET ${assignments} WHERE id=?`).bind(...columns.map(field=>valuesFor(body)[editableFields.indexOf(field)]),id).run();
    return Response.json({ok:true,id});
  } catch(e){return Response.json({error:e.message},{status:500})}
}

export async function onRequestPatch({ env, request }) {
  try {
    const b=await request.json(),ids=[...new Set((b.ids||[]).map(Number).filter(Boolean))];
    if(!ids.length)return Response.json({error:"Select at least one customer"},{status:400});
    let statements=[];
    if(b.action==="status"){
      const status=b.value==="Inactive"?"Inactive":"Active";statements=ids.map(id=>env.DB.prepare("UPDATE customers SET status=? WHERE id=?").bind(status,id));
    }else if(b.action==="template"){
      statements=ids.map(id=>env.DB.prepare("UPDATE customers SET template_name=? WHERE id=?").bind(String(b.value||"").trim()||null,id));
    }else if(b.action==="bulk-update"){
      const allowed=new Set(["company_name","email","phone","mobile","address","status"]);if(!allowed.has(b.field))return Response.json({error:"Unsupported field"},{status:400});statements=ids.map(id=>env.DB.prepare(`UPDATE customers SET ${b.field}=? WHERE id=?`).bind(b.value||null,id));
    }else if(b.action==="merge"){
      const primary=Number(b.primary_id),duplicates=ids.filter(id=>id!==primary);if(!primary||!duplicates.length)return Response.json({error:"Choose a primary customer and at least one duplicate"},{status:400});statements=duplicates.flatMap(id=>[env.DB.prepare("UPDATE quotations SET customer_id=? WHERE customer_id=?").bind(primary,id),env.DB.prepare("DELETE FROM customers WHERE id=?").bind(id)]);
    }else return Response.json({error:"Unsupported action"},{status:400});
    if(statements.length)await env.DB.batch(statements);return Response.json({ok:true});
  } catch(e){return Response.json({error:e.message},{status:500})}
}

export async function onRequestDelete({ env, request }) {
  try {
    const url=new URL(request.url),ids=(url.searchParams.get("ids")||url.searchParams.get("id")||"").split(",").map(Number).filter(Boolean);
    if(!ids.length)return Response.json({error:"Customer ID is required"},{status:400});
    for(const id of ids){const linked=await env.DB.prepare("SELECT COUNT(*) AS count FROM quotations WHERE customer_id=?").bind(id).first();if(Number(linked?.count||0))return Response.json({error:"One or more selected customers have quotations and cannot be deleted."},{status:409})}
    await env.DB.batch(ids.map(id=>env.DB.prepare("DELETE FROM customers WHERE id=?").bind(id)));return Response.json({ok:true});
  } catch(e){return Response.json({error:e.message},{status:500})}
}
