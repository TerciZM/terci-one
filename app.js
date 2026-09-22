const sidebarShell = document.querySelector(".app-shell");
const sidebarToggle = document.querySelector(".sidebar-toggle");
if (sidebarShell && sidebarToggle) {
  const sidebarStorageKey = "terci-sidebar-collapsed";
  const setSidebarCollapsed = (collapsed) => {
    sidebarShell.classList.toggle("sidebar-collapsed", collapsed);
    sidebarToggle.textContent = collapsed ? "›" : "‹";
    sidebarToggle.setAttribute("aria-expanded", String(!collapsed));
    sidebarToggle.setAttribute(
      "aria-label",
      collapsed ? "Expand sidebar" : "Collapse sidebar",
    );
    sidebarToggle.title = collapsed ? "Expand sidebar" : "Collapse sidebar";
  };
  setSidebarCollapsed(localStorage.getItem(sidebarStorageKey) === "true");
  sidebarToggle.addEventListener("click", () => {
    const collapsed = !sidebarShell.classList.contains("sidebar-collapsed");
    localStorage.setItem(sidebarStorageKey, String(collapsed));
    setSidebarCollapsed(collapsed);
  });
}

const lines = document.getElementById("lines");
let selectedCustomer = null,
  rows = [],
  additionalCosts = [];
