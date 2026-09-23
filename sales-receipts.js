(() => {
  const $ = (id) => document.getElementById(id);
  const body = $("receipts-list"), search = $("receipt-search"), methodFilter = $("receipt-method-filter");
  const money = (n) => "K" + Number(n || 0).toLocaleString("en-ZM", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  const esc = (v) => String(v ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  const date = (v) => v ? new Date(`${v}T12:00:00`).toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" }) : "—";
  let receipts = [];
  function draw() {
    const q = search.value.trim().toLowerCase(), method = methodFilter.value;
    const visible = receipts.filter((r) => (!method || r.payment_method === method) && [r.receipt_number, r.customer_name, r.invoice_number, r.payment_reference, r.payment_method, r.status].some((v) => String(v || "").toLowerCase().includes(q)));
    body.innerHTML = visible.length ? visible.map((r) => `<tr><td><a class="invoice-number-link" href="receipt-view.html?id=${encodeURIComponent(r.id)}">${esc(r.receipt_number)}</a></td><td>${date(r.receipt_date)}</td><td>${esc(r.customer_name || "—")}</td><td>${esc(r.invoice_number || "—")}</td><td>${esc(r.payment_method)}</td><td>${esc(r.payment_reference || "—")}</td><td>${money(r.amount)}</td><td><span class="customer-status">${esc(r.status)}</span></td><td><a class="secondary button-link" href="receipt-view.html?id=${encodeURIComponent(r.id)}">View / Print</a></td></tr>`).join("") : '<tr><td colspan="9" class="empty">No sales receipts found.</td></tr>';
    $("receipt-count").textContent = `${visible.length} receipt${visible.length === 1 ? "" : "s"}`;
    $("receipt-total").textContent = `Total: ${money(visible.reduce((sum, r) => sum + Number(r.amount || 0), 0))}`;
  }
  search.oninput = draw; methodFilter.onchange = draw;
  fetch("/api/sales-receipts").then((r) => r.ok ? r.json() : Promise.reject(new Error("Could not load sales receipts"))).then((data) => { receipts = Array.isArray(data) ? data : []; draw(); }).catch((error) => { body.innerHTML = `<tr><td colspan="9" class="empty">${error.message}</td></tr>`; $("receipt-count").textContent = "Unable to load receipts"; });
})();
