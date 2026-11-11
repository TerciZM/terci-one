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
