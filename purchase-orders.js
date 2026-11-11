const view = document.querySelector("#purchase-view");
const status = document.querySelector("#purchase-message");
const title = document.querySelector("#purchase-title");
const query = new URLSearchParams(location.search);
const id = Number(query.get("id"));
const endpoint = "/api/purchase-orders";
const esc = value => String(value ?? "").replace(/[&<>"']/g, character => ({
  "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;"
})[character]);
const money = cents => new Intl.NumberFormat("en-ZM", { style: "currency", currency: "ZMW" }).format(cents / 100);
const heading = names => names.map(name => `<th scope="col">${name}</th>`).join("");
const table = (names, rows, empty) => `<div class="table-wrap"><table class="customer-table">
  <thead><tr>${heading(names)}</tr></thead><tbody>${rows || `<tr><td colspan="${names.length}">${empty}</td></tr>`}</tbody>
  </table></div>`;
const qtyInput = (value = "", max = 1_000_000, min = 0.001) =>
  `<input name="quantity" aria-label="Quantity" type="number" min="${min}" max="${max}" step="0.001" value="${value}"${min > 0 ? " required" : ""}>`;

async function request(path, body) {
  const response = await fetch(path, body && {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body)
  });
  const data = await response.json();
  if (!response.ok) throw Error(data.error || "Request failed.");
  return data;
}

function message(text = "", error = false) {
  status.textContent = text;
  status.classList.toggle("error", error);
}

async function submit(button, work) {
  if (button.disabled) return;
  button.disabled = true;
  message();
  try { await work(); }
  catch (error) { message(error.message, true); }
  finally { button.disabled = false; }
}

async function listOrders() {
  const records = await request(endpoint);
  view.innerHTML = `<section class="panel"><div class="purchase-fields">
    <label>Search orders <input id="purchase-search" type="search" placeholder="Order, vendor or reference"></label>
    <label>Status <select id="purchase-filter"><option value="">All statuses</option>
      ${["Draft", "Ordered", "Part Received", "Received", "Cancelled"].map(value => `<option>${value}</option>`).join("")}
    </select></label></div><div id="purchase-results"></div></section>`;
  const search = view.querySelector("#purchase-search");
  const filter = view.querySelector("#purchase-filter");
  function render() {
    const term = search.value.trim().toLowerCase();
    const rows = records.filter(order => (!filter.value || order.status === filter.value) &&
      [order.number, order.vendor_name, order.reference].some(value => (value || "").toLowerCase().includes(term)));
    view.querySelector("#purchase-results").innerHTML = table(
      ["Order", "Vendor", "Purpose", "Expected", "Status", "Total", "Paid"],
      rows.map(order => `<tr><td><a href="?id=${order.id}">${esc(order.number)}</a></td>
        <td>${esc(order.vendor_name)}</td><td>${esc(order.reference || order.purpose)}</td>
        <td>${esc(order.expected_date || "—")}</td><td>${esc(order.status)}</td>
        <td>${money(order.total_cents)}</td><td>${money(order.paid_cents)}</td></tr>`).join(""),
      "No purchase orders found."
    );
  }
  search.addEventListener("input", render);
  filter.addEventListener("change", render);
  render();
}

