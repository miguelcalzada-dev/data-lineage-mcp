-- Schema: public
-- Seed data + test schema for Data Lineage & Impact Analyzer

-- Drop existing objects for idempotent re-runs
DROP VIEW IF EXISTS public.vw_customer_order_summary CASCADE;
DROP VIEW IF EXISTS public.vw_product_inventory CASCADE;
DROP VIEW IF EXISTS public.vw_revenue_by_category CASCADE;
DROP MATERIALIZED VIEW IF EXISTS public.mv_monthly_revenue;
DROP FUNCTION IF EXISTS public.fn_get_customer_lifetime_value(UUID);
DROP FUNCTION IF EXISTS public.fn_update_inventory_after_order();
DROP TABLE IF EXISTS public.audit_logs CASCADE;
DROP TABLE IF EXISTS public.reviews CASCADE;
DROP TABLE IF EXISTS public.payments CASCADE;
DROP TABLE IF EXISTS public.shipments CASCADE;
DROP TABLE IF EXISTS public.order_items CASCADE;
DROP TABLE IF EXISTS public.orders CASCADE;
DROP TABLE IF EXISTS public.inventory CASCADE;
DROP TABLE IF EXISTS public.products CASCADE;
DROP TABLE IF EXISTS public.categories CASCADE;
DROP TABLE IF EXISTS public.customers CASCADE;
DROP TABLE IF EXISTS public.users CASCADE;
DROP TABLE IF EXISTS public.organizations CASCADE;

-- 1. organizations
CREATE TABLE public.organizations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  slug TEXT UNIQUE NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- 2. users
CREATE TABLE public.users (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  email TEXT NOT NULL,
  full_name TEXT,
  role TEXT NOT NULL DEFAULT 'member',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (organization_id, email)
);

