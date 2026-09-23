(() => {
  const $ = (id) => document.getElementById(id);
  const money = (n) => "K" + Number(n || 0).toLocaleString("en-ZM", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  const esc = (v) => String(v ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  let customer = null, invoices = [];
  async function get(url) { const r = await fetch(url), data = await r.json(); if (!r.ok) throw new Error(data.error || "Could not load data"); return data; }
  async function updateReceiptNumber() { const date = $("receipt-date").value; if (!date) return; try { const data = await get(`/api/sales-receipts?date=${encodeURIComponent(date)}`); $("receipt-number").value = data.receipt_number; } catch (_) { $("receipt-number").value = "Generated when saved"; } }
  function paintInvoices() {
    const select = $("receipt-invoice");
    select.innerHTML = '<option value="">Direct / unallocated receipt</option>' + invoices.filter((i) => Number(i.balance_due ?? (Number(i.total || 0) - Number(i.amount_paid || 0))) > 0.005).map((i) => `<option value="${i.id}">${esc(i.invoice_number)} · ${esc(i.invoice_date)} · balance ${money(i.balance_due ?? (i.total - (i.amount_paid || 0)))}</option>`).join("");
  }
  function searchMenu(results, input, choose) {
    document.querySelector(".receipt-suggestions")?.remove();
    if (!results.length) return;
    const menu = document.createElement("div"); menu.className = "receipt-suggestions";
    results.forEach((record) => { const button = document.createElement("button"); button.type = "button"; button.innerHTML = `<strong>${esc(record.name)}</strong>${record.company_name ? `<small>${esc(record.company_name)}</small>` : ""}`; button.onclick = () => { choose(record); menu.remove(); }; menu.appendChild(button); });
    input.parentElement.appendChild(menu);
  }
  $("receipt-customer").oninput = async (event) => {
    customer = null; invoices = []; paintInvoices(); $("receipt-customer-help").textContent = "Start typing to search customers"; $("receipt-invoice-help").textContent = "Choose an invoice to apply this payment to its balance.";
    const term = event.target.value.trim(); if (term.length < 1) return;
    try { const results = await get(`/api/customers?q=${encodeURIComponent(term)}`); searchMenu(results, event.target, (record) => { customer = record; event.target.value = record.name; $("receipt-customer-help").textContent = "Customer selected ✓"; get("/api/invoices").then((all) => { invoices = all.filter((invoice) => Number(invoice.customer_id) === Number(record.id)); paintInvoices(); }).catch((error) => { $("receipt-invoice-help").textContent = error.message; }); }); } catch (error) { alert(error.message); }
  };
  $("receipt-invoice").onchange = () => {
    const invoice = invoices.find((item) => String(item.id) === $("receipt-invoice").value);
    if (!invoice) { $("receipt-amount").value = ""; $("receipt-amount").readOnly = false; $("receipt-amount-help").textContent = "Enter the amount received."; return; }
    const balance = Number(invoice.balance_due ?? (Number(invoice.total || 0) - Number(invoice.amount_paid || 0)));
    $("receipt-amount").value = balance.toFixed(2); $("receipt-amount").readOnly = false; $("receipt-amount-help").textContent = `Outstanding balance: ${money(balance)}. Enter a smaller amount for a partial payment.`;
  };
  $("receipt-date").onchange = updateReceiptNumber;
  $("receipt-form").onsubmit = async (event) => {
    event.preventDefault();
    if (!customer) return alert("Select a customer first.");
    const submit = $("receipt-save"); submit.disabled = true; submit.textContent = "Saving…";
    try {
      const response = await fetch("/api/sales-receipts", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ customer_id: customer.id, invoice_id: $("receipt-invoice").value || null, receipt_date: $("receipt-date").value, payment_method: $("receipt-method").value, payment_reference: $("receipt-reference").value.trim(), amount: Number($("receipt-amount").value), notes: $("receipt-notes").value.trim() }) });
      const data = await response.json(); if (!response.ok) throw new Error(data.error || "Could not save receipt"); location.href = `receipt-view.html?id=${encodeURIComponent(data.id)}`;
    } catch (error) { alert(error.message); submit.disabled = false; submit.textContent = "Save receipt"; }
  };
  const today = new Date(); today.setMinutes(today.getMinutes() - today.getTimezoneOffset()); $("receipt-date").value = today.toISOString().slice(0, 10); updateReceiptNumber();
})();
