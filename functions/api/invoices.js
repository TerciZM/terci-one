const json = (data,status=200) => Response.json(data,{status});
const validStatuses = new Set(["Draft","Locked","Pending Approval","Approved","Customer Viewed","Sent","Partial","Partially Paid","Unpaid","Payment Initiated","Paid","Overdue","Void","Write Off"]);

function datePrefix(dateText) {
  const date = new Date(`${dateText || new Date().toISOString().slice(0,10)}T12:00:00`);
  const yy=String(date.getFullYear()).slice(-2),mm=String(date.getMonth()+1).padStart(2,"0"),dd=String(date.getDate()).padStart(2,"0");
  return `INV-${yy}${mm}${dd}`;
}

async function nextNumber(env,dateText) {
  const prefix=datePrefix(dateText),result=await env.DB.prepare("SELECT invoice_number FROM invoices WHERE invoice_number LIKE ? ORDER BY invoice_number DESC LIMIT 1").bind(`${prefix}%`).first();
  const suffix=Number(String(result?.invoice_number||"").slice(prefix.length))||0;
  return `${prefix}${String(suffix+1).padStart(3,"0")}`;
}

function clean(body) {
  const lines=(body.lines||[]).filter(line=>String(line.description||line.name||"").trim()).map(line=>({
    item_id:Number(line.item_id||line.id)||null,
    description:String(line.description||line.name||"Item").trim(),
    quantity:Math.max(0,Number(line.quantity||0)),
    unit_of_measure:String(line.unit_of_measure||"Each"),
    rate:Math.max(0,Number(line.rate ?? line.selling_price ?? 0)),
    internal_cost:Math.max(0,Number(line.internal_cost||0))
  }));
  const subtotal=lines.reduce((sum,line)=>sum+line.quantity*line.rate,0),discount=Math.max(0,Number(body.discount||0)),adjustment=Number(body.adjustment||0),total=Math.max(0,subtotal-discount+adjustment),amountPaid=Math.min(total,Math.max(0,Number(body.amount_paid||0))),paymentType=["Advance","Partial","Full"].includes(body.payment_type)?body.payment_type:"None";
  return {...body,lines,subtotal,discount,adjustment,total,amount_paid:amountPaid,balance_due:Math.max(0,total-amountPaid),payment_type:paymentType,payment_date:body.payment_date||null,payment_reference:body.payment_reference||null,source_quote_id:Number(body.source_quote_id||0)||null};
}

export async function onRequestGet({env,request}) {
  try {
    const url=new URL(request.url),id=Number(url.searchParams.get("id"));
    if(id){
      const invoice=await env.DB.prepare("SELECT i.*,c.name AS customer_name,c.email AS customer_email,c.phone AS customer_phone,c.address AS customer_address FROM invoices i LEFT JOIN customers c ON c.id=i.customer_id WHERE i.id=?").bind(id).first();
      if(!invoice)return json({error:"Invoice not found"},404);
      const lines=await env.DB.prepare("SELECT id,item_id,description,quantity,unit_of_measure,rate,internal_cost,amount FROM invoice_lines WHERE invoice_id=? ORDER BY id").bind(id).all();
      return json({...invoice,lines:lines.results||[]});
    }
    const result=await env.DB.prepare("SELECT i.*,c.name AS customer_name,c.company_name FROM invoices i LEFT JOIN customers c ON c.id=i.customer_id ORDER BY i.invoice_date DESC,i.id DESC LIMIT 1000").all();
    return json(result.results||[]);
  } catch(e){return json({error:e.message},500)}
}

