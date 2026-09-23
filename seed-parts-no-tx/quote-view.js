(() => {
  const params = new URLSearchParams(location.search), id = params.get("id");
  const $ = (id) => document.getElementById(id);
  const preview = $("quote-preview"), loading = $("quote-loading");
  const money = (n) => "K" + Number(n || 0).toLocaleString("en-ZM", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  const date = (v) => v ? new Date(`${v}T12:00:00`).toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" }) : "—";
  let quote;
  function render() {
    document.title = `${quote.quote_number || "Quote"} · Terci One`;
    $("quote-heading").textContent = quote.quote_number || "Quote";
    $("quote-edit").href = `new-quotation.html?id=${encodeURIComponent(quote.id)}`;
    $("quote-invoice").href = `new-invoice.html?quote_id=${encodeURIComponent(quote.id)}`;
    $("quote-status-ribbon").textContent = quote.status || "Draft";
    const customer = quote.customer_name || "Customer";
    $("quote-summary-meta").innerHTML = `<div><span>Customer</span><strong>${escapeHtml(customer)}</strong></div><div><span>Quote date</span><strong>${date(quote.quote_date)}</strong></div><div><span>Expiry</span><strong>${expiryDate(quote.quote_date, quote.validity_days)}</strong></div><div><span>Total</span><strong>${money(quote.total)}</strong></div>`;
    const rows = (quote.lines || []).map((line) => ({ ...line, id: line.item_id, name: line.name || line.description, description: line.item_description || line.description }));
    const html = window.buildCustomerQuoteHTML({ customer: { name: customer, address: quote.customer_address || "" }, number: quote.quote_number, date: quote.quote_date, validityDays: quote.validity_days || 30, subject: quote.subject || "", rows, additionalCharges: quote.additional_cost_lines?.reduce((s, x) => s + Number(x.amount || 0), 0) || 0, logoUrl: new URL("terci-logo.png", location.href).href });
    preview.srcdoc = html; loading.hidden = true;
  }
  function expiryDate(value, days) { const d = new Date(`${value}T12:00:00`); d.setDate(d.getDate() + Number(days || 30)); return Number.isNaN(d.getTime()) ? "—" : d.toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" }); }
  function escapeHtml(value) { return String(value ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c])); }
  $("quote-print").onclick = () => preview.contentWindow?.print();
  $("quote-pdf-mode").onclick = () => { preview.classList.add("quote-preview-focus"); $("quote-pdf-mode").classList.add("active"); $("quote-details-mode").classList.remove("active"); };
  $("quote-details-mode").onclick = () => { preview.classList.remove("quote-preview-focus"); $("quote-details-mode").classList.add("active"); $("quote-pdf-mode").classList.remove("active"); };
  $("quote-email").onclick = () => alert("Email sending will be connected when the mail settings are added.");
  $("quote-send").onclick = () => alert("Email sending will be connected when the mail settings are added.");
  $("quote-mark-sent").onclick = () => alert("Quote status will be updated when quote status actions are enabled.");
  if (!id) { loading.textContent = "No quote selected."; return; }
  fetch(`/api/quotations?id=${encodeURIComponent(id)}`).then((r) => r.ok ? r.json() : Promise.reject(new Error("Quote not found"))).then((data) => { quote = data; render(); }).catch((error) => { loading.textContent = error.message; });
})();
