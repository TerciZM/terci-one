const json=(data,status=200)=>Response.json(data,{status});
const definitions={
 'profit-loss':{name:'Profit and Loss',category:'Business Overview'},
 'cash-flow':{name:'Cash Flow Statement',category:'Business Overview'},
 'sales-by-customer':{name:'Sales by Customer',category:'Sales'},
 'sales-by-item':{name:'Sales by Item',category:'Sales'},
 'sales-summary':{name:'Sales Summary',category:'Sales'},
 'receivables-aging':{name:'Accounts Receivable Aging',category:'Receivables'},
 'payments-received':{name:'Payments Received',category:'Payments Received'},
 'expenses-by-category':{name:'Expenses by Category',category:'Purchases and Expenses'},
 'inventory-summary':{name:'Inventory Summary',category:'Items and Inventory'},
 'quotation-summary':{name:'Quotation Summary',category:'Sales'},
 'recurring-invoices':{name:'Recurring Invoice Details',category:'Recurring Invoices'},
 'credit-notes':{name:'Credit Notes Summary',category:'Sales'}
};
const validDate=x=>/^\d{4}-\d{2}-\d{2}$/.test(x||'');
export async function onRequestGet({env,request}){
 try{
  const u=new URL(request.url),report=u.searchParams.get('report')||'',from=u.searchParams.get('from')||'1900-01-01',to=u.searchParams.get('to')||'2999-12-31';
  if(report==='catalog')return json(Object.entries(definitions).map(([id,x])=>({id,...x,created_by:'System Generated'})));
  const def=definitions[report];if(!def)return json({error:'Choose a valid report'},400);
  if(!validDate(from)||!validDate(to)||from>to)return json({error:'Enter a valid date range'},400);
  const db=env.DB;let columns=[],rows=[],summary={};
  if(report==='profit-loss'){
   const r=await db.prepare("SELECT COALESCE(SUM(CASE WHEN status NOT IN ('Draft','Void','Cancelled') THEN total ELSE 0 END),0) revenue,COALESCE(SUM(CASE WHEN status NOT IN ('Draft','Void','Cancelled') THEN amount_paid ELSE 0 END),0) received FROM invoices WHERE invoice_date BETWEEN ? AND ?").bind(from,to).first();
   const c=await db.prepare("SELECT COALESCE(SUM(il.quantity*il.internal_cost),0) cost FROM invoice_lines il JOIN invoices i ON i.id=il.invoice_id WHERE i.invoice_date BETWEEN ? AND ? AND i.status NOT IN ('Draft','Void','Cancelled')").bind(from,to).first();
   const e=await db.prepare("SELECT COALESCE(SUM(amount),0) expenses FROM expenses WHERE expense_date BETWEEN ? AND ? AND status='Recorded'").bind(from,to).first();
   const revenue=Number(r?.revenue||0),cost=Number(c?.cost||0),expenses=Number(e?.expenses||0);columns=['Account','Amount (ZMW)'];rows=[{Account:'Operating income — invoices',Amount:revenue},{Account:'Cost of goods sold',Amount:cost},{Account:'Gross profit',Amount:revenue-cost},{Account:'Operating expenses',Amount:expenses},{Account:'Net profit',Amount:revenue-cost-expenses}];summary={revenue,cost,expenses,net_profit:revenue-cost-expenses};
  }else if(report==='cash-flow'){
   const inc=await db.prepare("SELECT receipt_date AS date,receipt_number AS reference,c.name AS party,payment_method AS detail,amount,'Money In' AS direction FROM sales_receipts r LEFT JOIN customers c ON c.id=r.customer_id WHERE receipt_date BETWEEN ? AND ? AND status='Issued' ORDER BY receipt_date,receipt_number").bind(from,to).all();
   const out=await db.prepare("SELECT expense_date AS date,COALESCE(reference,'') AS reference,COALESCE(v.display_name,'') AS party,expense_account AS detail,amount,'Money Out' AS direction FROM expenses e LEFT JOIN vendors v ON v.id=e.vendor_id WHERE expense_date BETWEEN ? AND ? AND status='Recorded' ORDER BY expense_date,reference").bind(from,to).all();
   rows=[...(inc.results||[]),...(out.results||[])].sort((a,b)=>String(a.date).localeCompare(String(b.date)));columns=['Date','Reference','Customer / Vendor','Details','Direction','Amount (ZMW)'];summary={money_in:(inc.results||[]).reduce((s,x)=>s+Number(x.amount||0),0),money_out:(out.results||[]).reduce((s,x)=>s+Number(x.amount||0),0)};
  }else if(report==='sales-by-customer'||report==='sales-summary'){
   const grouped=report==='sales-by-customer';const result=await db.prepare(`SELECT ${grouped?'COALESCE(c.name,\'Unassigned\') AS Customer,':'i.invoice_date AS Date,'} COUNT(DISTINCT i.id) AS Invoices,COALESCE(SUM(i.total),0) AS Sales,COALESCE(SUM(i.amount_paid),0) AS Received,COALESCE(SUM(i.balance_due),0) AS Balance FROM invoices i LEFT JOIN customers c ON c.id=i.customer_id WHERE i.invoice_date BETWEEN ? AND ? AND i.status NOT IN ('Draft','Void','Cancelled') ${grouped?'GROUP BY c.id,c.name':'GROUP BY i.invoice_date'} ORDER BY Sales DESC`).bind(from,to).all();rows=grouped?(result.results||[]):(result.results||[]);columns=grouped?['Customer','Invoices','Sales (ZMW)','Received (ZMW)','Balance (ZMW)']:['Date','Invoices','Sales (ZMW)','Received (ZMW)','Balance (ZMW)'];
  }else if(report==='sales-by-item'){
   const result=await db.prepare("SELECT il.description AS Item,il.unit_of_measure AS Unit,COALESCE(SUM(il.quantity),0) AS Quantity,COALESCE(SUM(il.amount),SUM(il.quantity*il.rate),0) AS Sales FROM invoice_lines il JOIN invoices i ON i.id=il.invoice_id WHERE i.invoice_date BETWEEN ? AND ? AND i.status NOT IN ('Draft','Void','Cancelled') GROUP BY il.description,il.unit_of_measure ORDER BY Sales DESC").bind(from,to).all();rows=result.results||[];columns=['Item','Unit','Quantity','Sales (ZMW)'];
  }else if(report==='receivables-aging'){
   const result=await db.prepare("SELECT i.invoice_number AS Invoice,c.name AS Customer,i.invoice_date AS 'Invoice Date',i.due_date AS 'Due Date',MAX(0,julianday(?) - julianday(COALESCE(i.due_date,i.invoice_date))) AS 'Days Overdue',i.total AS Total,i.amount_paid AS Paid,i.balance_due AS Balance FROM invoices i LEFT JOIN customers c ON c.id=i.customer_id WHERE i.invoice_date<=? AND i.balance_due>0.005 AND i.status NOT IN ('Draft','Void','Cancelled') ORDER BY i.due_date").bind(to,to).all();rows=(result.results||[]).map(r=>({...r,'Age bracket':Number(r['Days Overdue'])<=0?'Current':Number(r['Days Overdue'])<=30?'1–30 days':Number(r['Days Overdue'])<=60?'31–60 days':Number(r['Days Overdue'])<=90?'61–90 days':'Over 90 days'}));columns=['Invoice','Customer','Invoice Date','Due Date','Days Overdue','Age bracket','Total (ZMW)','Paid (ZMW)','Balance (ZMW)'];
  }else if(report==='payments-received'){
   const result=await db.prepare("SELECT r.receipt_date AS Date,r.receipt_number AS Receipt,c.name AS Customer,COALESCE(i.invoice_number,'—') AS Invoice,r.payment_method AS 'Payment Method',COALESCE(r.payment_reference,'—') AS Reference,r.amount AS Amount FROM sales_receipts r LEFT JOIN customers c ON c.id=r.customer_id LEFT JOIN invoices i ON i.id=r.invoice_id WHERE r.receipt_date BETWEEN ? AND ? AND r.status='Issued' ORDER BY r.receipt_date DESC,r.id DESC").bind(from,to).all();rows=result.results||[];columns=['Date','Receipt','Customer','Invoice','Payment Method','Reference','Amount (ZMW)'];
  }else if(report==='expenses-by-category'){
   const result=await db.prepare("SELECT e.expense_account AS 'Expense Account',COUNT(*) AS Transactions,COALESCE(SUM(e.amount),0) AS Amount,COALESCE(SUM(e.tax_amount),0) AS Tax FROM expenses e WHERE e.expense_date BETWEEN ? AND ? AND e.status='Recorded' GROUP BY e.expense_account ORDER BY Amount DESC").bind(from,to).all();rows=result.results||[];columns=['Expense Account','Transactions','Amount (ZMW)','Tax (ZMW)'];
  }else if(report==='inventory-summary'){
   const result=await db.prepare("SELECT name AS Item,COALESCE(sku,'—') AS SKU,COALESCE(item_type,'Goods') AS Type,COALESCE(unit_of_measure,'Each') AS Unit,quantity AS Quantity,internal_cost AS 'Purchase Price',selling_price AS 'Selling Price',quantity*internal_cost AS 'Stock Cost',quantity*selling_price AS 'Stock Value',COALESCE(status,'Active') AS Status FROM items ORDER BY name").all();rows=result.results||[];columns=['Item','SKU','Type','Unit','Quantity','Purchase Price (ZMW)','Selling Price (ZMW)','Stock Cost (ZMW)','Stock Value (ZMW)','Status'];
  }else if(report==='quotation-summary'){
   const result=await db.prepare("SELECT q.quote_number AS 'Quote Number',q.quote_date AS Date,COALESCE(c.name,'—') AS Customer,COALESCE(q.subject,'—') AS Subject,q.status AS Status,q.total AS 'Quote Total' FROM quotations q LEFT JOIN customers c ON c.id=q.customer_id WHERE q.quote_date BETWEEN ? AND ? ORDER BY q.quote_date DESC,q.id DESC").bind(from,to).all();rows=result.results||[];columns=['Quote Number','Date','Customer','Subject','Status','Quote Total (ZMW)'];
  }else if(report==='recurring-invoices'){
   const result=await db.prepare("SELECT r.profile_name AS 'Profile Name',COALESCE(c.name,'—') AS Customer,r.frequency AS Frequency,r.start_date AS 'Start Date',r.next_run_date AS 'Next Run',r.total AS Amount,r.status AS Status FROM recurring_invoices r LEFT JOIN customers c ON c.id=r.customer_id WHERE r.start_date<=? AND (r.end_date IS NULL OR r.end_date>=?) ORDER BY r.next_run_date").bind(to,from).all();rows=result.results||[];columns=['Profile Name','Customer','Frequency','Start Date','Next Run','Amount (ZMW)','Status'];
  }else if(report==='credit-notes'){
   const result=await db.prepare("SELECT n.credit_note_number AS 'Credit Note',n.credit_date AS Date,COALESCE(c.name,'—') AS Customer,COALESCE(i.invoice_number,'—') AS Invoice,n.status AS Status,n.total AS Amount FROM credit_notes n LEFT JOIN customers c ON c.id=n.customer_id LEFT JOIN invoices i ON i.id=n.invoice_id WHERE n.credit_date BETWEEN ? AND ? ORDER BY n.credit_date DESC,n.id DESC").bind(from,to).all();rows=result.results||[];columns=['Credit Note','Date','Customer','Invoice','Status','Amount (ZMW)'];
  }
  return json({report,definition:def,from,to,columns,rows,summary,generated_at:new Date().toISOString()});
 }catch(e){return json({error:e.message},500)}
}