async function newOrder() {
  title.textContent = "New Purchase Order";
  const [vendors, items] = await Promise.all([request("/api/vendors?status=Active"), request("/api/items")]);
  if (!vendors.length || !items.some(item => item.item_type !== "Service" && item.status !== "Inactive")) {
    view.innerHTML = '<p>Add an <a href="new-vendor.html">active vendor</a> and an <a href="new-item.html">active goods item</a> first.</p>';
    return;
  }
  const goods = items.filter(item => item.item_type !== "Service" && item.status !== "Inactive");
  const options = goods.map(item => `<option value="${item.id}">${esc([item.name, item.sku].filter(Boolean).join(" · "))}</option>`).join("");
  const byId = new Map(goods.map(item => [String(item.id), item]));
  view.innerHTML = `<form class="panel" id="purchase-create"><div class="form-grid">
    <label>Vendor <select name="vendor_id" required><option value="">Choose a vendor</option>
      ${vendors.map(vendor => `<option value="${vendor.id}">${esc(vendor.display_name)}</option>`).join("")}</select></label>
    <label>Purpose <select name="purpose"><option value="Stock">Shop stock</option><option value="Job">Customer job</option></select></label>
    <label>Job or customer reference <input name="reference" maxlength="160"></label>
    <label>Expected delivery <input name="expected_date" type="date"></label>
    <label>Vendor quote reference <input name="vendor_quote" maxlength="160"></label>
    <label>Delivery charge (ZMW) <input name="delivery" type="number" min="0" max="1000000" step="0.01" value="0"></label>
    </div>
    <div class="table-wrap"><table class="customer-table"><thead><tr>
      ${heading(["Item", "Quantity", "Unit price incl. applicable VAT (ZMW)", ""])}
    </tr></thead><tbody id="purchase-lines"></tbody></table></div>
    <div class="purchase-actions"><button type="button" id="purchase-add">＋ Add Item</button>
      <button class="primary" type="submit">Save Draft</button></div>
    </form>`;
  const form = view.querySelector("form");
  const lines = view.querySelector("#purchase-lines");
  const addButton = view.querySelector("#purchase-add");
  const key = crypto.randomUUID();
  function addLine() {
    lines.insertAdjacentHTML("beforeend", `<tr><td><select name="item_id" aria-label="Item" required><option value="">Choose an item</option>
      ${options}</select></td><td>${qtyInput(1)}</td>
      <td><input name="unit_price" aria-label="Unit price in ZMW" type="number" min="0" max="1000000" step="0.01" required></td>
      <td><button type="button" aria-label="Remove item">Remove</button></td></tr>`);
    const row = lines.lastElementChild;
    row.querySelector("select").addEventListener("change", event => {
      const item = byId.get(event.target.value);
      row.querySelector('[name="unit_price"]').value = item ? Number(item.internal_cost || 0).toFixed(2) : "";
    });
    row.querySelector("button").addEventListener("click", () => {
      row.remove();
      if (!lines.rows.length) addLine();
      addButton.disabled = lines.rows.length >= 40;
    });
    addButton.disabled = lines.rows.length >= 40;
  }
  addButton.addEventListener("click", addLine);
  form.elements.purpose.addEventListener("change", () => {
    form.elements.reference.required = form.elements.purpose.value === "Job";
  });
  form.addEventListener("submit", event => {
    event.preventDefault();
    submit(event.submitter, async () => {
      const fields = form.elements;
      const result = await request(endpoint, {
        action: "create", request_key: key, vendor_id: Number(fields.vendor_id.value),
        purpose: fields.purpose.value, reference: fields.reference.value, expected_date: fields.expected_date.value,
        vendor_quote: fields.vendor_quote.value, delivery: Number(fields.delivery.value),
        lines: Array.from(lines.rows, row => ({
          item_id: Number(row.querySelector('[name="item_id"]').value),
          quantity: Number(row.querySelector('[name="quantity"]').value),
          unit_price: Number(row.querySelector('[name="unit_price"]').value)
        }))
      });
      location.href = `?id=${result.id}`;
    });
  });
  addLine();
}

function entryForm(action, lineId, max) {
  const label = action === "receive" ? "Receive" : "Issue to Job";
  return `<form class="purchase-entry" data-action="${action}" data-line="${lineId}">
    ${qtyInput("", max)}<input name="reference" maxlength="160" aria-label="Delivery or job reference" placeholder="Reference (optional)">
    <button type="submit">${label}</button></form>`;
}

