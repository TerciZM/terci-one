(() => {
  const $ = (id) => document.getElementById(id);
  const list = $("quote-list"), filter = $("quote-filter"), preview = $("quote-preview");
  const money = (n) => "K" + Number(n || 0).toLocaleString("en-ZM", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  const esc = (v) => String(v ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  const formatDate = (v) => v ? new Date(`${v}T12:00:00`).toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" }) : "—";
  let quotes = [], selectedId = null, loadedQuote = null;

  function drawQuotes() {
    const term = (filter.value || "").toLowerCase().trim();
    const shown = quotes.filter((q) => [q.quote_number, q.customer_name, q.subject, q.status].some((v) => String(v || "").toLowerCase().includes(term)));
    list.innerHTML = shown.length ? shown.map((q) => `
      <button class="quote-list-card ${String(q.id) === String(selectedId) ? "selected" : ""}" type="button" data-quote-id="${esc(q.id)}">
        <span class="quote-card-main"><strong>${esc(q.customer_name || "Customer")}</strong><b>${money(q.total)}</b></span>
        <span class="quote-card-meta"><span>${esc(q.quote_number || "—")}</span><span>·</span><span>${formatDate(q.quote_date)}</span></span>
        <span class="quote-card-status ${String(q.status || "Draft").toLowerCase()}">${esc(q.status || "Draft")}</span>
        ${q.subject ? `<span class="quote-card-subject">${esc(q.subject)}</span>` : ""}
      </button>`).join("") : '<div class="empty">No quotations found.</div>';
  }

  function openQuote(id) {
    selectedId = String(id);
    loadedQuote = null;
    $("quote-workspace").classList.add("has-selection");
    $("quote-selected-panel").hidden = false;
    $("quote-selected-view").hidden = false;
    $("quote-heading").textContent = "Loading quote…";
    preview.removeAttribute("srcdoc");
    drawQuotes();
    const url = new URL(location.href);
    url.searchParams.set("id", selectedId);
    history.replaceState({}, "", url);
    fetch(`/api/quotations?id=${encodeURIComponent(selectedId)}`).then((r) => r.ok ? r.json() : Promise.reject(new Error("Quote not found"))).then((quote) => {
      loadedQuote = quote;
      renderQuote(quote);
    }).catch((error) => { $("quote-heading").textContent = error.message; });
  }

  function renderQuote(quote) {
    document.title = `${quote.quote_number || "Quote"} · Terci One`;
    $("quote-heading").textContent = quote.quote_number || "Quote";
    $("quote-edit").href = `new-quotation.html?id=${encodeURIComponent(quote.id)}`;
    $("quote-invoice").href = `new-invoice.html?quote_id=${encodeURIComponent(quote.id)}`;
    const expiry = new Date(`${quote.quote_date}T12:00:00`); expiry.setDate(expiry.getDate() + Number(quote.validity_days || 30));
    $("quote-summary-meta").innerHTML = `<div><span>Customer</span><strong>${esc(quote.customer_name || "Customer")}</strong></div><div><span>Quote date</span><strong>${formatDate(quote.quote_date)}</strong></div><div><span>Expiry</span><strong>${Number.isNaN(expiry.getTime()) ? "—" : formatDate(expiry.toISOString().slice(0, 10))}</strong></div><div><span>Total</span><strong>${money(quote.total)}</strong></div>`;
    const rows = (quote.lines || []).map((line) => ({ ...line, id: line.item_id, name: line.name || line.description, description: line.item_description || line.description }));
    preview.srcdoc = window.buildCustomerQuoteHTML({ customer: { name: quote.customer_name || "Customer", address: quote.customer_address || "" }, number: quote.quote_number, date: quote.quote_date, validityDays: quote.validity_days || 30, subject: quote.subject || "", rows, additionalCharges: quote.additional_cost_lines?.reduce((sum, line) => sum + Number(line.amount || 0), 0) || 0, logoUrl: new URL("terci-logo.png", location.href).href, embedded: true });
    drawQuotes();
  }

  list.addEventListener("click", (event) => { const button = event.target.closest("[data-quote-id]"); if (button) openQuote(button.dataset.quoteId); });
  filter.addEventListener("input", drawQuotes);
  $("quote-close").onclick = () => { selectedId = null; loadedQuote = null; $("quote-workspace").classList.remove("has-selection"); $("quote-selected-view").hidden = true; $("quote-selected-panel").hidden = true; const url = new URL(location.href); url.searchParams.delete("id"); history.replaceState({}, "", url); drawQuotes(); };
  $("quote-print").onclick = () => preview.contentWindow?.print();
  $("quote-pdf-mode").onclick = () => { preview.classList.add("quote-preview-focus"); $("quote-pdf-mode").classList.add("active"); $("quote-details-mode").classList.remove("active"); };
  $("quote-details-mode").onclick = () => { preview.classList.remove("quote-preview-focus"); $("quote-details-mode").classList.add("active"); $("quote-pdf-mode").classList.remove("active"); };
  function emailQuote() { if (loadedQuote?.customer_email) location.href = `mailto:${encodeURIComponent(loadedQuote.customer_email)}?subject=${encodeURIComponent(`Quotation ${loadedQuote.quote_number}`)}`; else alert("This customer has no email address saved."); }
  $("quote-send").onclick = emailQuote;
  $("quote-email").onclick = (event) => { event.preventDefault(); emailQuote(); };
  $("quote-mark-sent").onclick = async () => { if (!loadedQuote) return; const response = await fetch(`/api/quotations?id=${encodeURIComponent(loadedQuote.id)}`, { method: "PATCH", headers: { "content-type": "application/json" }, body: JSON.stringify({ status: "Sent" }) }); if (!response.ok) { const result = await response.json().catch(() => ({})); return alert(result.error || "Could not update quote status."); } loadedQuote.status = "Sent"; const row = quotes.find((item) => String(item.id) === String(loadedQuote.id)); if (row) row.status = "Sent"; renderQuote(loadedQuote); };
  $("quote-more").onclick = () => alert("More quote actions will be added here.");

  fetch("/api/quotations").then((r) => r.ok ? r.json() : Promise.reject(new Error("Unable to load quotations."))).then((items) => { quotes = Array.isArray(items) ? items : []; drawQuotes(); const initialId = new URLSearchParams(location.search).get("id"); if (initialId) openQuote(initialId); }).catch((error) => { list.innerHTML = `<div class="empty">${esc(error.message)}</div>`; });
})();
