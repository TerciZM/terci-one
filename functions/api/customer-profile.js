const json=(data,status=200)=>Response.json(data,{status});
async function rows(db,sql,id){try{const result=await db.prepare(sql).bind(id).all();return result.results||[]}catch(_){return []}}

export async function onRequestGet({env,request}){
  try{
    const id=Number(new URL(request.url).searchParams.get("id"));
    if(!id)return json({error:"Customer ID is required"},400);
    const customer=await env.DB.prepare("SELECT * FROM customers WHERE id=?").bind(id).first();
    if(!customer)return json({error:"Customer not found"},404);
    const [quotes,invoices,receipts,creditNotes,recurring]=await Promise.all([
      rows(env.DB,"SELECT id,quote_number,subject,quote_date,status,subtotal,total,created_at FROM quotations WHERE customer_id=? ORDER BY quote_date DESC,id DESC",id),
      rows(env.DB,"SELECT id,invoice_number,order_number,subject,invoice_date,due_date,status,subtotal,total,amount_paid,balance_due,payment_terms,created_at FROM invoices WHERE customer_id=? ORDER BY invoice_date DESC,id DESC",id),
      rows(env.DB,"SELECT r.id,r.receipt_number,r.invoice_id,r.receipt_date,r.payment_method,r.payment_reference,r.amount,r.status,i.invoice_number FROM sales_receipts r LEFT JOIN invoices i ON i.id=r.invoice_id WHERE r.customer_id=? ORDER BY r.receipt_date DESC,r.id DESC",id),
      rows(env.DB,"SELECT n.id,n.credit_note_number,n.invoice_id,n.credit_date,n.subject,n.status,n.total,i.invoice_number FROM credit_notes n LEFT JOIN invoices i ON i.id=n.invoice_id WHERE n.customer_id=? ORDER BY n.credit_date DESC,n.id DESC",id),
      rows(env.DB,"SELECT id,profile_name,frequency,start_date,next_run_date,end_date,status,total,subject FROM recurring_invoices WHERE customer_id=? ORDER BY created_at DESC,id DESC",id)
    ]);
    return json({customer,quotes,invoices,receipts,credit_notes:creditNotes,recurring});
  }catch(error){return json({error:error.message},500)}
}