const money = (n) =>
  "K" +
  Number(n || 0).toLocaleString("en-ZM", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
async function search(e, q) {
  const r = await fetch(`${e}?q=${encodeURIComponent(q)}`);
  return r.ok ? r.json() : [];
}
function menu(a, input, pick) {
  document.querySelector(".suggestions")?.remove();
  if (!a.length) return;
  const b = document.createElement("div");
  b.className = "suggestions";
  Object.assign(b.style, {
    position: "absolute",
    top: "100%",
    left: "0",
    zIndex: 20,
    background: "#fff",
    border: "1px solid #dbe5e4",
    borderRadius: "8px",
    width: "100%",
    boxShadow: "0 5px 15px #0002",
  });
  a.forEach((x) => {
    const z = document.createElement("button");
    z.type = "button";
    z.textContent = x.description ? `${x.name} — ${x.description}` : x.name;
    Object.assign(z.style, {
      display: "block",
      width: "100%",
      padding: "10px",
      border: 0,
      background: "#fff",
      textAlign: "left",
      cursor: "pointer",
    });
    z.onclick = () => {
      pick(x);
      b.remove();
    };
    b.appendChild(z);
  });
  input.parentElement.style.position = "relative";
  input.parentElement.appendChild(b);
}
function render() {
  if (!lines) return;
  lines.innerHTML = rows.length
    ? rows
        .map(
          (r, i) =>
            `<tr><td>${r.id ? `<b>${r.name}</b>${r.description ? `<small class="line-description">${r.description}</small>` : ""}` : `<div class="line-search-field"><span class="line-search-icon" aria-hidden="true">⌕</span><input class="line-search" data-i="${i}" aria-label="Search item or description" placeholder="Search item or description"></div>`}</td><td><input class="qty" data-i="${i}" type="number" min="1" value="${r.quantity || 1}"></td><td><select class="unit-input" data-i="${i}"><option ${r.unit_of_measure === "Each" ? "selected" : ""}>Each</option><option ${r.unit_of_measure === "Metre" ? "selected" : ""}>Metre</option><option ${r.unit_of_measure === "Roll" ? "selected" : ""}>Roll</option><option ${r.unit_of_measure === "Day" ? "selected" : ""}>Day</option><option ${r.unit_of_measure === "Month" ? "selected" : ""}>Month</option><option ${r.unit_of_measure === "Job" ? "selected" : ""}>Job</option><option ${r.unit_of_measure === "Set" ? "selected" : ""}>Set</option></select></td><td><input class="price-input" data-field="selling_price" data-i="${i}" type="number" min="0" step="0.01" value="${Number(r.selling_price || 0)}"></td><td class="cost"><input class="price-input" data-field="internal_cost" data-i="${i}" type="number" min="0" step="0.01" value="${Number(r.internal_cost || 0)}"></td><td class="profit">${money((r.selling_price - r.internal_cost) * (r.quantity || 1))}</td><td><button type="button" data-remove="${i}">×</button></td></tr>`,
        )
        .join("")
    : '<tr><td colspan="7" class="empty">No items added yet. Click “Add another item or service”.</td></tr>';
  lines.querySelectorAll(".qty").forEach(
    (e) =>
      (e.onchange = () => {
        rows[e.dataset.i].quantity = Number(e.value) || 1;
        render();
      }),
  );
  lines.querySelectorAll(".price-input").forEach((e) =>
    e.addEventListener("change", () => {
      rows[e.dataset.i][e.dataset.field] = Number(e.value) || 0;
      render();
    }),
  );
  lines.querySelectorAll(".unit-input").forEach((e) =>
    e.addEventListener("change", () => {
      rows[e.dataset.i].unit_of_measure = e.value;
    }),
  );
  lines.querySelectorAll("[data-remove]").forEach(
    (e) =>
      (e.onclick = () => {
        rows.splice(e.dataset.remove, 1);
        render();
      }),
  );
  lines.querySelectorAll(".line-search").forEach(
    (e) =>
      (e.oninput = async () => {
        if (e.value.trim().length > 1)
          menu(await search("/api/items", e.value.trim()), e, (x) => {
            rows[e.dataset.i] = {
              ...x,
              quantity: rows[e.dataset.i].quantity || 1,
            };
            render();
          });
      }),
  );
  updateSummary();
}
function updateSummary() {
  const s = rows.reduce(
      (x, r) => x + (r.quantity || 1) * Number(r.selling_price || 0),
      0,
    ),
    c = additionalCosts.reduce((x, r) => x + r.amount, 0),
    p = rows.reduce(
      (x, r) =>
        x +
        (r.quantity || 1) *
          (Number(r.selling_price || 0) - Number(r.internal_cost || 0)),
      0,
    ),
    v = [...document.querySelectorAll(".quote-summary .summary-row strong")];
  if (v[0]) v[0].textContent = money(s);
  if (v[1]) v[1].textContent = money(c);
  if (v[2]) v[2].textContent = money(p);
  const t = document.querySelector(".summary-total strong");
  if (t) t.textContent = money(s + c);
}
function addLine() {
  rows.push({ quantity: 1, unit_of_measure: "Each" });
  render();
  lines.querySelector(".line-search:last-of-type")?.focus();
}
function buildCustomerQuoteHTML(quote) {
  const esc = value => String(value ?? "").replace(/[&<>"']/g, c => ({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));
  const amount = value => Number(value || 0).toLocaleString("en-GB", {minimumFractionDigits:2, maximumFractionDigits:2});
  const date = new Date(`${quote.date}T12:00:00`);
  const expiry = new Date(date);
  expiry.setDate(expiry.getDate() + Number(quote.validityDays || 30));
  const formatDate = value => Number.isNaN(value.getTime()) ? "" : value.toLocaleDateString("en-GB", {day:"2-digit",month:"short",year:"numeric"});
  const subtotal = quote.rows.reduce((sum,r) => sum + Number(r.quantity ?? 1)*Number(r.selling_price || 0),0);
  const charges = Number(quote.additionalCharges || 0);
  return `<!doctype html><html><head><meta charset="utf-8"><link rel="icon" type="image/png" href="${esc(quote.logoUrl)}"><title>${esc(quote.number)}</title><style>
  @page{size:A4;margin:16mm}
  *{box-sizing:border-box}body{margin:0;background:#eef1f3;color:#333;font:10px Arial,sans-serif;line-height:1.4}
  .actions{max-width:210mm;margin:16px auto;text-align:right}.actions button{border:0;background:#ef1734;color:white;border-radius:5px;padding:10px 18px;cursor:pointer}
  .page{width:210mm;min-height:297mm;margin:0 auto;padding:16mm;background:white;display:flex;flex-direction:column}
  .header{display:flex;align-items:flex-start;justify-content:space-between;min-height:50mm}.logo{width:55mm;height:50mm;object-fit:contain}.company{text-align:right;font-size:8px;line-height:1.35;padding-top:2mm}.company strong{font-size:9px}
  .title{display:flex;align-items:center;gap:6mm;margin:5mm 0 7mm;font-size:17px;font-weight:400}.title:before,.title:after{content:"";height:1px;background:#ddd;flex:1}
  .meta{display:flex;justify-content:space-between;align-items:flex-start;gap:10mm}.bill{width:57%;font-size:8px;line-height:1.5}.bill strong{font-size:9px}.meta table{width:40%;border-collapse:collapse}.meta td{border:1px solid #ddd;padding:5px 7px}.meta td:first-child{background:#eee;width:50%}
  .subject{margin:10mm 0 8mm}.subject p{margin:4px 0 0}
  .items{width:100%;border-collapse:collapse;table-layout:fixed}.items th,.items td{border:1px solid #e3e3e3;padding:7px 8px;vertical-align:top;text-align:right}.items th{font-weight:400;background:#eee}.items th:nth-child(2),.items td:nth-child(2){text-align:left}.items th:first-child,.items td:first-child{text-align:center}.items small{display:block;color:#888;font-size:9px;line-height:1.35;white-space:pre-line;overflow-wrap:anywhere}.items td:nth-child(2){overflow-wrap:anywhere}.items tbody td{padding-top:12px;padding-bottom:18px}.items .num{white-space:nowrap}thead{display:table-header-group}tr{break-inside:avoid}
  .quote-footer{margin-top:auto;padding-top:8mm;break-inside:avoid;flex-shrink:0}.footer-box{border:1px solid #bfc7cc;padding:5mm}.bottom{display:flex;justify-content:space-between;gap:10mm;margin-top:0;break-inside:avoid}.bank{width:48%;line-height:1.5}.totals{width:40%;margin:3mm 0 0 auto;break-inside:avoid;flex-shrink:0}.totals div{display:flex;justify-content:space-between;padding:8px;border-bottom:1px solid #ddd}.totals .grand{font-weight:bold;font-size:11px}
  .terms{width:52%;margin:0;padding-left:5mm;border-left:1px solid #ddd;break-inside:avoid}.terms h3{font-size:10px;font-weight:400;margin:0 0 6px}.terms p{margin:0}
  @media print{body{background:white}.actions{display:none}.page{width:auto;min-height:264mm;margin:0;padding:0}.items th,.items td{padding:5px 7px}.items small{font-size:8px}.header{min-height:50mm}*{-webkit-print-color-adjust:exact;print-color-adjust:exact}}
  </style></head><body><div class="actions"><button onclick="window.print()">Print / Save PDF</button></div><main class="page">
  <header class="header"><img class="logo" src="${esc(quote.logoUrl)}" alt="Terci Communications Limited"><div class="company"><strong>Terci Communications Limited (Z)</strong><br>11401<br>Kitwe West<br>Kitwe Copperbelt 10101<br>Zambia<br>+260972888575<br>info@terci.net</div></header>
  <h1 class="title">QUOTE</h1><section class="meta"><div class="bill">Bill To<br><strong>${esc(quote.customer.name)}</strong>${quote.customer.address ? '<br>'+esc(quote.customer.address).replace(/\r?\n/g,'<br>') : ''}</div><table><tr><td>Quote#</td><td>${esc(quote.number)}</td></tr><tr><td>Quote Date</td><td>${formatDate(date)}</td></tr><tr><td>Expiry Date</td><td>${formatDate(expiry)}</td></tr></table></section>
  <section class="subject">Subject :<p>${esc(quote.subject || quote.rows.map(r=>r.name || r.description).filter(Boolean).join(', '))}</p></section>
  <table class="items"><colgroup><col style="width:5%"><col style="width:58%"><col style="width:11%"><col style="width:11%"><col style="width:15%"></colgroup><thead><tr><th>#</th><th>Item &amp; Description</th><th>Qty</th><th>Rate</th><th>Amount</th></tr></thead><tbody>${quote.rows.map((r,i)=>`<tr><td>${i+1}</td><td>${esc(r.name || r.description || 'Item')}${r.description && r.description !== r.name ? `<small>${esc(r.description)}</small>`:''}</td><td class="num">${amount(r.quantity ?? 1)}<small>${esc(r.unit_of_measure || '')}</small></td><td class="num">${amount(r.selling_price)}</td><td class="num">${amount(Number(r.quantity ?? 1)*Number(r.selling_price || 0))}</td></tr>`).join('')}</tbody></table>
  <div class="totals"><div><span>Sub Total</span><span>${amount(subtotal)}</span></div>${charges ? `<div><span>Additional charges</span><span>${amount(charges)}</span></div>`:''}<div class="grand"><span>Total</span><span>K${amount(subtotal+charges)}</span></div></div>
  <footer class="quote-footer"><div class="footer-box"><section class="bottom"><div class="bank">ABSA Bank ZMW Account:<br>Terci Communications Limited<br>Absa Bank Zambia PLC<br>A/C 1161826<br>Swift Code: BARCZMLX<br>Branch: Kitwe City Square<br>Branch Sort Code: 020209</div>
  <section class="terms"><h3>Terms &amp; Conditions</h3><p>Prices are quoted in Zambian Kwacha (ZMW).<br>Validity: ${esc(quote.validityDays || 30)} days from date of quotation.<br>Delivery and installation timelines to be communicated upon confirmation.</p></section></section></div></footer></main></body></html>`;
}
function previewCustomerCopy() {
  const popup = window.open("", "terci-customer-preview", "width=950,height=800");
  if (!popup) return alert("Please allow pop-ups to preview the customer copy.");
  popup.document.open();
  popup.document.write(buildCustomerQuoteHTML({
    customer: selectedCustomer || {name:document.getElementById("customer-search")?.value || "Customer"},
    number:document.querySelector("#quote-number")?.value || "Quotation",
    date:document.querySelectorAll(".quote-meta input")[2]?.value || new Date().toISOString().slice(0,10),
    validityDays:Number(document.querySelector(".quote-meta select")?.value?.match(/\d+/)?.[0] || 30),
    subject:document.querySelector("#quote-subject")?.value || "",
    rows,
    additionalCharges:additionalCosts.reduce((sum,c)=>sum+Number(c.amount || 0),0),
    logoUrl:new URL("terci-logo.png",location.href).href
  }));
  popup.document.close();
}
function addAdditionalCost() {
  const d = prompt("Additional cost description");
  if (!d) return;
  const a = Number(prompt("Amount (K)") || 0);
  if (a) additionalCosts.push({ description: d, amount: a });
  updateSummary();
}
async function saveQuotation() {
  const i = document.querySelectorAll(".quote-meta input"),
    n = i[1]?.value || "QT-" + Date.now(),
    d = i[2]?.value || new Date().toISOString().slice(0, 10),
    v = Number(
      document.querySelector(".quote-meta select")?.value?.match(/\d+/)?.[0] ||
        30,
    );
  if (rows.some((r) => !r.id))
    return alert("Please select an item for every quotation line.");
  const editingId = new URLSearchParams(location.search).get("id");
  const r = await fetch("/api/quotations", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        id: editingId || undefined,
        quote_number: n,
        customer_id: selectedCustomer?.id || null,
        quote_date: d,
        validity_days: v,
        subject: document.querySelector("#quote-subject")?.value || "",
        lines: rows,
        additional_costs: additionalCosts,
      }),
    }),
    x = await r.json();
  if (!r.ok) return alert(x.error || "Could not save quotation");
  alert(`Quotation saved: ${x.quote_number || n}`);
}
const ci = document.getElementById("customer-search");
if (ci)
  ci.oninput = async () => {
    if (ci.value.trim().length > 1)
      menu(await search("/api/customers", ci.value.trim()), ci, (c) => {
        selectedCustomer = c;
        ci.value = c.name;
        ci.disabled = true;
        ci.parentElement.parentElement.querySelector("small").textContent =
          "Customer selected ✓";
      });
  };