async function showOrder() {
  const order = await request(`${endpoint}?id=${id}`);
  title.textContent = order.number;
  const job = order.purpose === "Job";
  const approved = order.state === "Ordered";
  const remaining = order.total_cents - order.paid_cents;
  view.innerHTML = `<section class="panel">
    <div class="purchase-print-brand"><h1>Terci Communications Limited</h1><h2>Purchase Order ${esc(order.number)}</h2></div>
    <div class="purchase-actions purchase-internal">
      <span class="customer-status">${esc(order.status)}</span>
      ${order.state === "Draft" ? '<button class="primary" type="button" data-state="approve">Approve &amp; Mark Ordered</button>' : ""}
      ${["Draft", "Ordered"].includes(order.status) && !order.paid_cents ? '<button type="button" data-state="cancel">Cancel Order</button>' : ""}
      ${approved ? '<button type="button" id="purchase-print">Print / Save PDF</button>' : ""}
    </div>
    <dl class="purchase-meta"><div><dt>Vendor</dt><dd>${esc(order.vendor_name)}</dd></div>
      <div><dt>Order date</dt><dd>${esc(order.created_at.slice(0, 10))}</dd></div>
      <div><dt>Expected delivery</dt><dd>${esc(order.expected_date || "—")}</dd></div>
      <div><dt>Vendor quote</dt><dd>${esc(order.vendor_quote || "—")}</dd></div>
      <div class="purchase-internal"><dt>Purpose / reference</dt><dd>${esc(order.reference || order.purpose)}</dd></div></dl>
    <div class="table-wrap"><table class="customer-table"><thead><tr>
      ${heading(["Item", "Unit", "Qty", "Rate", "Line Total"])}
      <th class="purchase-internal">Received</th>${job ? '<th class="purchase-internal">Issued</th>' : ""}
      <th class="purchase-internal">Actions</th></tr></thead>
      <tbody>${order.lines.map(line => {
        const outstanding = Number((line.quantity - line.received).toFixed(3));
        const reserved = Number((line.received - line.issued).toFixed(3));
        return `<tr><td>${esc(line.description)}</td><td>${esc(line.unit)}</td><td>${line.quantity}</td>
          <td>${money(line.unit_cents)}</td><td>${money(line.line_cents)}</td>
          <td class="purchase-internal">${line.received}</td>${job ? `<td class="purchase-internal">${line.issued}</td>` : ""}
          <td class="purchase-internal">${approved && outstanding > 0 ? entryForm("receive", line.id, outstanding) : ""}
          ${approved && job && reserved > 0 ? entryForm("issue", line.id, reserved) : ""}</td></tr>`;
      }).join("")}</tbody></table></div>
    <div class="purchase-totals"><p>Delivery ${money(order.delivery_cents)}</p><p><strong>Order total ${money(order.total_cents)}</strong></p></div>
    </section>
    <section class="panel purchase-internal"><h2>Receipts &amp; Job Issues</h2>
    ${table(["Date", "Action", "Item", "Quantity", "Reference"], order.stock.map(entry => `<tr><td>${esc(entry.created_at)}</td>
      <td>${esc(entry.kind)}</td><td>${esc(order.lines.find(line => line.id === entry.line_id)?.description)}</td>
      <td>${entry.quantity}</td><td>${esc(entry.reference || "—")}</td></tr>`).join(""), "No stock movements recorded.")}</section>
    <section class="panel purchase-internal"><h2>Supplier Payments</h2>
    <p>Paid ${money(order.paid_cents)} · Balance ${money(remaining)}</p>
    ${approved && remaining > 0 ? `<form class="purchase-entry" data-action="payment">
      <input name="amount" type="number" min="0.01" max="${(remaining / 100).toFixed(2)}" step="0.01" required aria-label="Payment amount in ZMW" placeholder="ZMW">
      <input name="reference" required maxlength="160" aria-label="Payment reference" placeholder="Payment reference">
      <button type="submit">Record Payment</button></form>` : ""}
    ${table(["Date", "Reference", "Amount"], order.payments.map(payment => `<tr><td>${esc(payment.created_at)}</td>
      <td>${esc(payment.reference)}</td><td>${money(payment.cents)}</td></tr>`).join(""), "No payments recorded.")}</section>`;
  view.querySelector("#purchase-print")?.addEventListener("click", () => window.print());
  for (const button of view.querySelectorAll("[data-state]")) {
    button.addEventListener("click", () => {
      if (button.dataset.state === "cancel" && !confirm(`Cancel ${order.number}?`)) return;
      submit(button, async () => {
        await request(endpoint, { action: button.dataset.state, id });
        await showOrder();
        message("Order updated.");
      });
    });
  }
  for (const form of view.querySelectorAll("[data-action]")) {
    const key = crypto.randomUUID();
    form.addEventListener("submit", event => {
      event.preventDefault();
      submit(event.submitter, async () => {
        const values = form.elements;
        await request(endpoint, {
          action: form.dataset.action, id, request_key: key, line_id: Number(form.dataset.line),
          reference: values.reference.value, quantity: Number(values.quantity?.value), amount: Number(values.amount?.value)
        });
        await showOrder();
        message("Entry recorded.");
      });
    });
  }
}

