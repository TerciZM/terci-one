const $ = id => document.getElementById(id);
const state = { customers: [], selected: new Set(), page: 1, size: 25, view: "active", search: "" };
const escapeHtml = value => String(value ?? "").replace(/[&<>"']/g, c => ({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));
function filteredCustomers() {
  const term = state.search.toLowerCase();
  let rows = state.customers.filter(c => [c.name,c.company_name,c.email,c.phone,c.address].some(v => String(v || "").toLowerCase().includes(term)));
  if (state.view === "active") rows = rows.filter(c => (c.status || "Active") === "Active");
  if (state.view === "inactive") rows = rows.filter(c => c.status === "Inactive");
  if (state.view === "crm") rows = rows.filter(c => c.email || c.phone);
  if (state.view === "portal-enabled") rows = rows.filter(c => Number(c.portal_enabled));
  if (state.view === "portal-disabled") rows = rows.filter(c => !Number(c.portal_enabled));
  if (state.view === "duplicates") {
    const counts = rows.reduce((m,c) => (m.set(c.name.trim().toLowerCase(), (m.get(c.name.trim().toLowerCase()) || 0) + 1), m), new Map());
    rows = rows.filter(c => counts.get(c.name.trim().toLowerCase()) > 1);
  }
  if (["overdue","unpaid"].includes(state.view)) rows = [];
  return rows;
}
function pageRows() { const all = filteredCustomers(), pages = Math.max(1, Math.ceil(all.length/state.size)); state.page = Math.min(state.page,pages); return { all, pages, rows: all.slice((state.page-1)*state.size,state.page*state.size) }; }
function draw() {
  const { all, pages, rows } = pageRows();
  $("customers").innerHTML = rows.length ? rows.map(c => `<tr class="${state.selected.has(c.id)?"selected-row":""}"><td><input type="checkbox" data-select="${c.id}" ${state.selected.has(c.id)?"checked":""}></td><td><button class="customer-link" data-edit="${c.id}">${escapeHtml(c.name)}</button></td><td>${escapeHtml(c.company_name || "—")}</td><td>${escapeHtml(c.email || "—")}</td><td>${escapeHtml(c.phone || "—")}</td><td><span class="customer-status ${String(c.status||"Active").toLowerCase()}">${escapeHtml(c.status || "Active")}</span></td><td>${escapeHtml(c.template_name || "—")}</td><td class="customer-actions"><button data-edit="${c.id}">Edit</button><button class="delete" data-delete="${c.id}">Delete</button></td></tr>`).join("") : '<tr><td colspan="8" class="empty-state">No customers found in this view.</td></tr>';
  const first = all.length ? (state.page-1)*state.size+1 : 0, last = Math.min(state.page*state.size,all.length);
  $("page-label").textContent = `${first}–${last} of ${all.length}`; $("top-page-info").textContent = `Page ${state.page} of ${pages}`; $("total-count").textContent = `Total count: ${all.length}`; $("customer-count").textContent = `${all.length} customer${all.length===1?"":"s"}`;
  $("prev-page").disabled = state.page <= 1; $("next-page").disabled = state.page >= pages;
  $("select-page").checked = rows.length > 0 && rows.every(c => state.selected.has(c.id));
  $("bulk-toolbar").hidden = state.selected.size === 0; $("standard-toolbar").hidden = state.selected.size > 0; $("selected-count").textContent = `${state.selected.size} selected`;
}
async function loadCustomers() { const r = await fetch("/api/customers"); const data = await r.json(); if (!r.ok) return alert(data.error || "Could not load customers"); state.customers = data; draw(); }
function openCustomer(c={}) { $("form-title").textContent = c.id ? "Edit customer" : "New customer"; $("customer-id").value=c.id||""; $("customer-name").value=c.name||""; $("customer-company").value=c.company_name||""; $("customer-email").value=c.email||""; $("customer-phone").value=c.phone||""; $("customer-address").value=c.address||""; $("customer-status").value=c.status||"Active"; $("customer-portal").value=Number(c.portal_enabled)?"1":"0"; $("customer-template").value=c.template_name||""; $("customer-form").classList.add("open"); $("customer-name").focus(); }
async function api(method, body, url="/api/customers") { const r=await fetch(url,{method,headers:{"content-type":"application/json"},body:body?JSON.stringify(body):undefined}),data=await r.json(); if(!r.ok) throw new Error(data.error||"Action failed"); return data; }
async function bulk(action,value,extra={}) { try { await api("PATCH",{action,value,ids:[...state.selected],...extra}); state.selected.clear(); await loadCustomers(); } catch(e){ alert(e.message); } }
$("new-customer").onclick=()=>openCustomer(); $("cancel-customer").onclick=()=>$("customer-form").classList.remove("open");
$("customer-editor").onsubmit=async e=>{e.preventDefault();const id=Number($("customer-id").value),body={id,name:$("customer-name").value,company_name:$("customer-company").value,email:$("customer-email").value,phone:$("customer-phone").value,address:$("customer-address").value,status:$("customer-status").value,portal_enabled:Number($("customer-portal").value),template_name:$("customer-template").value};try{await api(id?"PUT":"POST",body);$("customer-form").classList.remove("open");await loadCustomers()}catch(e){alert(e.message)}};
$("customers").onclick=async e=>{const edit=Number(e.target.dataset.edit),del=Number(e.target.dataset.delete);if(edit)openCustomer(state.customers.find(c=>c.id===edit));if(del&&confirm("Delete this customer?")){try{await api("DELETE",null,`/api/customers?id=${del}`);state.selected.delete(del);await loadCustomers()}catch(err){alert(err.message)}}};
$("customers").onchange=e=>{const id=Number(e.target.dataset.select);if(id){e.target.checked?state.selected.add(id):state.selected.delete(id);draw()}};
$("select-page").onchange=e=>{pageRows().rows.forEach(c=>e.target.checked?state.selected.add(c.id):state.selected.delete(c.id));draw()};
$("customer-filter").oninput=e=>{state.search=e.target.value;state.page=1;draw()}; $("page-size").onchange=e=>{state.size=Number(e.target.value);state.page=1;draw()}; $("prev-page").onclick=()=>{state.page--;draw()}; $("next-page").onclick=()=>{state.page++;draw()};
$("view-toggle").onclick=()=>$("customer-view").classList.toggle("open"); $("view-search").oninput=e=>document.querySelectorAll("[data-view]").forEach(b=>b.hidden=!b.textContent.toLowerCase().includes(e.target.value.toLowerCase()));
document.querySelectorAll("[data-view]").forEach(b=>b.onclick=()=>{state.view=b.dataset.view;state.page=1;state.selected.clear();$("view-label").textContent=b.textContent;document.querySelectorAll("[data-view]").forEach(x=>x.classList.toggle("selected",x===b));$("customer-view").classList.remove("open");draw()});
$("clear-selection").onclick=()=>{state.selected.clear();draw()}; $("mark-inactive").onclick=()=>bulk("status","Inactive");
$("bulk-update").onclick=()=>{const field=prompt("Field to update: company_name, email, phone, address, or status");if(!field)return;const value=prompt("New value");if(value!==null)bulk("bulk-update",value,{field})};
$("associate-template").onclick=()=>{const value=prompt("Template name to associate");if(value!==null)bulk("template",value)};
$("merge-customers").onclick=()=>{if(state.selected.size<2)return alert("Select at least two customers to merge.");const chosen=[...state.selected],primary=Number(prompt(`Primary customer ID (${chosen.join(", ")}):`,chosen[0]));if(primary&&state.selected.has(primary)&&confirm("Merge the selected customers into the primary record?"))bulk("merge",null,{primary_id:primary})};
$("bulk-delete").onclick=async()=>{if(!confirm(`Delete ${state.selected.size} selected customer(s)?`))return;try{await api("DELETE",null,`/api/customers?ids=${[...state.selected].join(",")}`);state.selected.clear();await loadCustomers()}catch(e){alert(e.message)}};
loadCustomers();
