const baseFields=["id","name","description","selling_price","internal_cost","quantity","created_at"];
const optionalFields=["item_type","unit_of_measure","sku","purchase_description","sales_account","purchase_account","tax_rate","status","preferred_supplier","image_url"];
const editableFields=["name","description","selling_price","internal_cost","quantity",...optionalFields];
const json=(data,status=200)=>Response.json(data,{status});

async function columns(env){try{const result=await env.DB.prepare("PRAGMA table_info(items)").all();return new Set((result.results||[]).map(row=>row.name))}catch(_){return new Set(baseFields)}}
function clean(body){return{...body,name:String(body.name||"").trim(),description:String(body.description||"").trim()||null,selling_price:Math.max(0,Number(body.selling_price||0)),internal_cost:Math.max(0,Number(body.internal_cost||0)),quantity:Math.max(0,Number(body.quantity||0)),item_type:body.item_type==="Service"?"Service":"Goods",unit_of_measure:String(body.unit_of_measure||"Each"),status:body.status==="Inactive"?"Inactive":"Active",sales_account:String(body.sales_account||"Sales"),purchase_account:String(body.purchase_account||"Cost of Goods Sold")}}
const dbValue=(body,field)=>{const current=body[field];if(["selling_price","internal_cost","quantity"].includes(field))return Number(current||0);return current===undefined||current===null||current===""?null:current};

export async function onRequestGet({env,request}){
  try{
    const url=new URL(request.url),q=(url.searchParams.get("q")||"").trim(),id=Number(url.searchParams.get("id")),available=await columns(env),selected=[...baseFields,...optionalFields].filter(field=>available.has(field)),select=selected.join(",");
    if(id){const item=await env.DB.prepare(`SELECT ${select} FROM items WHERE id=?`).bind(id).first();return item?json(item):json({error:"Item not found"},404)}
    const searchable=["name","description","purchase_description","sku"].filter(field=>available.has(field)),sql=q?`SELECT ${select} FROM items WHERE ${searchable.map(field=>`${field} LIKE ?`).join(" OR ")} ORDER BY name LIMIT 1000`:`SELECT ${select} FROM items ORDER BY name LIMIT 1000`,result=q?await env.DB.prepare(sql).bind(...Array(searchable.length).fill(`%${q}%`)).all():await env.DB.prepare(sql).all();return json(result.results||[]);
  }catch(e){return json({error:e.message},500)}
}

export async function onRequestPost({env,request}){
  try{const body=clean(await request.json());if(!body.name)return json({error:"Item name is required"},400);const available=await columns(env),fields=editableFields.filter(field=>available.has(field)),placeholders=fields.map(()=>"?").join(","),result=await env.DB.prepare(`INSERT INTO items (${fields.join(",")}) VALUES (${placeholders})`).bind(...fields.map(field=>dbValue(body,field))).run();return json({id:result.meta.last_row_id},201)}catch(e){return json({error:e.message},500)}
}

export async function onRequestPut({env,request}){
  try{const body=clean(await request.json()),id=Number(body.id);if(!id||!body.name)return json({error:"Item ID and name are required"},400);const available=await columns(env),fields=editableFields.filter(field=>available.has(field)),assignments=fields.map(field=>`${field}=?`).join(",");await env.DB.prepare(`UPDATE items SET ${assignments} WHERE id=?`).bind(...fields.map(field=>dbValue(body,field)),id).run();return json({ok:true,id})}catch(e){return json({error:e.message},500)}
}

export async function onRequestPatch({env,request}){
  try{const body=await request.json(),ids=[...new Set((body.ids||[]).map(Number).filter(Boolean))],available=await columns(env);if(!ids.length)return json({error:"Select at least one item"},400);if(body.action!=="status"||!available.has("status"))return json({error:"Unsupported action or Items migration not installed"},400);const status=body.value==="Inactive"?"Inactive":"Active";await env.DB.batch(ids.map(id=>env.DB.prepare("UPDATE items SET status=? WHERE id=?").bind(status,id)));return json({ok:true})}catch(e){return json({error:e.message},500)}
}

export async function onRequestDelete({env,request}){
  try{
    const url=new URL(request.url),ids=(url.searchParams.get("ids")||url.searchParams.get("id")||"").split(",").map(Number).filter(Boolean);if(!ids.length)return json({error:"Item ID is required"},400);
    const tables=await env.DB.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name IN ('quotation_lines','invoice_lines')").all(),names=new Set((tables.results||[]).map(row=>row.name));
    for(const id of ids){if(names.has("quotation_lines")){const linked=await env.DB.prepare("SELECT COUNT(*) count FROM quotation_lines WHERE item_id=?").bind(id).first();if(Number(linked?.count||0))return json({error:"One or more items are used on quotations. Mark them inactive instead."},409)}if(names.has("invoice_lines")){const linked=await env.DB.prepare("SELECT COUNT(*) count FROM invoice_lines WHERE item_id=?").bind(id).first();if(Number(linked?.count||0))return json({error:"One or more items are used on invoices. Mark them inactive instead."},409)}}
    await env.DB.batch(ids.map(id=>env.DB.prepare("DELETE FROM items WHERE id=?").bind(id)));return json({ok:true});
  }catch(e){return json({error:e.message},500)}
}
