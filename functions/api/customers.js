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

const customerColumnTypes = {
  company_name:"TEXT", status:"TEXT DEFAULT 'Active'", portal_enabled:"INTEGER DEFAULT 0", template_name:"TEXT",
  customer_type:"TEXT DEFAULT 'Business'", salutation:"TEXT", first_name:"TEXT", last_name:"TEXT", display_name:"TEXT", customer_number:"TEXT", mobile:"TEXT", language:"TEXT DEFAULT 'English'",
  tax_rate:"TEXT", currency:"TEXT DEFAULT 'ZMW'", opening_balance:"REAL DEFAULT 0", credit_limit:"REAL DEFAULT 0", payment_terms:"TEXT DEFAULT 'Due on Receipt'",
  billing_attention:"TEXT", billing_country:"TEXT", billing_address1:"TEXT", billing_address2:"TEXT", billing_city:"TEXT", billing_state:"TEXT", billing_zip:"TEXT", billing_phone:"TEXT", billing_fax:"TEXT",
  shipping_attention:"TEXT", shipping_country:"TEXT", shipping_address1:"TEXT", shipping_address2:"TEXT", shipping_city:"TEXT", shipping_state:"TEXT", shipping_zip:"TEXT", shipping_phone:"TEXT", shipping_fax:"TEXT",
  contact_persons:"TEXT", reporting_tags:"TEXT", remarks:"TEXT"
};
async function tableColumns(env,ensure=false) {
  const read=async()=>{const result=await env.DB.prepare("PRAGMA table_info(customers)").all();return new Set((result.results||[]).map(row=>row.name))};
  let available;try{available=await read()}catch(_){available=new Set(legacyFields)}
  if(ensure){
    for(const [field,type] of Object.entries(customerColumnTypes)){
      if(available.has(field))continue;
      try{await env.DB.prepare(`ALTER TABLE customers ADD COLUMN ${field} ${type}`).run();available.add(field)}
      catch(error){
        if(!/duplicate column name/i.test(String(error.message||error)))throw error;
        available=await read();
      }
    }
  }
  return available;
}

function clean(body) {
  const salutation=String(body.salutation||"").trim()||null,firstName=String(body.first_name||"").trim()||null,lastName=String(body.last_name||"").trim()||null;
  const display = String(body.display_name || body.name || "").trim();
  const personal = [salutation,firstName,lastName].filter(Boolean).join(" ").trim();
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
    salutation, first_name:firstName, last_name:lastName, company_name:company||null, display_name:display||name,
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
    const available=await tableColumns(env,true),columns=editableFields.filter(field=>available.has(field)),placeholders=columns.map(()=>"?").join(",");
    const result=await env.DB.prepare(`INSERT INTO customers (${columns.join(",")}) VALUES (${placeholders})`).bind(...columns.map(field=>valuesFor(body)[editableFields.indexOf(field)])).run();
    return Response.json({id:result.meta.last_row_id},{status:201});
  } catch(e){return Response.json({error:e.message},{status:500})}
}

export async function onRequestPut({ env, request }) {
  try {
    const body=clean(await request.json()),id=Number(body.id);
    if(!id||!body.name)return Response.json({error:"Customer ID and display name are required"},{status:400});
    const available=await tableColumns(env,true),columns=editableFields.filter(field=>available.has(field)),assignments=columns.map(field=>`${field}=?`).join(",");
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

