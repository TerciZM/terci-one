(() => {
  const $ = (id) => document.getElementById(id);
  const money = (n) => "K" + Number(n || 0).toLocaleString("en-ZM", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  const date = (v) => v ? new Date(`${v}T12:00:00`).toLocaleDateString("en-GB", { day: "2-digit", month: "long", year: "numeric" }) : "—";
  const id = new URLSearchParams(location.search).get("id");
  $("receipt-print").onclick = () => window.print();
  if (!id) { document.querySelector(".receipt-document-wrap").innerHTML = '<p class="empty-state">Receipt not found. <a href="sales-receipts.html">Return to receipts</a>.</p>'; return; }
  fetch(`/api/sales-receipts?id=${encodeURIComponent(id)}`).then(async (response) => { const data = await response.json(); if (!response.ok) throw new Error(data.error || "Could not load receipt"); return data; }).then((r) => {
    $("receipt-heading-number").textContent = r.receipt_number;
    $("receipt-number").textContent = r.receipt_number;
    $("receipt-customer").textContent = r.customer_name || "—";
    $("receipt-customer-address").textContent = r.customer_address || "";
    $("receipt-customer-email").textContent = r.customer_email || "";
    $("receipt-date").textContent = date(r.receipt_date);
    $("receipt-method").textContent = r.payment_method || "—";
    $("receipt-reference").textContent = r.payment_reference || "—";
    $("receipt-invoice").textContent = r.invoice_number || "Unallocated payment";
    $("receipt-amount").textContent = money(r.amount);
    if (r.notes) { $("receipt-notes").textContent = r.notes; $("receipt-notes-wrap").hidden = false; }
  }).catch((error) => { document.querySelector(".receipt-document-wrap").innerHTML = `<p class="empty-state">${error.message} <a href="sales-receipts.html">Return to receipts</a>.</p>`; });
})();