async function showQuotes() {
  title.textContent = "Supplier Quotes";
  const [vendors, items, quotes] = await Promise.all([
    request("/api/vendors?status=Active"), request(`${endpoint}?view=stock`), request(`${endpoint}?view=quotes`)
  ]);
  view.innerHTML = `<form class="panel" id="purchase-quote"><div class="form-grid">
    <label>Vendor <select name="vendor" required><option value="">Choose a vendor</option>
      ${vendors.map(vendor => `<option value="${vendor.id}">${esc(vendor.display_name)}</option>`).join("")}</select></label>
    <label>Item <select name="item" required><option value="">Choose an item</option>
      ${items.map(item => `<option value="${item.id}">${esc([item.name, item.sku].filter(Boolean).join(" · "))}</option>`).join("")}</select></label>
    <label>Quote date <input type="date" name="quoted_on" required></label>
    <label>Unit price incl. applicable VAT (ZMW) <input type="number" name="unit_price" min="0" max="1000000" step="0.01" required></label>
    <label>Lead time (days) <input type="number" name="lead_days" min="0" max="365" step="1"></label>
    <label>Vendor quote reference <input name="reference" maxlength="160"></label>
    <label>Delivery and return terms <input name="terms" maxlength="300"></label>
    </div><button class="primary" type="submit">Save Supplier Quote</button>
    </form><section class="panel">
    <div class="purchase-fields"><label>Compare prices by item or vendor <input id="quote-search" type="search"></label></div>
    <div id="quote-results"></div></section>`;
  const search = view.querySelector("#quote-search");
  const form = view.querySelector("#purchase-quote");
  form.elements.quoted_on.value = new Intl.DateTimeFormat("en-CA", { timeZone: "Africa/Lusaka" }).format(new Date());
  const key = crypto.randomUUID();
  function render() {
    const term = search.value.trim().toLowerCase();
    view.querySelector("#quote-results").innerHTML = table(
      ["Item", "Vendor", "Quoted", "Unit Price", "Lead Days", "Reference", "Terms"],
      quotes.filter(quote => [quote.item_name, quote.vendor_name].some(value => value.toLowerCase().includes(term)))
        .map(quote => `<tr><td>${esc(quote.item_name)}</td><td>${esc(quote.vendor_name)}</td>
          <td>${esc(quote.quoted_on)}</td><td>${money(quote.unit_cents)}</td><td>${quote.lead_days ?? "—"}</td>
          <td>${esc(quote.reference || "—")}</td><td>${esc(quote.terms || "—")}</td></tr>`).join(""),
      "No supplier quotes found."
    );
  }
  search.addEventListener("input", render);
  form.addEventListener("submit", event => {
    event.preventDefault();
    submit(event.submitter, async () => {
      const fields = form.elements;
      await request(endpoint, { action: "quote", request_key: key, vendor_id: Number(fields.vendor.value),
        item_id: Number(fields.item.value), quoted_on: fields.quoted_on.value, unit_price: Number(fields.unit_price.value),
        lead_days: fields.lead_days.value === "" ? null : Number(fields.lead_days.value),
        reference: fields.reference.value, terms: fields.terms.value });
      await showQuotes();
      message("Supplier quote saved.");
    });
  });
  render();
}

