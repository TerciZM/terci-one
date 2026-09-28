-- Apply once to the Terci One D1 database. Every statement is safe to rerun.
CREATE TABLE IF NOT EXISTS recurring_invoices (
 id INTEGER PRIMARY KEY AUTOINCREMENT, customer_id INTEGER NOT NULL, profile_name TEXT NOT NULL,
 frequency TEXT NOT NULL DEFAULT 'Monthly', start_date TEXT NOT NULL, end_date TEXT,
 payment_terms TEXT NOT NULL DEFAULT 'Net 30', due_days INTEGER NOT NULL DEFAULT 30,
 auto_generate INTEGER NOT NULL DEFAULT 0, delivery_email TEXT, order_number TEXT, subject TEXT,
 customer_notes TEXT, terms_conditions TEXT, status TEXT NOT NULL DEFAULT 'Active',
 next_run_date TEXT NOT NULL, last_generated_at TEXT, total REAL NOT NULL DEFAULT 0,
 created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP, updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
 FOREIGN KEY(customer_id) REFERENCES customers(id)
);
CREATE TABLE IF NOT EXISTS recurring_invoice_lines (
 id INTEGER PRIMARY KEY AUTOINCREMENT, recurring_invoice_id INTEGER NOT NULL, item_id INTEGER,
 description TEXT NOT NULL, quantity REAL NOT NULL DEFAULT 1, unit_of_measure TEXT NOT NULL DEFAULT 'Each',
 rate REAL NOT NULL DEFAULT 0, internal_cost REAL NOT NULL DEFAULT 0, amount REAL NOT NULL DEFAULT 0,
 FOREIGN KEY(recurring_invoice_id) REFERENCES recurring_invoices(id) ON DELETE CASCADE,
 FOREIGN KEY(item_id) REFERENCES items(id)
);
CREATE INDEX IF NOT EXISTS idx_recurring_due ON recurring_invoices(status,next_run_date);
CREATE TABLE IF NOT EXISTS credit_notes (
 id INTEGER PRIMARY KEY AUTOINCREMENT, credit_note_number TEXT NOT NULL UNIQUE, customer_id INTEGER NOT NULL,
 invoice_id INTEGER, credit_date TEXT NOT NULL, subject TEXT, status TEXT NOT NULL DEFAULT 'Draft',
 subtotal REAL NOT NULL DEFAULT 0, adjustment REAL NOT NULL DEFAULT 0, total REAL NOT NULL DEFAULT 0,
 customer_notes TEXT, created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP, updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
 FOREIGN KEY(customer_id) REFERENCES customers(id), FOREIGN KEY(invoice_id) REFERENCES invoices(id)
);
CREATE TABLE IF NOT EXISTS credit_note_lines (
 id INTEGER PRIMARY KEY AUTOINCREMENT, credit_note_id INTEGER NOT NULL, item_id INTEGER,
 description TEXT NOT NULL, quantity REAL NOT NULL DEFAULT 1, unit_of_measure TEXT NOT NULL DEFAULT 'Each',
 rate REAL NOT NULL DEFAULT 0, amount REAL NOT NULL DEFAULT 0,
 FOREIGN KEY(credit_note_id) REFERENCES credit_notes(id) ON DELETE CASCADE,
 FOREIGN KEY(item_id) REFERENCES items(id)
);
CREATE TABLE IF NOT EXISTS credit_note_applications (
 id INTEGER PRIMARY KEY AUTOINCREMENT, credit_note_id INTEGER NOT NULL UNIQUE, invoice_id INTEGER NOT NULL,
 amount REAL NOT NULL, created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
 FOREIGN KEY(credit_note_id) REFERENCES credit_notes(id), FOREIGN KEY(invoice_id) REFERENCES invoices(id)
);
CREATE INDEX IF NOT EXISTS idx_credit_notes_customer ON credit_notes(customer_id,credit_date);
CREATE TABLE IF NOT EXISTS vendors (
 id INTEGER PRIMARY KEY AUTOINCREMENT, vendor_number TEXT NOT NULL UNIQUE, display_name TEXT NOT NULL,
 company_name TEXT, salutation TEXT, first_name TEXT, last_name TEXT, email TEXT, work_phone TEXT, mobile TEXT,
 tax_rate TEXT, company_id TEXT, currency TEXT NOT NULL DEFAULT 'ZMW', payment_terms TEXT NOT NULL DEFAULT 'Due on Receipt',
 billing_attention TEXT, billing_country TEXT, billing_address1 TEXT, billing_address2 TEXT, billing_city TEXT,
 billing_state TEXT, billing_zip TEXT, billing_phone TEXT, billing_fax TEXT, shipping_attention TEXT,
 shipping_country TEXT, shipping_address1 TEXT, shipping_address2 TEXT, shipping_city TEXT, shipping_state TEXT,
 shipping_zip TEXT, shipping_phone TEXT, shipping_fax TEXT, contact_persons TEXT, custom_fields TEXT,
 reporting_tags TEXT, remarks TEXT, status TEXT NOT NULL DEFAULT 'Active',
 created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP, updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS idx_vendors_display_name ON vendors(display_name);
CREATE TABLE IF NOT EXISTS expenses (
 id INTEGER PRIMARY KEY AUTOINCREMENT, expense_date TEXT NOT NULL, expense_account TEXT NOT NULL DEFAULT 'Other',
 reference TEXT, vendor_id INTEGER, paid_through TEXT NOT NULL DEFAULT 'Bank Account', customer_id INTEGER,
 billable INTEGER NOT NULL DEFAULT 0, amount REAL NOT NULL DEFAULT 0, tax_amount REAL NOT NULL DEFAULT 0,
 notes TEXT, status TEXT NOT NULL DEFAULT 'Recorded', created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
 updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP, FOREIGN KEY(vendor_id) REFERENCES vendors(id),
 FOREIGN KEY(customer_id) REFERENCES customers(id)
);
CREATE INDEX IF NOT EXISTS idx_expenses_date ON expenses(expense_date,id);
