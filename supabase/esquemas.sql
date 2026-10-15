-- ============================================================
--  PASO 2 de 2 · CREACIÓN (todo en el esquema public)
--  Las 3 bases de datos de ejemplo, con prefijos para convivir
--  en `public` sin colisionar:
--    · emp_  -> Empresa (español)
--    · tie_  -> Tienda online (inglés)
--    · con_  -> Concesionario (español)
--
--  Ejecútalo DESPUÉS de `reset.sql`.
--  Es re-ejecutable: vuelve a dropear y crear las tablas.
-- ============================================================

-- ============================================================
--  1. EMPRESA  ·  Tienda (clientes, productos, pedidos y pagos)
-- ============================================================
DROP TABLE IF EXISTS emp_auditoria CASCADE;
DROP TABLE IF EXISTS emp_resenas CASCADE;
DROP TABLE IF EXISTS emp_pagos CASCADE;
DROP TABLE IF EXISTS emp_envios CASCADE;
DROP TABLE IF EXISTS emp_detalle_pedido CASCADE;
DROP TABLE IF EXISTS emp_pedidos CASCADE;
DROP TABLE IF EXISTS emp_inventario CASCADE;
DROP TABLE IF EXISTS emp_productos CASCADE;
DROP TABLE IF EXISTS emp_proveedores CASCADE;
DROP TABLE IF EXISTS emp_categorias CASCADE;
DROP TABLE IF EXISTS emp_clientes CASCADE;
DROP TABLE IF EXISTS emp_empleados CASCADE;
DROP VIEW IF EXISTS emp_vista_resumen_clientes CASCADE;
DROP VIEW IF EXISTS emp_vista_stock_productos CASCADE;
DROP VIEW IF EXISTS emp_vista_ingresos_categoria CASCADE;
DROP FUNCTION IF EXISTS emp_valor_total_cliente(UUID) CASCADE;
DROP FUNCTION IF EXISTS emp_actualizar_stock_al_vender() CASCADE;