async function showStock() {
  title.textContent = "Stock & Reordering";
  view.innerHTML = `<section class="panel"><div class="purchase-fields">
    <label>Search stock <input id="stock-search" type="search" placeholder="Item or SKU"></label>
    <label><span>Reorder list</span><span><input id="stock-reorder" type="checkbox"> Show items due to reorder</span></label>
    </div><div id="stock-results"></div></section>`;
  const search = view.querySelector("#stock-search");
  const filter = view.querySelector("#stock-reorder");
  const results = view.querySelector("#stock-results");
  let items = await request(`${endpoint}?view=stock`);
  function render() {
    const term = search.value.trim().toLowerCase();
    results.innerHTML = table(["Item", "On Hand", "Reserved", "Available", "On Order", "Preferred Vendor", "Reorder Level", "Sales"],
      items.filter(item => (!filter.checked || item.reorder) &&
        [item.name, item.sku].some(value => (value || "").toLowerCase().includes(term)))
      .map(item => `<tr><td><a href="new-item.html?id=${item.id}">${esc(item.name)}</a>${item.sku ? `<br><small>${esc(item.sku)}</small>` : ""}</td>
      <td>${item.quantity} ${esc(item.unit)}</td><td>${item.reserved}</td><td>${item.available}</td><td>${item.on_order}</td>
      <td>${esc(item.preferred_supplier || "—")}</td>
      <td><form class="purchase-entry" data-item="${item.id}">${qtyInput(item.reorder_level ?? "", 1_000_000, 0)}
      <button type="submit">Save</button>${item.reorder ? '<span class="customer-status">Reorder</span>' : ""}</form></td><td><a href="?view=sales-history&amp;item=${item.id}">History</a></td></tr>`).join(""),
      "No matching stock items."
    );
  }
  search.addEventListener("input", render);
  filter.addEventListener("change", render);
  results.addEventListener("submit", event => {
    event.preventDefault();
    const form = event.target;
    submit(event.submitter, async () => {
      const value = form.elements.quantity.value;
      await request(endpoint, { action: "reorder", id: Number(form.dataset.item), quantity: value === "" ? null : Number(value) });
      items = await request(`${endpoint}?view=stock`);
      render();
      message("Reorder level saved.");
    });
  });
  render();
}

async function showSalesHistory() {
  const itemId = Number(query.get("item"));
  if (!Number.isSafeInteger(itemId) || itemId <= 0) throw new Error("Select an item first.");
  const [item, history] = await Promise.all([
    request(`/api/items?id=${itemId}`), request(`/api/invoice-stock?item=${itemId}`)
  ]);
  title.textContent = `Sales stock history · ${item.name}`;
  view.innerHTML = `<section class="panel">${table(["Date", "Invoice", "Movement", "Quantity", "Reference"],
    history.map(entry => `<tr><td>${esc(entry.created_at)}</td>
      <td><a href="new-invoice.html?id=${entry.invoice_id}#invoice-stock">${esc(entry.invoice_number)}</a></td>
      <td>${entry.prior_issue_id ? "Linked job issue" : esc(entry.kind)}</td>
      <td>${entry.quantity}</td><td>${esc(entry.reference || "—")}</td></tr>`).join(""),
    "No sales stock movements for this item.")}</section>`;
}

try {
  if (id) await showOrder();
  else if (query.has("new")) await newOrder();
  else if (query.get("view") === "stock") await showStock();
  else if (query.get("view") === "sales-history") await showSalesHistory();
  else if (query.get("view") === "quotes") await showQuotes();
  else await listOrders();
  message();
} catch (error) {
  message(error.message, true);
}