const oldItem = document.querySelector(".item-search"),
  helper = oldItem?.nextElementSibling;
if (oldItem) oldItem.style.display = "none";
if (helper?.classList.contains("helper")) helper.style.display = "none";
const table = lines?.parentElement?.parentElement;
if (table) {
  const b = document.createElement("button");
  b.type = "button";
  b.className = "secondary add-item";
  b.textContent = "＋ Add another item or service";
  b.onclick = addLine;
  // Keep the add-item action below the complete item table, before Additional costs.
  const additionalSection = document.querySelector(".additional-costs");
  if (additionalSection) table.parentElement.insertBefore(b, additionalSection);
  else table.parentElement.appendChild(b);
}
document
  .querySelector(".quote-actions .primary")
  ?.addEventListener("click", saveQuotation);
if (document.querySelector(".quote-meta input[type=date]"))
  document.querySelector(".quote-meta input[type=date]").valueAsDate =
    new Date();
const quoteNumber = document.getElementById("quote-number");
if (quoteNumber && !quoteNumber.value) {
  const now = new Date();
  const yy = String(now.getFullYear()).slice(-2);
  const mm = String(now.getMonth() + 1).padStart(2, "0");
  const dd = String(now.getDate()).padStart(2, "0");
  quoteNumber.value = `QT-${yy}${mm}${dd}001`;
}
render();
const quoteId = new URLSearchParams(location.search).get("id");
if (quoteId && lines) {
  fetch(`/api/quotations?id=${encodeURIComponent(quoteId)}`)
    .then((r) => (r.ok ? r.json() : null))
    .then((q) => {
      if (!q) return;
      const meta = document.querySelectorAll(".quote-meta input");
      if (meta[1]) meta[1].value = q.quote_number || "";
      if (meta[2]) meta[2].value = q.quote_date || "";
      const validity = document.querySelector(".quote-meta select");
      if (validity) validity.value = `${q.validity_days || 30} days`;
      if (q.customer_id) {
        selectedCustomer = { id: q.customer_id, name: q.customer_name || "", address: q.customer_address || "" };
        if (ci) {
          ci.value = q.customer_name || "";
          ci.disabled = true;
        }
      }
      rows = (q.lines || []).map((l) => ({
        ...l,
        id: l.item_id,
        name: l.name || l.description,
        description: l.item_description || l.description,
        quantity: l.quantity,
      }));
      additionalCosts = q.additional_cost_lines || [];
      const subject = document.querySelector("#quote-subject");
      if (subject) subject.value = q.subject || "";
      render();
    });
}
const recent = document.querySelector(".recent-quotes tbody");
if (recent)
  fetch("/api/quotations")
    .then((r) => r.json())
    .then((a) => {
      if (a.length)
        recent.innerHTML = a
          .map(
            (q) =>
              `<tr><td>${q.quote_number}</td><td>${q.customer_name || "—"}</td><td>${q.quote_date}</td><td>${q.status}</td><td>${money(q.total)}</td></tr>`,
          )
          .join("");
    })
    .catch(() => {});