export async function onRequestPost({env,request}) {
  try {
    const body=clean(await request.json()),id=Number(body.id),customerId=Number(body.customer_id),invoiceDate=String(body.invoice_date||new Date().toISOString().slice(0,10)),dueDate=String(body.due_date||invoiceDate);
    if(!customerId)return json({error:"Select a customer"},400);
    if(!body.lines.length)return json({error:"Add at least one invoice item"},400);
    if(body.lines.some(line=>line.quantity<=0))return json({error:"Item quantities must be greater than zero"},400);
    let invoiceNumber=String(body.invoice_number||"").trim();
    if(id){
      const duplicate=invoiceNumber?await env.DB.prepare("SELECT id FROM invoices WHERE invoice_number=? AND id<>?").bind(invoiceNumber,id).first():null;
      if(!invoiceNumber||duplicate)invoiceNumber=await nextNumber(env,invoiceDate);
      await env.DB.prepare("UPDATE invoices SET invoice_number=?,customer_id=?,order_number=?,invoice_date=?,payment_terms=?,due_date=?,salesperson=?,subject=?,status=?,subtotal=?,discount=?,adjustment=?,total=?,amount_paid=?,balance_due=?,source_quote_id=?,payment_type=?,payment_date=?,payment_reference=?,customer_notes=?,terms_conditions=?,updated_at=CURRENT_TIMESTAMP WHERE id=?")
        .bind(invoiceNumber,customerId,body.order_number||null,invoiceDate,body.payment_terms||"Due on Receipt",dueDate,body.salesperson||null,body.subject||null,validStatuses.has(body.status)?body.status:"Draft",body.subtotal,body.discount,body.adjustment,body.total,body.amount_paid,body.balance_due,body.source_quote_id,body.payment_type,body.payment_date,body.payment_reference,body.customer_notes||null,body.terms_conditions||null,id).run();
      const statements=[env.DB.prepare("DELETE FROM invoice_lines WHERE invoice_id=?").bind(id),...body.lines.map(line=>env.DB.prepare("INSERT INTO invoice_lines (invoice_id,item_id,description,quantity,unit_of_measure,rate,internal_cost,amount) VALUES (?,?,?,?,?,?,?,?)").bind(id,line.item_id,line.description,line.quantity,line.unit_of_measure,line.rate,line.internal_cost,line.quantity*line.rate))];
      await env.DB.batch(statements);return json({ok:true,id,invoice_number:invoiceNumber});
    }
    const duplicate=invoiceNumber?await env.DB.prepare("SELECT id FROM invoices WHERE invoice_number=?").bind(invoiceNumber).first():null;
    if(!invoiceNumber||duplicate)invoiceNumber=await nextNumber(env,invoiceDate);
    const result=await env.DB.prepare("INSERT INTO invoices (invoice_number,customer_id,order_number,invoice_date,payment_terms,due_date,salesperson,subject,status,subtotal,discount,adjustment,total,amount_paid,balance_due,source_quote_id,payment_type,payment_date,payment_reference,customer_notes,terms_conditions) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)")
      .bind(invoiceNumber,customerId,body.order_number||null,invoiceDate,body.payment_terms||"Due on Receipt",dueDate,body.salesperson||null,body.subject||null,validStatuses.has(body.status)?body.status:"Draft",body.subtotal,body.discount,body.adjustment,body.total,body.amount_paid,body.balance_due,body.source_quote_id,body.payment_type,body.payment_date,body.payment_reference,body.customer_notes||null,body.terms_conditions||null).run();
    const newId=Number(result.meta.last_row_id);
    await env.DB.batch(body.lines.map(line=>env.DB.prepare("INSERT INTO invoice_lines (invoice_id,item_id,description,quantity,unit_of_measure,rate,internal_cost,amount) VALUES (?,?,?,?,?,?,?,?)").bind(newId,line.item_id,line.description,line.quantity,line.unit_of_measure,line.rate,line.internal_cost,line.quantity*line.rate)));
    return json({ok:true,id:newId,invoice_number:invoiceNumber},201);
  } catch(e){return json({error:e.message},500)}
}

export async function onRequestPatch({env,request}) {
  try {
    const body=await request.json(),id=Number(body.id),status=String(body.status||"");
    if(!id||!validStatuses.has(status))return json({error:"Valid invoice ID and status are required"},400);
    await env.DB.prepare("UPDATE invoices SET status=?,updated_at=CURRENT_TIMESTAMP WHERE id=?").bind(status,id).run();
    return json({ok:true});
  } catch(e){return json({error:e.message},500)}
}

export async function onRequestDelete({env,request}) {
  try {
    const id=Number(new URL(request.url).searchParams.get("id"));if(!id)return json({error:"Invoice ID is required"},400);
    const invoice=await env.DB.prepare("SELECT amount_paid FROM invoices WHERE id=?").bind(id).first();
    if(!invoice)return json({error:"Invoice not found"},404);
    if(Number(invoice.amount_paid||0)>0)return json({error:"An invoice with a recorded payment cannot be deleted. Void it instead."},409);
    await env.DB.batch([env.DB.prepare("DELETE FROM invoice_lines WHERE invoice_id=?").bind(id),env.DB.prepare("DELETE FROM invoices WHERE id=?").bind(id)]);return json({ok:true});
  } catch(e){return json({error:e.message},500)}
}
