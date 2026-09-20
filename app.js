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
            `<tr><td>${r.id ? `<b>${r.name}</b>${r.description ? `<small class="line-description">${r.description}</small>` : ""}` : `<input class="line-search" data-i="${i}" placeholder="Search item or description">`}</td><td><input class="qty" data-i="${i}" type="number" min="1" value="${r.quantity || 1}"></td><td><input class="price-input" data-field="selling_price" data-i="${i}" type="number" min="0" step="0.01" value="${Number(r.selling_price || 0)}"></td><td class="cost"><input class="price-input" data-field="internal_cost" data-i="${i}" type="number" min="0" step="0.01" value="${Number(r.internal_cost || 0)}"></td><td class="profit">${money((r.selling_price - r.internal_cost) * (r.quantity || 1))}</td><td><button type="button" data-remove="${i}">×</button></td></tr>`,
        )
        .join("")
    : '<tr><td colspan="6" class="empty">No items added yet. Click “Add another item or service”.</td></tr>';
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
  rows.push({ quantity: 1 });
  render();
  lines.querySelector(".line-search:last-of-type")?.focus();
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
render();
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