-- 3. customers
CREATE TABLE public.customers (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  email TEXT NOT NULL,
  first_name TEXT,
  last_name TEXT,
  phone TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- 4. categories
CREATE TABLE public.categories (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  parent_category_id UUID REFERENCES public.categories(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- 5. products
CREATE TABLE public.products (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  category_id UUID REFERENCES public.categories(id) ON DELETE SET NULL,
  sku TEXT NOT NULL,
  name TEXT NOT NULL,
  description TEXT,
  price NUMERIC(12,2) NOT NULL,
  cost NUMERIC(12,2),
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (organization_id, sku)
);

-- 6. inventory
CREATE TABLE public.inventory (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  product_id UUID NOT NULL REFERENCES public.products(id) ON DELETE CASCADE,
  warehouse_location TEXT,
  quantity INTEGER NOT NULL DEFAULT 0,
  reserved_quantity INTEGER NOT NULL DEFAULT 0,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- 7. orders
CREATE TABLE public.orders (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  customer_id UUID NOT NULL REFERENCES public.customers(id) ON DELETE RESTRICT,
  user_id UUID REFERENCES public.users(id) ON DELETE SET NULL,
  status TEXT NOT NULL DEFAULT 'pending',
  total_amount NUMERIC(12,2) NOT NULL DEFAULT 0,
  tax_amount NUMERIC(12,2) NOT NULL DEFAULT 0,
  shipping_amount NUMERIC(12,2) NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- 8. order_items
CREATE TABLE public.order_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id UUID NOT NULL REFERENCES public.orders(id) ON DELETE CASCADE,
  product_id UUID NOT NULL REFERENCES public.products(id) ON DELETE RESTRICT,
  quantity INTEGER NOT NULL,
  unit_price NUMERIC(12,2) NOT NULL,
  discount_amount NUMERIC(12,2) NOT NULL DEFAULT 0
);

-- 9. shipments
CREATE TABLE public.shipments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id UUID NOT NULL REFERENCES public.orders(id) ON DELETE CASCADE,
  tracking_number TEXT,
  carrier TEXT,
  shipped_at TIMESTAMPTZ,
  delivered_at TIMESTAMPTZ,
  status TEXT NOT NULL DEFAULT 'preparing'
);

-- 10. payments
CREATE TABLE public.payments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id UUID NOT NULL REFERENCES public.orders(id) ON DELETE CASCADE,
  amount NUMERIC(12,2) NOT NULL,
  provider TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending',
  paid_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- 11. reviews
CREATE TABLE public.reviews (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  product_id UUID NOT NULL REFERENCES public.products(id) ON DELETE CASCADE,
  customer_id UUID NOT NULL REFERENCES public.customers(id) ON DELETE CASCADE,
  rating INTEGER NOT NULL CHECK (rating BETWEEN 1 AND 5),
  comment TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- 12. audit_logs
CREATE TABLE public.audit_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  table_name TEXT NOT NULL,
  record_id UUID,
  action TEXT NOT NULL,
  old_payload JSONB,
  new_payload JSONB,
  performed_by UUID REFERENCES public.users(id) ON DELETE SET NULL,
  performed_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Views
CREATE OR REPLACE VIEW public.vw_customer_order_summary AS
SELECT
  c.id AS customer_id,
  c.email,
  c.first_name,
  c.last_name,
  COUNT(o.id) AS total_orders,
  COALESCE(SUM(o.total_amount), 0) AS lifetime_value,
  MAX(o.created_at) AS last_order_at
FROM public.customers c
LEFT JOIN public.orders o ON o.customer_id = c.id
GROUP BY c.id, c.email, c.first_name, c.last_name;

CREATE OR REPLACE VIEW public.vw_product_inventory AS
SELECT
  p.id AS product_id,
  p.sku,
  p.name,
  p.price,
  p.cost,
  COALESCE(i.quantity, 0) AS quantity,
  COALESCE(i.reserved_quantity, 0) AS reserved_quantity,
  COALESCE(i.quantity, 0) - COALESCE(i.reserved_quantity, 0) AS available_quantity
FROM public.products p
LEFT JOIN public.inventory i ON i.product_id = p.id;

CREATE OR REPLACE VIEW public.vw_revenue_by_category AS
SELECT
  cat.id AS category_id,
  cat.name AS category_name,
  SUM(oi.quantity * oi.unit_price - oi.discount_amount) AS gross_revenue,
  SUM(p.cost * oi.quantity) AS cost_of_goods_sold,
  SUM(oi.quantity * oi.unit_price - oi.discount_amount) - SUM(p.cost * oi.quantity) AS gross_profit
FROM public.order_items oi
JOIN public.products p ON p.id = oi.product_id
JOIN public.categories cat ON cat.id = p.category_id
GROUP BY cat.id, cat.name;

-- Materialized view
CREATE MATERIALIZED VIEW public.mv_monthly_revenue AS
SELECT
  DATE_TRUNC('month', o.created_at) AS month,
  COUNT(DISTINCT o.id) AS order_count,
  SUM(o.total_amount) AS total_revenue,
  SUM(o.tax_amount) AS total_tax,
  SUM(o.shipping_amount) AS total_shipping
FROM public.orders o
GROUP BY DATE_TRUNC('month', o.created_at);

-- Functions / stored procedures
CREATE OR REPLACE FUNCTION public.fn_get_customer_lifetime_value(p_customer_id UUID)
RETURNS NUMERIC(12,2) AS $$
DECLARE
  v_lifetime_value NUMERIC(12,2);
BEGIN
  SELECT COALESCE(SUM(total_amount), 0)
  INTO v_lifetime_value
  FROM public.orders
  WHERE customer_id = p_customer_id;

  RETURN v_lifetime_value;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION public.fn_update_inventory_after_order()
RETURNS TRIGGER AS $$
BEGIN
  UPDATE public.inventory
  SET reserved_quantity = reserved_quantity + NEW.quantity,
      updated_at = now()
  WHERE product_id = NEW.product_id;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_update_inventory_after_order
AFTER INSERT ON public.order_items
FOR EACH ROW
EXECUTE FUNCTION public.fn_update_inventory_after_order();

-- Sample seed rows
INSERT INTO public.organizations (name, slug) VALUES
  ('Acme Corp', 'acme-corp'),
  ('Globex Industries', 'globex-industries');

INSERT INTO public.users (organization_id, email, full_name, role) VALUES
  ((SELECT id FROM public.organizations WHERE slug = 'acme-corp'), 'admin@acme.com', 'Admin User', 'admin'),
  ((SELECT id FROM public.organizations WHERE slug = 'acme-corp'), 'analyst@acme.com', 'Ana Lyst', 'analyst');

INSERT INTO public.customers (organization_id, email, first_name, last_name) VALUES
  ((SELECT id FROM public.organizations WHERE slug = 'acme-corp'), 'john@example.com', 'John', 'Doe'),
  ((SELECT id FROM public.organizations WHERE slug = 'acme-corp'), 'jane@example.com', 'Jane', 'Smith');

INSERT INTO public.categories (organization_id, name) VALUES
  ((SELECT id FROM public.organizations WHERE slug = 'acme-corp'), 'Electronics'),
  ((SELECT id FROM public.organizations WHERE slug = 'acme-corp'), 'Accessories');

INSERT INTO public.products (organization_id, category_id, sku, name, price, cost) VALUES
  ((SELECT id FROM public.organizations WHERE slug = 'acme-corp'), (SELECT id FROM public.categories WHERE name = 'Electronics'), 'LAPTOP-001', 'Pro Laptop', 1299.99, 900.00),
  ((SELECT id FROM public.organizations WHERE slug = 'acme-corp'), (SELECT id FROM public.categories WHERE name = 'Accessories'), 'MOUSE-001', 'Wireless Mouse', 49.99, 20.00);

INSERT INTO public.inventory (product_id, warehouse_location, quantity) VALUES
  ((SELECT id FROM public.products WHERE sku = 'LAPTOP-001'), 'WH-EAST-01', 100),
  ((SELECT id FROM public.products WHERE sku = 'MOUSE-001'), 'WH-EAST-01', 500);

INSERT INTO public.orders (organization_id, customer_id, status, total_amount, tax_amount, shipping_amount) VALUES
  ((SELECT id FROM public.organizations WHERE slug = 'acme-corp'), (SELECT id FROM public.customers WHERE email = 'john@example.com'), 'completed', 1349.98, 100.00, 0.00);

INSERT INTO public.order_items (order_id, product_id, quantity, unit_price) VALUES
  ((SELECT id FROM public.orders LIMIT 1), (SELECT id FROM public.products WHERE sku = 'LAPTOP-001'), 1, 1299.99),
  ((SELECT id FROM public.orders LIMIT 1), (SELECT id FROM public.products WHERE sku = 'MOUSE-001'), 1, 49.99);

INSERT INTO public.payments (order_id, amount, provider, status, paid_at) VALUES
  ((SELECT id FROM public.orders LIMIT 1), 1349.98, 'stripe', 'completed', now());

INSERT INTO public.reviews (product_id, customer_id, rating, comment) VALUES
  ((SELECT id FROM public.products WHERE sku = 'LAPTOP-001'), (SELECT id FROM public.customers WHERE email = 'john@example.com'), 5, 'Excellent machine!');

REFRESH MATERIALIZED VIEW public.mv_monthly_revenue;