CREATE TABLE emp_empleados (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  nombre TEXT NOT NULL,
  email TEXT UNIQUE NOT NULL,
  puesto TEXT NOT NULL DEFAULT 'empleado',
  salario NUMERIC(10,2),
  fecha_alta TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE emp_clientes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  nombre TEXT NOT NULL,
  email TEXT UNIQUE NOT NULL,
  telefono TEXT,
  ciudad TEXT,
  fecha_registro TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE emp_categorias (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  nombre TEXT NOT NULL,
  descripcion TEXT,
  categoria_padre_id UUID REFERENCES emp_categorias(id) ON DELETE SET NULL,
  fecha_creacion TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE emp_proveedores (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  nombre TEXT NOT NULL,
  contacto TEXT,
  telefono TEXT,
  pais TEXT,
  fecha_alta TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE emp_productos (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  categoria_id UUID REFERENCES emp_categorias(id) ON DELETE SET NULL,
  proveedor_id UUID REFERENCES emp_proveedores(id) ON DELETE SET NULL,
  nombre TEXT NOT NULL,
  sku TEXT UNIQUE NOT NULL,
  precio NUMERIC(12,2) NOT NULL,
  coste NUMERIC(12,2),
  activo BOOLEAN NOT NULL DEFAULT true,
  fecha_creacion TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE emp_inventario (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  producto_id UUID NOT NULL REFERENCES emp_productos(id) ON DELETE CASCADE,
  almacen TEXT,
  cantidad INTEGER NOT NULL DEFAULT 0,
  cantidad_reservada INTEGER NOT NULL DEFAULT 0,
  fecha_actualizacion TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE emp_pedidos (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  cliente_id UUID NOT NULL REFERENCES emp_clientes(id) ON DELETE RESTRICT,
  empleado_id UUID REFERENCES emp_empleados(id) ON DELETE SET NULL,
  estado TEXT NOT NULL DEFAULT 'pendiente',
  total NUMERIC(12,2) NOT NULL DEFAULT 0,
  impuestos NUMERIC(12,2) NOT NULL DEFAULT 0,
  gastos_envio NUMERIC(12,2) NOT NULL DEFAULT 0,
  fecha_creacion TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE emp_detalle_pedido (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  pedido_id UUID NOT NULL REFERENCES emp_pedidos(id) ON DELETE CASCADE,
  producto_id UUID NOT NULL REFERENCES emp_productos(id) ON DELETE RESTRICT,
  cantidad INTEGER NOT NULL,
  precio_unitario NUMERIC(12,2) NOT NULL,
  descuento NUMERIC(12,2) NOT NULL DEFAULT 0
);

CREATE TABLE emp_envios (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  pedido_id UUID NOT NULL REFERENCES emp_pedidos(id) ON DELETE CASCADE,
  transportista TEXT,
  numero_seguimiento TEXT,
  estado TEXT NOT NULL DEFAULT 'preparando'
);

CREATE TABLE emp_pagos (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  pedido_id UUID NOT NULL REFERENCES emp_pedidos(id) ON DELETE CASCADE,
  importe NUMERIC(12,2) NOT NULL,
  metodo TEXT NOT NULL,
  estado TEXT NOT NULL DEFAULT 'pendiente',
  fecha_pago TIMESTAMPTZ
);

CREATE TABLE emp_resenas (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  producto_id UUID NOT NULL REFERENCES emp_productos(id) ON DELETE CASCADE,
  cliente_id UUID NOT NULL REFERENCES emp_clientes(id) ON DELETE CASCADE,
  puntuacion INTEGER NOT NULL CHECK (puntuacion BETWEEN 1 AND 5),
  comentario TEXT
);

CREATE TABLE emp_auditoria (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tabla TEXT NOT NULL,
  registro_id UUID,
  accion TEXT NOT NULL,
  empleado_id UUID REFERENCES emp_empleados(id) ON DELETE SET NULL,
  fecha TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE VIEW emp_vista_resumen_clientes AS
SELECT c.id AS cliente_id, c.nombre, c.email,
       COUNT(p.id) AS total_pedidos, COALESCE(SUM(p.total), 0) AS total_gastado
FROM emp_clientes c
LEFT JOIN emp_pedidos p ON p.cliente_id = c.id
GROUP BY c.id, c.nombre, c.email;

CREATE VIEW emp_vista_stock_productos AS
SELECT pr.id AS producto_id, pr.nombre, pr.sku, COALESCE(i.cantidad, 0) AS cantidad
FROM emp_productos pr
LEFT JOIN emp_inventario i ON i.producto_id = pr.id;

CREATE VIEW emp_vista_ingresos_categoria AS
SELECT cat.id AS categoria_id, cat.nombre AS categoria,
       SUM(dp.cantidad * dp.precio_unitario) AS ingresos
FROM emp_detalle_pedido dp
JOIN emp_productos pr ON pr.id = dp.producto_id
JOIN emp_categorias cat ON cat.id = pr.categoria_id
GROUP BY cat.id, cat.nombre;

CREATE FUNCTION emp_valor_total_cliente(p_cliente_id UUID)
RETURNS NUMERIC(12,2) AS $$
  SELECT COALESCE(SUM(total), 0) FROM emp_pedidos WHERE cliente_id = p_cliente_id;
$$ LANGUAGE sql;

CREATE FUNCTION emp_actualizar_stock_al_vender()
RETURNS TRIGGER AS $$
BEGIN
  UPDATE emp_inventario
  SET cantidad_reservada = cantidad_reservada + NEW.cantidad,
      fecha_actualizacion = now()
  WHERE producto_id = NEW.producto_id;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_emp_actualizar_stock
AFTER INSERT ON emp_detalle_pedido
FOR EACH ROW EXECUTE FUNCTION emp_actualizar_stock_al_vender();

-- ============================================================
--  2. TIENDA ONLINE  ·  Online store (English)
-- ============================================================
DROP TABLE IF EXISTS tie_audit_logs CASCADE;
DROP TABLE IF EXISTS tie_reviews CASCADE;
DROP TABLE IF EXISTS tie_payments CASCADE;
DROP TABLE IF EXISTS tie_shipments CASCADE;
DROP TABLE IF EXISTS tie_order_items CASCADE;
DROP TABLE IF EXISTS tie_orders CASCADE;
DROP TABLE IF EXISTS tie_inventory CASCADE;
DROP TABLE IF EXISTS tie_products CASCADE;
DROP TABLE IF EXISTS tie_categories CASCADE;
DROP TABLE IF EXISTS tie_customers CASCADE;
DROP TABLE IF EXISTS tie_users CASCADE;
DROP TABLE IF EXISTS tie_organizations CASCADE;
DROP VIEW IF EXISTS tie_vw_customer_order_summary CASCADE;
DROP VIEW IF EXISTS tie_vw_product_inventory CASCADE;
DROP VIEW IF EXISTS tie_vw_revenue_by_category CASCADE;
DROP FUNCTION IF EXISTS tie_fn_get_customer_lifetime_value(UUID) CASCADE;
DROP FUNCTION IF EXISTS tie_fn_update_inventory_after_order() CASCADE;

CREATE TABLE tie_organizations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  slug TEXT UNIQUE NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE tie_users (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES tie_organizations(id) ON DELETE CASCADE,
  email TEXT NOT NULL,
  full_name TEXT,
  role TEXT NOT NULL DEFAULT 'member',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (organization_id, email)
);

CREATE TABLE tie_customers (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES tie_organizations(id) ON DELETE CASCADE,
  email TEXT NOT NULL,
  first_name TEXT,
  last_name TEXT,
  phone TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE tie_categories (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES tie_organizations(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  parent_category_id UUID REFERENCES tie_categories(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE tie_products (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES tie_organizations(id) ON DELETE CASCADE,
  category_id UUID REFERENCES tie_categories(id) ON DELETE SET NULL,
  sku TEXT NOT NULL,
  name TEXT NOT NULL,
  price NUMERIC(12,2) NOT NULL,
  cost NUMERIC(12,2),
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (organization_id, sku)
);

CREATE TABLE tie_inventory (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  product_id UUID NOT NULL REFERENCES tie_products(id) ON DELETE CASCADE,
  warehouse_location TEXT,
  quantity INTEGER NOT NULL DEFAULT 0,
  reserved_quantity INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE tie_orders (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES tie_organizations(id) ON DELETE CASCADE,
  customer_id UUID NOT NULL REFERENCES tie_customers(id) ON DELETE RESTRICT,
  user_id UUID REFERENCES tie_users(id) ON DELETE SET NULL,
  status TEXT NOT NULL DEFAULT 'pending',
  total_amount NUMERIC(12,2) NOT NULL DEFAULT 0,
  tax_amount NUMERIC(12,2) NOT NULL DEFAULT 0,
  shipping_amount NUMERIC(12,2) NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE tie_order_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id UUID NOT NULL REFERENCES tie_orders(id) ON DELETE CASCADE,
  product_id UUID NOT NULL REFERENCES tie_products(id) ON DELETE RESTRICT,
  quantity INTEGER NOT NULL,
  unit_price NUMERIC(12,2) NOT NULL,
  discount_amount NUMERIC(12,2) NOT NULL DEFAULT 0
);

CREATE TABLE tie_shipments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id UUID NOT NULL REFERENCES tie_orders(id) ON DELETE CASCADE,
  tracking_number TEXT,
  carrier TEXT,
  status TEXT NOT NULL DEFAULT 'preparing'
);

CREATE TABLE tie_payments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id UUID NOT NULL REFERENCES tie_orders(id) ON DELETE CASCADE,
  amount NUMERIC(12,2) NOT NULL,
  provider TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending',
  paid_at TIMESTAMPTZ
);

CREATE TABLE tie_reviews (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  product_id UUID NOT NULL REFERENCES tie_products(id) ON DELETE CASCADE,
  customer_id UUID NOT NULL REFERENCES tie_customers(id) ON DELETE CASCADE,
  rating INTEGER NOT NULL CHECK (rating BETWEEN 1 AND 5),
  comment TEXT
);

CREATE TABLE tie_audit_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  table_name TEXT NOT NULL,
  record_id UUID,
  action TEXT NOT NULL,
  performed_by UUID REFERENCES tie_users(id) ON DELETE SET NULL,
  performed_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE VIEW tie_vw_customer_order_summary AS
SELECT c.id AS customer_id, c.email, COUNT(o.id) AS total_orders,
       COALESCE(SUM(o.total_amount), 0) AS total_spent
FROM tie_customers c
LEFT JOIN tie_orders o ON o.customer_id = c.id
GROUP BY c.id, c.email;

CREATE VIEW tie_vw_product_inventory AS
SELECT p.id AS product_id, p.name, p.sku, COALESCE(i.quantity, 0) AS quantity
FROM tie_products p
LEFT JOIN tie_inventory i ON i.product_id = p.id;

CREATE VIEW tie_vw_revenue_by_category AS
SELECT cat.id AS category_id, cat.name AS category,
       SUM(oi.quantity * oi.unit_price) AS revenue
FROM tie_order_items oi
JOIN tie_products p ON p.id = oi.product_id
JOIN tie_categories cat ON cat.id = p.category_id
GROUP BY cat.id, cat.name;

CREATE FUNCTION tie_fn_get_customer_lifetime_value(p_customer_id UUID)
RETURNS NUMERIC(12,2) AS $$
  SELECT COALESCE(SUM(total_amount), 0) FROM tie_orders WHERE customer_id = p_customer_id;
$$ LANGUAGE sql;

CREATE FUNCTION tie_fn_update_inventory_after_order()
RETURNS TRIGGER AS $$
BEGIN
  UPDATE tie_inventory
  SET reserved_quantity = reserved_quantity + NEW.quantity
  WHERE product_id = NEW.product_id;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_tie_update_inventory
AFTER INSERT ON tie_order_items
FOR EACH ROW EXECUTE FUNCTION tie_fn_update_inventory_after_order();

-- ============================================================
--  3. CONCESIONARIO  ·  Vehículos, ventas y revisiones
-- ============================================================
DROP TABLE IF EXISTS con_revisiones CASCADE;
DROP TABLE IF EXISTS con_ventas CASCADE;
DROP TABLE IF EXISTS con_vehiculos CASCADE;
DROP TABLE IF EXISTS con_modelos CASCADE;
DROP TABLE IF EXISTS con_marcas CASCADE;
DROP TABLE IF EXISTS con_empleados CASCADE;
DROP TABLE IF EXISTS con_clientes CASCADE;
DROP TABLE IF EXISTS con_proveedores CASCADE;
DROP VIEW IF EXISTS con_vista_ventas_marca CASCADE;
DROP VIEW IF EXISTS con_vista_revisiones_vehiculo CASCADE;
DROP FUNCTION IF EXISTS con_total_gastado_cliente(UUID) CASCADE;
DROP FUNCTION IF EXISTS con_historial_revisiones(UUID) CASCADE;

CREATE TABLE con_marcas (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  nombre TEXT NOT NULL,
  pais TEXT
);

CREATE TABLE con_modelos (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  marca_id UUID NOT NULL REFERENCES con_marcas(id) ON DELETE CASCADE,
  nombre TEXT NOT NULL,
  anio INTEGER,
  precio_base NUMERIC(12,2)
);

CREATE TABLE con_vehiculos (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  modelo_id UUID NOT NULL REFERENCES con_modelos(id) ON DELETE CASCADE,
  matricula TEXT UNIQUE NOT NULL,
  color TEXT,
  anio INTEGER,
  kilometros INTEGER,
  estado TEXT NOT NULL DEFAULT 'disponible',
  precio NUMERIC(12,2)
);

CREATE TABLE con_clientes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  nombre TEXT NOT NULL,
  email TEXT UNIQUE,
  telefono TEXT,
  dni TEXT,
  ciudad TEXT
);

CREATE TABLE con_empleados (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  nombre TEXT NOT NULL,
  puesto TEXT,
  email TEXT UNIQUE
);

CREATE TABLE con_ventas (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  vehiculo_id UUID NOT NULL REFERENCES con_vehiculos(id) ON DELETE RESTRICT,
  cliente_id UUID NOT NULL REFERENCES con_clientes(id) ON DELETE RESTRICT,
  empleado_id UUID REFERENCES con_empleados(id) ON DELETE SET NULL,
  fecha TIMESTAMPTZ NOT NULL DEFAULT now(),
  importe NUMERIC(12,2) NOT NULL,
  metodo_pago TEXT
);

CREATE TABLE con_revisiones (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  vehiculo_id UUID NOT NULL REFERENCES con_vehiculos(id) ON DELETE CASCADE,
  cliente_id UUID REFERENCES con_clientes(id) ON DELETE SET NULL,
  fecha TIMESTAMPTZ NOT NULL DEFAULT now(),
  tipo TEXT,
  coste NUMERIC(12,2),
  kilometros INTEGER
);

CREATE TABLE con_proveedores (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  nombre TEXT NOT NULL,
  contacto TEXT,
  telefono TEXT
);

CREATE VIEW con_vista_ventas_marca AS
SELECT m.id AS marca_id, m.nombre AS marca, COUNT(v.id) AS total_ventas,
       COALESCE(SUM(v.importe), 0) AS ingresos
FROM con_marcas m
LEFT JOIN con_modelos mo ON mo.marca_id = m.id
LEFT JOIN con_vehiculos ve ON ve.modelo_id = mo.id
LEFT JOIN con_ventas v ON v.vehiculo_id = ve.id
GROUP BY m.id, m.nombre;

CREATE VIEW con_vista_revisiones_vehiculo AS
SELECT ve.id AS vehiculo_id, ve.matricula, COUNT(r.id) AS total_revisiones,
       COALESCE(SUM(r.coste), 0) AS coste_total
FROM con_vehiculos ve
LEFT JOIN con_revisiones r ON r.vehiculo_id = ve.id
GROUP BY ve.id, ve.matricula;

CREATE FUNCTION con_total_gastado_cliente(p_cliente_id UUID)
RETURNS NUMERIC(12,2) AS $$
  SELECT COALESCE(SUM(importe), 0) FROM con_ventas WHERE cliente_id = p_cliente_id;
$$ LANGUAGE sql;

CREATE FUNCTION con_historial_revisiones(p_vehiculo_id UUID)
RETURNS INTEGER AS $$
  SELECT COUNT(*) FROM con_revisiones WHERE vehiculo_id = p_vehiculo_id;
$$ LANGUAGE sql;

-- ============================================================
--  DATOS DE EJEMPLO
-- ============================================================

-- ---------- Empresa ----------
INSERT INTO emp_empleados (nombre, email, puesto, salario) VALUES
  ('Ana García', 'ana.garcia@empresa.com', 'administrador', 2800.00),
  ('Luis Pérez', 'luis.perez@empresa.com', 'ventas', 2200.00);

INSERT INTO emp_clientes (nombre, email, telefono, ciudad) VALUES
  ('Juan López', 'juan.lopez@email.com', '600111222', 'Madrid'),
  ('María Ruiz', 'maria.ruiz@email.com', '600333444', 'Barcelona');

INSERT INTO emp_proveedores (nombre, contacto, telefono, pais) VALUES
  ('TecnoSuministros S.L.', 'Carlos Díaz', '910000000', 'España');

INSERT INTO emp_categorias (nombre, descripcion) VALUES
  ('Informática', 'Ordenadores y componentes'),
  ('Accesorios', 'Periféricos y accesorios');

INSERT INTO emp_productos (categoria_id, proveedor_id, nombre, sku, precio, coste) VALUES
  ((SELECT id FROM emp_categorias WHERE nombre = 'Informática'), (SELECT id FROM emp_proveedores LIMIT 1), 'Portátil Pro 15', 'PORT-001', 1299.99, 900.00),
  ((SELECT id FROM emp_categorias WHERE nombre = 'Accesorios'), (SELECT id FROM emp_proveedores LIMIT 1), 'Ratón inalámbrico', 'RAT-001', 49.99, 20.00);

INSERT INTO emp_inventario (producto_id, almacen, cantidad) VALUES
  ((SELECT id FROM emp_productos WHERE sku = 'PORT-001'), 'Almacén Central', 100),
  ((SELECT id FROM emp_productos WHERE sku = 'RAT-001'), 'Almacén Central', 500);

INSERT INTO emp_pedidos (cliente_id, empleado_id, estado, total, impuestos, gastos_envio) VALUES
  ((SELECT id FROM emp_clientes WHERE email = 'juan.lopez@email.com'), (SELECT id FROM emp_empleados LIMIT 1), 'completado', 1349.98, 100.00, 0.00);

INSERT INTO emp_detalle_pedido (pedido_id, producto_id, cantidad, precio_unitario) VALUES
  ((SELECT id FROM emp_pedidos LIMIT 1), (SELECT id FROM emp_productos WHERE sku = 'PORT-001'), 1, 1299.99),
  ((SELECT id FROM emp_pedidos LIMIT 1), (SELECT id FROM emp_productos WHERE sku = 'RAT-001'), 1, 49.99);

INSERT INTO emp_pagos (pedido_id, importe, metodo, estado, fecha_pago) VALUES
  ((SELECT id FROM emp_pedidos LIMIT 1), 1349.98, 'tarjeta', 'completado', now());

INSERT INTO emp_envios (pedido_id, transportista, numero_seguimiento, estado) VALUES
  ((SELECT id FROM emp_pedidos LIMIT 1), 'Correos Express', 'CE-0001', 'entregado');

INSERT INTO emp_resenas (producto_id, cliente_id, puntuacion, comentario) VALUES
  ((SELECT id FROM emp_productos WHERE sku = 'PORT-001'), (SELECT id FROM emp_clientes WHERE email = 'juan.lopez@email.com'), 5, 'Excelente portátil');

-- ---------- Tienda online ----------
INSERT INTO tie_organizations (name, slug) VALUES ('Acme Store', 'acme');

INSERT INTO tie_users (organization_id, email, full_name, role) VALUES
  ((SELECT id FROM tie_organizations WHERE slug = 'acme'), 'admin@acme.com', 'Alice Admin', 'owner');

INSERT INTO tie_customers (organization_id, email, first_name, last_name, phone) VALUES
  ((SELECT id FROM tie_organizations WHERE slug = 'acme'), 'john.doe@email.com', 'John', 'Doe', '600111222');

INSERT INTO tie_categories (organization_id, name) VALUES
  ((SELECT id FROM tie_organizations WHERE slug = 'acme'), 'Computers'),
  ((SELECT id FROM tie_organizations WHERE slug = 'acme'), 'Accessories');

INSERT INTO tie_products (organization_id, category_id, sku, name, price, cost) VALUES
  ((SELECT id FROM tie_organizations WHERE slug = 'acme'), (SELECT id FROM tie_categories WHERE name = 'Computers'), 'LAP-001', 'Pro Laptop 15', 1299.99, 900.00),
  ((SELECT id FROM tie_organizations WHERE slug = 'acme'), (SELECT id FROM tie_categories WHERE name = 'Accessories'), 'MOU-001', 'Wireless Mouse', 49.99, 20.00);

INSERT INTO tie_inventory (product_id, warehouse_location, quantity) VALUES
  ((SELECT id FROM tie_products WHERE sku = 'LAP-001'), 'Central Warehouse', 100),
  ((SELECT id FROM tie_products WHERE sku = 'MOU-001'), 'Central Warehouse', 500);

INSERT INTO tie_orders (organization_id, customer_id, user_id, status, total_amount, tax_amount, shipping_amount) VALUES
  ((SELECT id FROM tie_organizations WHERE slug = 'acme'), (SELECT id FROM tie_customers WHERE email = 'john.doe@email.com'), (SELECT id FROM tie_users WHERE email = 'admin@acme.com'), 'completed', 1349.98, 100.00, 0.00);

INSERT INTO tie_order_items (order_id, product_id, quantity, unit_price) VALUES
  ((SELECT id FROM tie_orders LIMIT 1), (SELECT id FROM tie_products WHERE sku = 'LAP-001'), 1, 1299.99),
  ((SELECT id FROM tie_orders LIMIT 1), (SELECT id FROM tie_products WHERE sku = 'MOU-001'), 1, 49.99);

INSERT INTO tie_payments (order_id, amount, provider, status, paid_at) VALUES
  ((SELECT id FROM tie_orders LIMIT 1), 1349.98, 'stripe', 'completed', now());

INSERT INTO tie_shipments (order_id, tracking_number, carrier, status) VALUES
  ((SELECT id FROM tie_orders LIMIT 1), 'TRK-0001', 'DHL', 'delivered');

INSERT INTO tie_reviews (product_id, customer_id, rating, comment) VALUES
  ((SELECT id FROM tie_products WHERE sku = 'LAP-001'), (SELECT id FROM tie_customers WHERE email = 'john.doe@email.com'), 5, 'Great laptop');

-- ---------- Concesionario ----------
INSERT INTO con_marcas (nombre, pais) VALUES
  ('Toyota', 'Japón'),
  ('Seat', 'España');

INSERT INTO con_modelos (marca_id, nombre, anio, precio_base) VALUES
  ((SELECT id FROM con_marcas WHERE nombre = 'Toyota'), 'Corolla', 2023, 24000.00),
  ((SELECT id FROM con_marcas WHERE nombre = 'Seat'), 'León', 2023, 22000.00);

INSERT INTO con_vehiculos (modelo_id, matricula, color, anio, kilometros, estado, precio) VALUES
  ((SELECT id FROM con_modelos WHERE nombre = 'Corolla'), '1234ABC', 'Blanco', 2023, 15000, 'disponible', 23500.00),
  ((SELECT id FROM con_modelos WHERE nombre = 'León'), '5678DEF', 'Negro', 2023, 8000, 'reservado', 21500.00);

INSERT INTO con_clientes (nombre, email, telefono, dni, ciudad) VALUES
  ('Pedro Sánchez', 'pedro@email.com', '600555666', '12345678A', 'Sevilla');

INSERT INTO con_empleados (nombre, puesto, email) VALUES
  ('Laura Gómez', 'comercial', 'laura@concesionario.com');

INSERT INTO con_ventas (vehiculo_id, cliente_id, empleado_id, importe, metodo_pago) VALUES
  ((SELECT id FROM con_vehiculos WHERE matricula = '5678DEF'), (SELECT id FROM con_clientes WHERE dni = '12345678A'), (SELECT id FROM con_empleados LIMIT 1), 21500.00, 'financiado');

INSERT INTO con_revisiones (vehiculo_id, cliente_id, tipo, coste, kilometros) VALUES
  ((SELECT id FROM con_vehiculos WHERE matricula = '1234ABC'), (SELECT id FROM con_clientes WHERE dni = '12345678A'), 'mantenimiento', 250.00, 15000);

INSERT INTO con_proveedores (nombre, contacto, telefono) VALUES
  ('Recambios Ibérica', 'Marta López', '955000000');

-- ============================================================
--  FIN · 3 bases de datos en public: emp_*, tie_*, con_*
-- ============================================================
