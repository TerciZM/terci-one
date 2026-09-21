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
            `<tr><td>${r.id ? `<b>${r.name}</b>${r.description ? `<small class="line-description">${r.description}</small>` : ""}` : `<input class="line-search" data-i="${i}" placeholder="Search item or description">`}</td><td><input class="qty" data-i="${i}" type="number" min="1" value="${r.quantity || 1}"></td><td><select class="unit-input" data-i="${i}"><option ${r.unit_of_measure === "Each" ? "selected" : ""}>Each</option><option ${r.unit_of_measure === "Metre" ? "selected" : ""}>Metre</option><option ${r.unit_of_measure === "Roll" ? "selected" : ""}>Roll</option><option ${r.unit_of_measure === "Day" ? "selected" : ""}>Day</option><option ${r.unit_of_measure === "Month" ? "selected" : ""}>Month</option><option ${r.unit_of_measure === "Job" ? "selected" : ""}>Job</option><option ${r.unit_of_measure === "Set" ? "selected" : ""}>Set</option></select></td><td><input class="price-input" data-field="selling_price" data-i="${i}" type="number" min="0" step="0.01" value="${Number(r.selling_price || 0)}"></td><td class="cost"><input class="price-input" data-field="internal_cost" data-i="${i}" type="number" min="0" step="0.01" value="${Number(r.internal_cost || 0)}"></td><td class="profit">${money((r.selling_price - r.internal_cost) * (r.quantity || 1))}</td><td><button type="button" data-remove="${i}">×</button></td></tr>`,
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
function previewCustomerCopy() {
  const customer =
    selectedCustomer?.name ||
    document.getElementById("customer-search")?.value ||
    "Customer";
  const number = document.querySelector("#quote-number")?.value || "Quotation";
  const date = document.querySelectorAll(".quote-meta input")[2]?.value || "";
  const validity =
    document.querySelector(".quote-meta select")?.value || "30 days";
  const total =
    rows.reduce(
      (s, r) => s + Number(r.quantity || 1) * Number(r.selling_price || 0),
      0,
    ) + additionalCosts.reduce((s, c) => s + Number(c.amount || 0), 0);
  const popup = window.open(
    "",
    "terci-customer-preview",
    "width=900,height=700",
  );
  if (!popup)
    return alert("Please allow pop-ups to preview the customer copy.");
  popup.document.write(`<html><head><title>${number}</title><style>
  @page{size:A4;margin:16mm}body{font:13px Arial,sans-serif;color:#3c4144;margin:0;padding:30px;background:#fff} .page{max-width:860px;min-height:1120px;margin:auto;display:flex;flex-direction:column}.header{display:grid;grid-template-columns:1fr 1fr;align-items:start;min-height:250px;padding-bottom:18px}.brand{color:#e51e35;font-size:24px;font-weight:700;letter-spacing:2px;padding-top:12px;line-height:1.05}.logo{width:100%;height:250px;display:flex;align-items:flex-start;justify-content:flex-start}.logo img{width:230px;height:230px;object-fit:contain;object-position:center top}.company{text-align:right;line-height:1.45}.company strong{font-size:16px}.title{display:flex;align-items:center;gap:20px;margin:8px 0 28px;color:#444}.title:before,.title:after{content:"";height:1px;background:#ddd;flex:1}.title b{font-size:23px;font-weight:400}.meta{display:grid;grid-template-columns:1fr 1fr;gap:35px;margin-bottom:26px}.bill{line-height:1.55}.bill{line-height:1.55}.bill strong{font-size:15px}.meta table{width:100%;border-collapse:collapse}.meta td{padding:9px;border:1px solid #ddd}.meta td:first-child{background:#f0f0f0;width:48%}.subject{margin:22px 0 38px}.items{width:100%;border-collapse:collapse}.items th{background:#efefef;color:#3c4144;font-weight:400}.items th,.items td{padding:10px;border:1px solid #ddd}.items tbody tr:nth-child(even){background:#f3f3f3}.items th:first-child,.items td:first-child{width:42px;text-align:center}.items th:nth-child(2),.items td:nth-child(2){text-align:left}.items th:not(:nth-child(2)),.items td:not(:nth-child(2)){text-align:right}.items small{display:block;color:#999;margin-top:5px}.bottom{display:grid;grid-template-columns:1fr 1fr;gap:40px;margin-top:28px}.bank{line-height:1.45}.totals{justify-self:end;width:100%}.totals div{display:flex;justify-content:space-between;padding:9px 0;border-bottom:1px solid #ddd;font-weight:700}.totals .grand{font-size:17px;font-weight:bold}.terms{margin-top:35px;line-height:1.5}.footer{border-top:1px solid #ddd;margin-top:auto;padding-top:12px;color:#667080;font-size:11px;text-align:center;line-height:1.4}</style></head><body><div class="page"><header class="header"><div class="logo" style="justify-content:flex-start"><img src="terci-logo.png" alt="Terci Communications Limited logo"></div><div class="company"><strong>Terci Communications Limited (Z)</strong><br>Company ID: 120210015865<br>Tax ID: 2807222406<br>11401 Kitwe West<br>Kitwe Copperbelt 10101<br>Zambia<br>+260 972 888 575<br>terci.ltd@gmail.com</div></header><div class="title"><b>QUOTE</b></div><section class="meta"><div class="bill">Bill To<br><strong>${customer}</strong><br>Kitwe<br>Copperbelt<br>Zambia</div><table><tr><td>Quote#</td><td>${number}</td></tr><tr><td>Quote Date</td><td>${date}</td></tr><tr><td>Expiry Date</td><td>${date}</td></tr></table></section><div class="subject"><b>Subject:</b><br><br>Quotation for Terci Communications services</div><table class="items"><thead><tr><th>#</th><th>Item &amp; Description</th><th>Qty</th><th>Rate</th><th>Amount</th></tr></thead><tbody>${rows.map((r, i) => `<tr><td>${i + 1}</td><td>${r.name || r.description || "Item"}<small>${r.description || ""}</small></td><td>${Number(r.quantity || 1).toFixed(2)}<small>${r.unit_of_measure || "Each"}</small></td><td>${money(r.selling_price)}</td><td>${money((r.quantity || 1) * Number(r.selling_price || 0))}</td></tr>`).join("")}</tbody></table><section class="bottom"><div class="bank"><b>Payment Details</b><br>Terci Communications Limited<br>Payment details will be provided on request.</div><div class="totals"><div><span>Subtotal</span><span>K${Number(total || 0).toLocaleString("en-ZM", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span></div><div class="grand"><span>Total</span><span>K${Number(total || 0).toLocaleString("en-ZM", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span></div></div></section><section class="terms"><h3>Terms &amp; Conditions</h3>Prices are quoted in Zambian Kwacha (ZMW).<br>Validity: ${validity} from date of quotation.<br>Delivery and installation timelines will be communicated upon confirmation.</section><div class="footer">Terci Communications Limited · Integrated Security &amp; Connectivity Solutions</div></div></body></html>`);
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
  const r = await fetch("/api/quotations", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        quote_number: n,
        customer_id: selectedCustomer?.id || null,
        quote_date: d,
        validity_days: v,
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
        selectedCustomer = { id: q.customer_id, name: q.customer_name || "" };
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
