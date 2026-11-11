(() => {
  const $ = id => document.getElementById(id);
  const state = { customers: [], search: "", view: "active", page: 1, size: 25, selected: new Set(), filters: {} };
  let displayNameEdited = false;
  const africanCountries = ["Algeria","Angola","Benin","Botswana","Burkina Faso","Burundi","Cabo Verde","Cameroon","Central African Republic","Chad","Comoros","Democratic Republic of the Congo","Republic of the Congo","Côte d’Ivoire","Djibouti","Egypt","Equatorial Guinea","Eritrea","Eswatini","Ethiopia","Gabon","The Gambia","Ghana","Guinea","Guinea-Bissau","Kenya","Lesotho","Liberia","Libya","Madagascar","Malawi","Mali","Mauritania","Mauritius","Morocco","Mozambique","Namibia","Niger","Nigeria","Rwanda","São Tomé and Príncipe","Senegal","Seychelles","Sierra Leone","Somalia","South Africa","South Sudan","Sudan","Tanzania","Togo","Tunisia","Uganda","Western Sahara","Zambia","Zimbabwe"];
  const esc = value => String(value ?? "").replace(/[&<>"']/g, ch => ({ "&":"&amp;", "<":"&lt;", ">":"&gt;", '"':"&quot;", "'":"&#39;" }[ch]));
  const fields = {
    "customer-salutation":"salutation", "customer-first-name":"first_name", "customer-last-name":"last_name", "customer-company":"company_name",
    "customer-name":"display_name", "customer-number":"customer_number", "customer-email":"email", "customer-phone":"phone", "customer-mobile":"mobile",
    "customer-language":"language", "customer-status":"status", "customer-currency":"currency", "customer-tax-rate":"tax_rate",
    "customer-payment-terms":"payment_terms", "customer-opening-balance":"opening_balance", "customer-credit-limit":"credit_limit",
    "customer-portal":"portal_enabled", "customer-template":"template_name", "billing-attention":"billing_attention", "billing-country":"billing_country",
    "billing-address1":"billing_address1", "billing-address2":"billing_address2", "billing-city":"billing_city", "billing-state":"billing_state",
    "billing-zip":"billing_zip", "billing-phone":"billing_phone", "billing-fax":"billing_fax", "shipping-attention":"shipping_attention",
    "shipping-country":"shipping_country", "shipping-address1":"shipping_address1", "shipping-address2":"shipping_address2", "shipping-city":"shipping_city",
    "shipping-state":"shipping_state", "shipping-zip":"shipping_zip", "shipping-phone":"shipping_phone", "shipping-fax":"shipping_fax",
    "customer-contacts":"contact_persons", "customer-tags":"reporting_tags", "customer-remarks":"remarks"
  };
  const selectedType = () => document.querySelector('[name="customer-type"]:checked')?.value || "Business";
  const displayName = c => c.display_name || c.name || [c.salutation, c.first_name, c.last_name].filter(Boolean).join(" ") || c.company_name || "Unnamed customer";
  const contactName = c => [c.salutation, c.first_name, c.last_name].filter(Boolean).join(" ");
  function initCountrySelects(){for(const id of ["billing-country","shipping-country"]){const select=$(id);select.innerHTML='<option value="">Select an African country</option>'+africanCountries.map(country=>`<option value="${esc(country)}">${esc(country)}</option>`).join("")}}
  function preserveCountryOption(id,value){const select=$(id);if(value&&!Array.from(select.options).some(option=>option.value===value)){const option=document.createElement("option");option.value=value;option.textContent=value;select.append(option)}}

  function matches(c) {
    const q = state.search.trim().toLowerCase();
    const text = [c.name,c.display_name,c.company_name,c.email,c.phone,c.mobile,c.address,c.customer_number,c.first_name,c.last_name].join(" ").toLowerCase();
    if (q && !text.includes(q)) return false;
    if (state.view === "active" && (c.status || "Active") !== "Active") return false;
    if (state.view === "inactive" && c.status !== "Inactive") return false;
    if (state.view === "portal-enabled" && Number(c.portal_enabled) !== 1) return false;
    if (state.view === "portal-disabled" && Number(c.portal_enabled) === 1) return false;
    const f=state.filters;
    if(f.type && c.customer_type!==f.type) return false;
    if(f.status && (c.status||"Active")!==f.status) return false;
    if(f.name && !`${c.name||""} ${c.company_name||""}`.toLowerCase().includes(f.name.toLowerCase())) return false;
    if(f.email && !String(c.email||"").toLowerCase().includes(f.email.toLowerCase())) return false;
    if(f.phone && !`${c.phone||""} ${c.mobile||""}`.includes(f.phone)) return false;
    if(f.portal!=="" && f.portal!==undefined && Number(c.portal_enabled||0)!==Number(f.portal)) return false;
    if(f.city && !String(c.billing_city||"").toLowerCase().includes(f.city.toLowerCase())) return false;
    if(f.country && !String(c.billing_country||"").toLowerCase().includes(f.country.toLowerCase())) return false;
    if(f.from && String(c.created_at||"").slice(0,10)<f.from) return false;
    if(f.to && String(c.created_at||"").slice(0,10)>f.to) return false;
    return true;
  }
  function pageData(){const all=state.customers.filter(matches),pages=Math.max(1,Math.ceil(all.length/state.size));state.page=Math.min(state.page,pages);return{all,pages,rows:all.slice((state.page-1)*state.size,state.page*state.size)}}
  function draw(){
    const {all,pages,rows}=pageData();
    $("customers").innerHTML=rows.length?rows.map(c=>{const contact=contactName(c);return `<tr class="${state.selected.has(c.id)?"selected-row":""}"><td><input type="checkbox" data-select-customer="${c.id}" ${state.selected.has(c.id)?"checked":""} aria-label="Select ${esc(displayName(c))}"></td><td><button type="button" class="customer-link" data-edit-customer="${c.id}">${esc(displayName(c))}</button>${contact && contact!==displayName(c)?`<small class="customer-number">Contact: ${esc(contact)}</small>`:""}${c.customer_number?`<small class="customer-number">${esc(c.customer_number)}</small>`:""}</td><td>${esc(c.company_name||"—")}</td><td>${esc(c.email||"—")}</td><td>${esc(c.phone||c.mobile||"—")}</td><td><span class="customer-status ${String(c.status||"Active").toLowerCase()}">${esc(c.status||"Active")}</span></td><td>${esc(c.template_name||"—")}</td><td class="customer-actions"><button type="button" data-edit-customer="${c.id}">Edit</button><button type="button" class="delete" data-delete-customer="${c.id}">Delete</button></td></tr>`}).join(""):`<tr><td colspan="8" class="empty-state">${state.customers.length?"No customers match these filters.":"No customers yet. Select “＋ New” to add one."}</td></tr>`;
    const first=all.length?(state.page-1)*state.size+1:0,last=Math.min(state.page*state.size,all.length);
    $("top-page-info").textContent=`Page ${state.page} of ${pages}`;$("page-label").textContent=`${first}–${last} of ${all.length}`;$("total-count").textContent=`Total count: ${all.length}`;$("customer-count").textContent=`${all.length} customer${all.length===1?"":"s"}`;
    $("prev-page").disabled=state.page<=1;$("next-page").disabled=state.page>=pages;$("select-page").checked=rows.length>0&&rows.every(c=>state.selected.has(c.id));
    $("bulk-toolbar").hidden=!state.selected.size;$("standard-toolbar").hidden=Boolean(state.selected.size);$("selected-count").textContent=`${state.selected.size} selected`;
    const active=state.filters&&Object.values(state.filters).some(Boolean);$("filter-summary").textContent=active?"Filters applied":"";$("advanced-filter").classList.toggle("active",active);
  }
  async function api(url="/api/customers",options={}){const response=await fetch(url,options);let data;try{data=await response.json()}catch{data={}}if(!response.ok)throw new Error(data.error||"Customer request failed");return data}
  async function load(){try{const data=await api();state.customers=Array.isArray(data)?data:[];draw()}catch(error){$("customers").innerHTML=`<tr><td colspan="8" class="empty-state">${esc(error.message)}</td></tr>`}}
  function openForm(customer=null){
    $("customer-editor").reset();displayNameEdited=Boolean(customer?.display_name||customer?.name);$("customer-id").value=customer?.id||"";$("form-title").textContent=customer?"Edit customer":"New customer";
    document.querySelectorAll('[name="customer-type"]').forEach(r=>r.checked=(r.value===(customer?.customer_type||"Business")));
    for(const [id,key] of Object.entries(fields)){const el=$(id);if(el){const value=customer?.[key]??(id==="customer-currency"?"ZMW":id==="customer-language"?"English":id==="customer-status"?"Active":id==="customer-payment-terms"?"Due on Receipt":id==="customer-portal"?"0":"");if(id==="billing-country"||id==="shipping-country")preserveCountryOption(id,value);el.value=value}}
    if(customer?.display_name==null&&customer?.name)$("customer-name").value=customer.name;
    for(const id of ["billing-country","shipping-country"])$(id.replace("country","state")).setAttribute("list",$(id).value==="Zambia"?"zambia-provinces":"");
    if(customer){const display=customer.display_name||customer.name||"",company=customer.company_name||"",person=[customer.first_name,customer.last_name].filter(Boolean).join(" ");$("display-name-source").value=company&&display===company?"company":person&&display===person?"contact":"auto"}
    document.querySelectorAll("[data-customer-tab]").forEach((b,i)=>b.classList.toggle("active",i===0));document.querySelectorAll("[data-customer-panel]").forEach((p,i)=>p.classList.toggle("active",i===0));
    $("customer-form").classList.add("open");$("customer-salutation").focus();
  }
  function syncDisplayName(){if(displayNameEdited)return;const company=$("customer-company").value.trim();const personal=[$("customer-first-name").value.trim(),$("customer-last-name").value.trim()].filter(Boolean).join(" ");const source=$("display-name-source").value;$("customer-name").value=source==="company"?company:source==="contact"?personal:company||personal}
  function closeForm(){ $("customer-form").classList.remove("open"); }
  function payload(){const body={};for(const [id,key] of Object.entries(fields)){const el=$(id);body[key]=el?el.value.trim():""}body.customer_type=selectedType();body.name=body.display_name;body.portal_enabled=Number(body.portal_enabled||0);body.opening_balance=Number(body.opening_balance||0);body.credit_limit=Number(body.credit_limit||0);return body}
  function validEmail(value){return !value||/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value)}
  $("new-customer").onclick=()=>openForm();$("cancel-customer").onclick=closeForm;
  ["customer-company","customer-first-name","customer-last-name"].forEach(id=>$(id).addEventListener("input",syncDisplayName));
  $("display-name-source").addEventListener("change",()=>{displayNameEdited=false;syncDisplayName()});
  $("customer-name").addEventListener("input",()=>{displayNameEdited=true});
  document.querySelectorAll('[data-close="customer-form"]').forEach(b=>b.onclick=closeForm);
  $("customer-form").addEventListener("click",e=>{if(e.target===$("customer-form"))closeForm()});
  $("customer-editor").addEventListener("submit",async e=>{e.preventDefault();const id=$("customer-id").value,body=payload();if(!validEmail(body.email)){alert("Enter a valid email address, including @ and a domain.");$("customer-email").focus();return}if(!body.display_name){const generated=[body.salutation,body.first_name,body.last_name].filter(Boolean).join(" ");body.display_name=generated||body.company_name;if(!body.display_name){alert("Enter a display name, company name, or contact name.");return}$("customer-name").value=body.display_name;body.name=body.display_name}
    const button=e.submitter;button.disabled=true;button.textContent="Saving…";try{await api("/api/customers",{method:id?"PUT":"POST",headers:{"content-type":"application/json"},body:JSON.stringify(id?{...body,id}:body)});closeForm();state.selected.clear();await load()}catch(error){alert(error.message)}finally{button.disabled=false;button.textContent="Save customer"}
  });
  document.querySelectorAll("[data-customer-tab]").forEach(button=>button.onclick=()=>{document.querySelectorAll("[data-customer-tab]").forEach(b=>b.classList.toggle("active",b===button));document.querySelectorAll("[data-customer-panel]").forEach(panel=>panel.classList.toggle("active",panel.dataset.customerPanel===button.dataset.customerTab))});
  $("same-as-billing").onchange=e=>{if(!e.target.checked)return;for(const suffix of ["attention","country","address1","address2","city","state","zip","phone","fax"]){$("shipping-"+suffix).value=$("billing-"+suffix).value}};
  ["billing-country","shipping-country"].forEach(id=>$(id).addEventListener("change",()=>{$(id.replace("country","state")).setAttribute("list",$(id).value==="Zambia"?"zambia-provinces":"")}));
  $("customer-filter").oninput=e=>{state.search=e.target.value;state.page=1;draw()};$("page-size").onchange=e=>{state.size=Number(e.target.value);state.page=1;draw()};$("prev-page").onclick=()=>{state.page--;draw()};$("next-page").onclick=()=>{state.page++;draw()};
  $("view-toggle").onclick=()=>$("customer-view").classList.toggle("open");$("view-search").oninput=e=>document.querySelectorAll("[data-view]").forEach(b=>b.hidden=!b.textContent.toLowerCase().includes(e.target.value.toLowerCase()));
  document.querySelectorAll("[data-view]").forEach(b=>b.onclick=()=>{state.view=b.dataset.view;state.page=1;state.selected.clear();$("view-label").textContent=b.textContent;document.querySelectorAll("[data-view]").forEach(x=>x.classList.toggle("selected",x===b));$("customer-view").classList.remove("open");draw()});
  $("advanced-filter").onclick=()=>$("advanced-panel").classList.add("open");document.querySelectorAll('[data-close="advanced-panel"]').forEach(b=>b.onclick=()=>$("advanced-panel").classList.remove("open"));
  $("advanced-editor").onsubmit=e=>{e.preventDefault();state.filters={type:$("filter-type").value,status:$("filter-status").value,name:$("filter-name").value.trim(),email:$("filter-email").value.trim(),phone:$("filter-phone").value.trim(),portal:$("filter-portal").value,city:$("filter-city").value.trim(),country:$("filter-country").value.trim(),from:$("filter-created-from").value,to:$("filter-created-to").value};state.page=1;$("advanced-panel").classList.remove("open");draw()};
  $("clear-filters").onclick=()=>{$("advanced-editor").reset();state.filters={};state.page=1;draw()};
  $("select-page").onchange=e=>{pageData().rows.forEach(c=>e.target.checked?state.selected.add(c.id):state.selected.delete(c.id));draw()};
  $("customers").onchange=e=>{const id=Number(e.target.dataset.selectCustomer);if(!id)return;e.target.checked?state.selected.add(id):state.selected.delete(id);draw()};
  $("customers").onclick=async e=>{const edit=Number(e.target.dataset.editCustomer),del=Number(e.target.dataset.deleteCustomer);if(edit){try{openForm(await api(`/api/customers?id=${edit}`))}catch(error){alert(error.message)}}if(del&&confirm("Delete this customer?")){try{await api(`/api/customers?id=${del}`,{method:"DELETE"});state.selected.delete(del);await load()}catch(error){alert(error.message)}}};
  $("clear-selection").onclick=()=>{state.selected.clear();draw()};
  $("mark-inactive").onclick=()=>setSelectedStatus("Inactive");
  async function setSelectedStatus(value){try{await api("/api/customers",{method:"PATCH",headers:{"content-type":"application/json"},body:JSON.stringify({action:"status",value,ids:[...state.selected]})});state.selected.clear();await load()}catch(error){alert(error.message)}}
  $("bulk-update").onclick=()=>{const field=prompt("Field to update: company_name, email, phone, mobile, address, or status");if(!["company_name","email","phone","mobile","address","status"].includes(field))return;const value=prompt(`New value for ${field}:`);if(value===null)return;api("/api/customers",{method:"PATCH",headers:{"content-type":"application/json"},body:JSON.stringify({action:"bulk-update",field,value,ids:[...state.selected]})}).then(()=>{state.selected.clear();load()}).catch(error=>alert(error.message))};
  $("associate-template").onclick=()=>{const value=prompt("Template name to assign:");if(value===null)return;api("/api/customers",{method:"PATCH",headers:{"content-type":"application/json"},body:JSON.stringify({action:"template",value,ids:[...state.selected]})}).then(()=>{state.selected.clear();load()}).catch(error=>alert(error.message))};
  $("bulk-delete").onclick=async()=>{if(!confirm(`Delete ${state.selected.size} selected customer(s)?`))return;try{await api(`/api/customers?ids=${[...state.selected].join(",")}`,{method:"DELETE"});state.selected.clear();await load()}catch(error){alert(error.message)}};
  $("merge-customers").onclick=()=>alert("To merge customers, select the primary customer first in the merge workflow. This action is not available yet.");
  initCountrySelects();
  load();
})();
