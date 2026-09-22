const $ = id => document.getElementById(id);
const state = {
  customers: [], selected: new Set(), page: 1, size: 25, view: "active", search: "",
  filters: { type: "", status: "", name: "", email: "", phone: "", portal: "", city: "", country: "", from: "", to: "" }
};
const escapeHtml = value => String(value ?? "").replace(/[&<>"']/g, c => ({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));
const includes = (value, term) => String(value || "").toLowerCase().includes(String(term || "").toLowerCase());
const value = id => $(id)?.value?.trim?.() ?? "";

function filteredCustomers() {
  const term = state.search.toLowerCase();
  const f = state.filters;
  let rows = state.customers.filter(c => [c.name,c.display_name,c.company_name,c.email,c.phone,c.mobile,c.address,c.customer_number].some(v => includes(v, term)));
  if (state.view === "active") rows = rows.filter(c => (c.status || "Active") === "Active");
  if (state.view === "inactive") rows = rows.filter(c => c.status === "Inactive");
  if (state.view === "crm") rows = rows.filter(c => c.email || c.phone || c.mobile);
  if (state.view === "portal-enabled") rows = rows.filter(c => Number(c.portal_enabled));
  if (state.view === "portal-disabled") rows = rows.filter(c => !Number(c.portal_enabled));
  if (state.view === "duplicates") {
    const counts = rows.reduce((m,c) => { const key=String(c.name||"").trim().toLowerCase(); return m.set(key,(m.get(key)||0)+1); },new Map());
    rows = rows.filter(c => counts.get(String(c.name||"").trim().toLowerCase()) > 1);
  }
  if (["overdue","unpaid"].includes(state.view)) rows = [];
  if (f.type) rows = rows.filter(c => (c.customer_type || "Business") === f.type);
  if (f.status) rows = rows.filter(c => (c.status || "Active") === f.status);
  if (f.name) rows = rows.filter(c => [c.name,c.display_name,c.company_name,c.first_name,c.last_name].some(v => includes(v,f.name)));
  if (f.email) rows = rows.filter(c => includes(c.email,f.email));
  if (f.phone) rows = rows.filter(c => [c.phone,c.mobile,c.billing_phone,c.shipping_phone].some(v => includes(v,f.phone)));
  if (f.portal !== "") rows = rows.filter(c => Number(c.portal_enabled) === Number(f.portal));
  if (f.city) rows = rows.filter(c => [c.billing_city,c.shipping_city,c.address].some(v => includes(v,f.city)));
  if (f.country) rows = rows.filter(c => [c.billing_country,c.shipping_country,c.address].some(v => includes(v,f.country)));
  if (f.from) rows = rows.filter(c => String(c.created_at || "").slice(0,10) >= f.from);
  if (f.to) rows = rows.filter(c => String(c.created_at || "").slice(0,10) <= f.to);
  return rows;
}

function pageRows() {
  const all = filteredCustomers(), pages = Math.max(1,Math.ceil(all.length/state.size));
  state.page = Math.min(state.page,pages);
  return { all, pages, rows: all.slice((state.page-1)*state.size,state.page*state.size) };
}

function draw() {
  const { all, pages, rows } = pageRows();
  $("customers").innerHTML = rows.length ? rows.map(c => `<tr class="${state.selected.has(c.id)?"selected-row":""}"><td><input type="checkbox" data-select="${c.id}" ${state.selected.has(c.id)?"checked":""}></td><td><button class="customer-link" data-edit="${c.id}">${escapeHtml(c.display_name || c.name)}</button>${c.customer_number?`<small class="customer-number">${escapeHtml(c.customer_number)}</small>`:""}</td><td>${escapeHtml(c.company_name || "—")}</td><td>${escapeHtml(c.email || "—")}</td><td>${escapeHtml(c.phone || c.mobile || "—")}</td><td><span class="customer-status ${String(c.status||"Active").toLowerCase()}">${escapeHtml(c.status || "Active")}</span></td><td>${escapeHtml(c.template_name || "—")}</td><td class="customer-actions"><button data-edit="${c.id}">Edit</button><button class="delete" data-delete="${c.id}">Delete</button></td></tr>`).join("") : '<tr><td colspan="8" class="empty-state">No customers found in this view.</td></tr>';
  const first=all.length?(state.page-1)*state.size+1:0,last=Math.min(state.page*state.size,all.length),filterCount=Object.values(state.filters).filter(v=>v!=="").length;
  $("page-label").textContent=`${first}–${last} of ${all.length}`; $("top-page-info").textContent=`Page ${state.page} of ${pages}`; $("total-count").textContent=`Total count: ${all.length}`; $("customer-count").textContent=`${all.length} customer${all.length===1?"":"s"}`;
  $("filter-summary").textContent=filterCount?`${filterCount} advanced filter${filterCount===1?"":"s"} applied`:"";
  $("advanced-filter").classList.toggle("active",filterCount>0); $("prev-page").disabled=state.page<=1; $("next-page").disabled=state.page>=pages;
  $("select-page").checked=rows.length>0&&rows.every(c=>state.selected.has(c.id)); $("bulk-toolbar").hidden=state.selected.size===0; $("standard-toolbar").hidden=state.selected.size>0; $("selected-count").textContent=`${state.selected.size} selected`;
}

async function loadCustomers() {
  const r=await fetch("/api/customers"),data=await r.json();
  if(!r.ok) return alert(data.error||"Could not load customers");
  state.customers=data; draw();
}

const formMap = {
  salutation:"customer-salutation", first_name:"customer-first-name", last_name:"customer-last-name", company_name:"customer-company", name:"customer-name", customer_number:"customer-number", email:"customer-email", phone:"customer-phone", mobile:"customer-mobile", language:"customer-language", status:"customer-status", currency:"customer-currency", tax_rate:"customer-tax-rate", payment_terms:"customer-payment-terms", opening_balance:"customer-opening-balance", credit_limit:"customer-credit-limit", portal_enabled:"customer-portal", template_name:"customer-template",
  billing_attention:"billing-attention",billing_country:"billing-country",billing_address1:"billing-address1",billing_address2:"billing-address2",billing_city:"billing-city",billing_state:"billing-state",billing_zip:"billing-zip",billing_phone:"billing-phone",billing_fax:"billing-fax",
  shipping_attention:"shipping-attention",shipping_country:"shipping-country",shipping_address1:"shipping-address1",shipping_address2:"shipping-address2",shipping_city:"shipping-city",shipping_state:"shipping-state",shipping_zip:"shipping-zip",shipping_phone:"shipping-phone",shipping_fax:"shipping-fax",
  contact_persons:"customer-contacts", reporting_tags:"customer-tags", remarks:"customer-remarks"
};

function activateTab(name="details") {
  document.querySelectorAll("[data-customer-tab]").forEach(b=>b.classList.toggle("active",b.dataset.customerTab===name));
  document.querySelectorAll("[data-customer-panel]").forEach(p=>p.classList.toggle("active",p.dataset.customerPanel===name));
}

function openCustomer(c={}) {
  $("customer-editor").reset(); $("form-title").textContent=c.id?"Edit customer":"New customer"; $("customer-id").value=c.id||"";
  document.querySelectorAll('[name="customer-type"]').forEach(r=>r.checked=r.value===(c.customer_type||"Business"));
  Object.entries(formMap).forEach(([field,id])=>{ let v=c[field]??""; if(field==="name")v=c.display_name||c.name||""; if(field==="billing_address1"&&!v)v=c.address||""; if(field==="portal_enabled")v=Number(c.portal_enabled)?"1":"0"; $(id).value=v; });
  if(!c.id){ $("customer-language").value="English"; $("customer-currency").value="ZMW"; $("customer-payment-terms").value="Due on Receipt"; $("customer-status").value="Active"; $("billing-country").value="Zambia"; $("shipping-country").value="Zambia"; }
  activateTab(); $("customer-form").classList.add("open"); $("customer-name").focus();
}

function customerPayload() {
  const body={ id:Number($("customer-id").value)||undefined, customer_type:document.querySelector('[name="customer-type"]:checked').value };
  Object.entries(formMap).forEach(([field,id])=>body[field]=$(id).value.trim());
  body.portal_enabled=Number(body.portal_enabled); body.display_name=body.name; body.opening_balance=Number(body.opening_balance||0); body.credit_limit=Number(body.credit_limit||0);
  body.address=[body.billing_address1,body.billing_address2,body.billing_city,body.billing_state,body.billing_country].filter(Boolean).join(", ");
  return body;
}

async function api(method,body,url="/api/customers") { const r=await fetch(url,{method,headers:{"content-type":"application/json"},body:body?JSON.stringify(body):undefined}),data=await r.json(); if(!r.ok)throw new Error(data.error||"Action failed"); return data; }
async function bulk(action,value,extra={}) { try{await api("PATCH",{action,value,ids:[...state.selected],...extra});state.selected.clear();await loadCustomers()}catch(e){alert(e.message)} }

$("new-customer").onclick=()=>openCustomer(); $("cancel-customer").onclick=()=>$("customer-form").classList.remove("open");
document.querySelectorAll("[data-close]").forEach(b=>b.onclick=()=>$(b.dataset.close).classList.remove("open"));
document.querySelectorAll("[data-customer-tab]").forEach(b=>b.onclick=()=>activateTab(b.dataset.customerTab));

$("customer-editor").onsubmit=async e=>{e.preventDefault();const body=customerPayload();try{await api(body.id?"PUT":"POST",body);$("customer-form").classList.remove("open");await loadCustomers()}catch(err){alert(err.message)}};
$("same-as-billing").onchange=e=>{if(!e.target.checked)return;["attention","country","address1","address2","city","state","zip","phone","fax"].forEach(k=>$("shipping-"+k).value=$("billing-"+k).value)};

$("advanced-filter").onclick=()=>$("advanced-panel").classList.add("open");
$("advanced-editor").onsubmit=e=>{e.preventDefault();state.filters={type:value("filter-type"),status:value("filter-status"),name:value("filter-name"),email:value("filter-email"),phone:value("filter-phone"),portal:value("filter-portal"),city:value("filter-city"),country:value("filter-country"),from:value("filter-created-from"),to:value("filter-created-to")};state.page=1;$("advanced-panel").classList.remove("open");draw()};
$("clear-filters").onclick=()=>{$("advanced-editor").reset();state.filters={type:"",status:"",name:"",email:"",phone:"",portal:"",city:"",country:"",from:"",to:""};state.page=1;$("advanced-panel").classList.remove("open");draw()};

$("customers").onclick=async e=>{const edit=Number(e.target.dataset.edit),del=Number(e.target.dataset.delete);if(edit)openCustomer(state.customers.find(c=>c.id===edit));if(del&&confirm("Delete this customer?")){try{await api("DELETE",null,`/api/customers?id=${del}`);state.selected.delete(del);await loadCustomers()}catch(err){alert(err.message)}}};
$("customers").onchange=e=>{const id=Number(e.target.dataset.select);if(id){e.target.checked?state.selected.add(id):state.selected.delete(id);draw()}};
$("select-page").onchange=e=>{pageRows().rows.forEach(c=>e.target.checked?state.selected.add(c.id):state.selected.delete(c.id));draw()};
$("customer-filter").oninput=e=>{state.search=e.target.value;state.page=1;draw()}; $("page-size").onchange=e=>{state.size=Number(e.target.value);state.page=1;draw()}; $("prev-page").onclick=()=>{state.page--;draw()}; $("next-page").onclick=()=>{state.page++;draw()};
$("view-toggle").onclick=()=>$("customer-view").classList.toggle("open"); $("view-search").oninput=e=>document.querySelectorAll("[data-view]").forEach(b=>b.hidden=!b.textContent.toLowerCase().includes(e.target.value.toLowerCase()));
document.querySelectorAll("[data-view]").forEach(b=>b.onclick=()=>{state.view=b.dataset.view;state.page=1;state.selected.clear();$("view-label").textContent=b.textContent;document.querySelectorAll("[data-view]").forEach(x=>x.classList.toggle("selected",x===b));$("customer-view").classList.remove("open");draw()});
$("clear-selection").onclick=()=>{state.selected.clear();draw()}; $("mark-inactive").onclick=()=>bulk("status","Inactive");
$("bulk-update").onclick=()=>{const field=prompt("Field to update: company_name, email, phone, address, or status");if(!field)return;const v=prompt("New value");if(v!==null)bulk("bulk-update",v,{field})};
$("associate-template").onclick=()=>{const v=prompt("Template name to associate");if(v!==null)bulk("template",v)};
$("merge-customers").onclick=()=>{if(state.selected.size<2)return alert("Select at least two customers to merge.");const chosen=[...state.selected],primary=Number(prompt(`Primary customer ID (${chosen.join(", ")}):`,chosen[0]));if(primary&&state.selected.has(primary)&&confirm("Merge the selected customers into the primary record?"))bulk("merge",null,{primary_id:primary})};
$("bulk-delete").onclick=async()=>{if(!confirm(`Delete ${state.selected.size} selected customer(s)?`))return;try{await api("DELETE",null,`/api/customers?ids=${[...state.selected].join(",")}`);state.selected.clear();await loadCustomers()}catch(e){alert(e.message)}};
loadCustomers();
