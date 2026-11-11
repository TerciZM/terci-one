Terci One business management platform

## Purchase Orders

Apply `purchase-orders-migration.sql` to the Pages project's D1 database before
deploying this feature. The migration requires the existing Items schema and
Vendors table from `sales-modules-migration.sql`. It adds purchasing tables,
views and triggers without resetting existing stock. Use a separate D1
database for preview testing.

Open **Purchases → Purchase Orders** to create and approve a vendor PO. Save
prices and lead times in **Supplier Quotes** to compare offers by item. Record
the quantity received per line. Goods for customer jobs remain reserved until
issued from the order. **Stock & Reordering** shows physical stock, job
reservations, available stock and quantities still due on approved stock POs.

Record supplier payments against the PO using the payment reference. These are
PO records and do not post transactions to Expenses or a general ledger.

### Invoice stock

Apply `invoice-stock-migration.sql` after the purchasing migration and the
existing Invoice and Items migrations. The Items schema must include
`item_type` and `unit_of_measure`.

Open a saved, non-draft invoice and select **Goods & Returns**. Confirm the
quantity physically issued, or receive a physical return against goods already
issued. Payments and quotations do not move inventory. Invoices use the
item's stock unit. Once an invoice has movement history, its lines are locked.
A void requires all outstanding goods to be returned first.

For a job purchase, set the purchase order's job reference to the invoice
number or the invoice's Order Number. The invoice can issue the reservation
directly or link a prior issue recorded against the same job. A prior issue
link records fulfillment without a second stock deduction.
