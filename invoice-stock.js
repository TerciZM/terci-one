const panel = document.querySelector("#invoice-stock");
const invoiceId = Number(new URLSearchParams(location.search).get("id"));
const requestKeys = new Map();
let saving = false;

const escape = value => String(value ?? "").replace(/[&<>"']/g, character => ({
  "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;"
})[character]);

async function api(path, body) {
  const response = await fetch(`/api/invoice-stock${path}`, body && {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body)
  });
  const result = await response.json();
  if (!response.ok) throw new Error(result.error || "Could not load invoice stock.");
  return result;
}

function issueForm(line, jobStock, priorIssues) {
  const sources = [
    ...priorIssues.map(row => ({
      key: `prior:${row.prior_issue_id}`, max: row.available,
      name: `Link prior issue · ${row.number} · ${row.available} ${line.unit}`
    })),
    ...jobStock.map(row => ({
      key: `reserved:${row.purchase_line_id}`, max: row.reserved,
      name: `Job reservation · ${row.number} · ${row.reserved} ${line.unit}`
    }))
  ];
  if (!priorIssues.length && line.available > 0) {
    sources.push({ key: "shop", max: line.available, name: `Available stock · ${line.available} ${line.unit}` });
  }
  if (!sources.length) return "<p>Awaiting available stock.</p>";
  return `<form class="invoice-stock-entry" data-kind="Issue" data-item="${line.item_id}" data-pending="${line.pending}">
    <label>Stock source <select name="source">${sources.map(source =>
      `<option value="${source.key}" data-max="${source.max}">${escape(source.name)}</option>`).join("")}</select></label>
    <label>Quantity <input name="quantity" type="number" min="0.001" step="0.001"
      max="${Math.min(line.pending, sources[0].max)}" required></label>
    <label>Delivery note <input name="reference" maxlength="160" placeholder="Optional"></label>
    <button type="submit">Issue Goods</button>
  </form>`;
}

function returnForm(line) {
  return `<form class="invoice-stock-entry" data-kind="Return" data-item="${line.item_id}">
    <label>Return quantity <input name="quantity" type="number" min="0.001" step="0.001"
      max="${line.outstanding}" required></label>
    <label>Return note <input name="reference" maxlength="160" placeholder="Optional"></label>
    <button type="submit">Receive Return</button>
  </form>`;
}

async function load() {
  const data = await api(`?id=${invoiceId}`);
  const issueAllowed = !["Draft", "Void", "Cancelled", "Pending Approval"].includes(data.invoice.status || "Draft");
  const rows = data.lines.map(line => `<tr>
    <td>${escape(line.name)} <small>${escape(line.unit)}</small></td>
    <td>${line.invoiced}</td><td>${line.available}</td><td>${line.outstanding}</td><td>${line.pending}</td>
    <td>${line.unit_mismatch ? "<p>Use the stock unit on the invoice before issuing.</p>" :
      issueAllowed && line.pending > 0 ? issueForm(line, data.jobs.filter(job => job.item_id === line.item_id),
        data.prior.filter(prior => prior.item_id === line.item_id)) : ""}
      ${line.outstanding > 0 ? returnForm(line) : ""}</td>
  </tr>`);
  panel.querySelector("#invoice-stock-content").innerHTML = `
    ${!issueAllowed ? "<p>Save the invoice as sent or approved before issuing goods.</p>" : ""}
    ${rows.length ? `<div class="table-wrap"><table class="customer-table"><thead>
      <tr><th>Item</th><th>Invoiced</th><th>Available</th><th>With Customer</th><th>To Issue</th><th>Actions</th></tr>
      </thead><tbody>${rows.join("")}</tbody></table></div>` : "<p>This invoice has no linked goods.</p>"}
    ${data.movements.length ? `<h3>Stock History</h3><div class="table-wrap"><table class="customer-table"><thead>
      <tr><th>Date</th><th>Item</th><th>Movement</th><th>Quantity</th><th>Reference</th></tr></thead><tbody>
      ${data.movements.map(entry => `<tr><td>${escape(entry.created_at)}</td><td>${escape(entry.name)}</td>
        <td>${entry.prior_issue_id ? "Linked job issue" : escape(entry.kind)}</td>
        <td>${entry.quantity}</td><td>${escape(entry.reference || "—")}</td></tr>`).join("")}
      </tbody></table></div>` : ""}`;
  panel.querySelectorAll('select[name="source"]').forEach(select => {
    select.addEventListener("change", () => {
      const quantity = select.form.elements.quantity;
      quantity.max = Math.min(Number(select.selectedOptions[0].dataset.max), Number(select.form.dataset.pending));
      if (Number(quantity.value) > Number(quantity.max)) quantity.value = "";
    });
  });
}

if (invoiceId) {
  panel.hidden = false;
  document.querySelector("#invoice-stock-link").hidden = false;
  const message = panel.querySelector("#invoice-stock-message");
  panel.addEventListener("submit", async event => {
    event.preventDefault();
    if (saving) return;
    const form = event.target;
    const [type, sourceId] = (form.elements.source?.value || "").split(":");
    const payload = {
      invoice_id: invoiceId, item_id: Number(form.dataset.item), kind: form.dataset.kind,
      quantity: Number(form.elements.quantity.value), reference: form.elements.reference.value,
      purchase_line_id: type === "reserved" ? Number(sourceId) : null,
      prior_issue_id: type === "prior" ? Number(sourceId) : null
    };
    const fingerprint = JSON.stringify(payload);
    if (!requestKeys.has(fingerprint)) requestKeys.set(fingerprint, crypto.randomUUID());
    saving = true;
    event.submitter.disabled = true;
    message.textContent = "";
    try {
      await api("", { ...payload, request_key: requestKeys.get(fingerprint) });
      await load();
      requestKeys.delete(fingerprint);
      message.textContent = payload.kind === "Return" ? "Return recorded." :
        payload.prior_issue_id ? "Prior job issue linked." : "Goods issued.";
    } catch (error) {
      message.textContent = error.message;
    } finally {
      event.submitter.disabled = false;
      saving = false;
    }
  });
  load().catch(error => { message.textContent = error.message; });
}
