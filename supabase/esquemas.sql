-- ============================================================
--  PASO 2 de 2 · CREACIÓN
--  Las 3 bases de datos de ejemplo, cada una en su propio
--  ESQUEMA de PostgreSQL:
--    · empresa        (español)
--    · tienda         (inglés)
--    · concesionario  (español)
--
--  Ejecútalo DESPUÉS de `reset.sql`.
--  Es re-ejecutable: vuelve a borrar y crear los 3 esquemas.
-- ============================================================

DROP SCHEMA IF EXISTS empresa CASCADE;
DROP SCHEMA IF EXISTS tienda CASCADE;
DROP SCHEMA IF EXISTS concesionario CASCADE;

CREATE SCHEMA empresa;
CREATE SCHEMA tienda;
CREATE SCHEMA concesionario;

-- ============================================================
--  ESQUEMA: empresa  ·  Tienda (clientes, productos, pedidos y pagos)
-- ============================================================
CREATE TABLE empresa.empleados (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  nombre TEXT NOT NULL,
  email TEXT UNIQUE NOT NULL,
  puesto TEXT NOT NULL DEFAULT 'empleado',
  salario NUMERIC(10,2),
  fecha_alta TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE empresa.clientes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  nombre TEXT NOT NULL,
  email TEXT UNIQUE NOT NULL,
  telefono TEXT,
  ciudad TEXT,
  fecha_registro TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE empresa.categorias (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  nombre TEXT NOT NULL,
  descripcion TEXT,
  categoria_padre_id UUID REFERENCES empresa.categorias(id) ON DELETE SET NULL,
  fecha_creacion TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE empresa.proveedores (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  nombre TEXT NOT NULL,
  contacto TEXT,
  telefono TEXT,
  pais TEXT,
  fecha_alta TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE empresa.productos (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  categoria_id UUID REFERENCES empresa.categorias(id) ON DELETE SET NULL,
  proveedor_id UUID REFERENCES empresa.proveedores(id) ON DELETE SET NULL,
  nombre TEXT NOT NULL,
  sku TEXT UNIQUE NOT NULL,
  precio NUMERIC(12,2) NOT NULL,
  coste NUMERIC(12,2),
  activo BOOLEAN NOT NULL DEFAULT true,
  fecha_creacion TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE empresa.inventario (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  producto_id UUID NOT NULL REFERENCES empresa.productos(id) ON DELETE CASCADE,
  almacen TEXT,
  cantidad INTEGER NOT NULL DEFAULT 0,
  cantidad_reservada INTEGER NOT NULL DEFAULT 0,
  fecha_actualizacion TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE empresa.pedidos (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  cliente_id UUID NOT NULL REFERENCES empresa.clientes(id) ON DELETE RESTRICT,
  empleado_id UUID REFERENCES empresa.empleados(id) ON DELETE SET NULL,
  estado TEXT NOT NULL DEFAULT 'pendiente',
  total NUMERIC(12,2) NOT NULL DEFAULT 0,
  impuestos NUMERIC(12,2) NOT NULL DEFAULT 0,
  gastos_envio NUMERIC(12,2) NOT NULL DEFAULT 0,
  fecha_creacion TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE empresa.detalle_pedido (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  pedido_id UUID NOT NULL REFERENCES empresa.pedidos(id) ON DELETE CASCADE,
  producto_id UUID NOT NULL REFERENCES empresa.productos(id) ON DELETE RESTRICT,
  cantidad INTEGER NOT NULL,
  precio_unitario NUMERIC(12,2) NOT NULL,
  descuento NUMERIC(12,2) NOT NULL DEFAULT 0
);

CREATE TABLE empresa.envios (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  pedido_id UUID NOT NULL REFERENCES empresa.pedidos(id) ON DELETE CASCADE,
  transportista TEXT,
  numero_seguimiento TEXT,
  estado TEXT NOT NULL DEFAULT 'preparando'
);

CREATE TABLE empresa.pagos (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  pedido_id UUID NOT NULL REFERENCES empresa.pedidos(id) ON DELETE CASCADE,
  importe NUMERIC(12,2) NOT NULL,
  metodo TEXT NOT NULL,
  estado TEXT NOT NULL DEFAULT 'pendiente',
  fecha_pago TIMESTAMPTZ
);

CREATE TABLE empresa.resenas (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  producto_id UUID NOT NULL REFERENCES empresa.productos(id) ON DELETE CASCADE,
  cliente_id UUID NOT NULL REFERENCES empresa.clientes(id) ON DELETE CASCADE,
  puntuacion INTEGER NOT NULL CHECK (puntuacion BETWEEN 1 AND 5),
  comentario TEXT
);

CREATE TABLE empresa.auditoria (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tabla TEXT NOT NULL,
  registro_id UUID,
  accion TEXT NOT NULL,
  empleado_id UUID REFERENCES empresa.empleados(id) ON DELETE SET NULL,
  fecha TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE VIEW empresa.vista_resumen_clientes AS
SELECT c.id AS cliente_id, c.nombre, c.email,
       COUNT(p.id) AS total_pedidos, COALESCE(SUM(p.total), 0) AS total_gastado
FROM empresa.clientes c
LEFT JOIN empresa.pedidos p ON p.cliente_id = c.id
GROUP BY c.id, c.nombre, c.email;

CREATE VIEW empresa.vista_stock_productos AS
SELECT pr.id AS producto_id, pr.nombre, pr.sku, COALESCE(i.cantidad, 0) AS cantidad
FROM empresa.productos pr
LEFT JOIN empresa.inventario i ON i.producto_id = pr.id;

CREATE VIEW empresa.vista_ingresos_categoria AS
SELECT cat.id AS categoria_id, cat.nombre AS categoria,
       SUM(dp.cantidad * dp.precio_unitario) AS ingresos
FROM empresa.detalle_pedido dp
JOIN empresa.productos pr ON pr.id = dp.producto_id
JOIN empresa.categorias cat ON cat.id = pr.categoria_id
GROUP BY cat.id, cat.nombre;

CREATE FUNCTION empresa.valor_total_cliente(p_cliente_id UUID)
RETURNS NUMERIC(12,2) AS $$
  SELECT COALESCE(SUM(total), 0) FROM empresa.pedidos WHERE cliente_id = p_cliente_id;
$$ LANGUAGE sql;

CREATE FUNCTION empresa.actualizar_stock_al_vender()
RETURNS TRIGGER AS $$
BEGIN
  UPDATE empresa.inventario
  SET cantidad_reservada = cantidad_reservada + NEW.cantidad,
      fecha_actualizacion = now()
  WHERE producto_id = NEW.producto_id;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_empresa_actualizar_stock
AFTER INSERT ON empresa.detalle_pedido
FOR EACH ROW EXECUTE FUNCTION empresa.actualizar_stock_al_vender();

-- ============================================================
--  ESQUEMA: tienda  ·  Online store (English)
-- ============================================================
CREATE TABLE tienda.organizations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  slug TEXT UNIQUE NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE tienda.users (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES tienda.organizations(id) ON DELETE CASCADE,
  email TEXT NOT NULL,
  full_name TEXT,
  role TEXT NOT NULL DEFAULT 'member',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (organization_id, email)
);

CREATE TABLE tienda.customers (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES tienda.organizations(id) ON DELETE CASCADE,
  email TEXT NOT NULL,
  first_name TEXT,
  last_name TEXT,
  phone TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE tienda.categories (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES tienda.organizations(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  parent_category_id UUID REFERENCES tienda.categories(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE tienda.products (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES tienda.organizations(id) ON DELETE CASCADE,
  category_id UUID REFERENCES tienda.categories(id) ON DELETE SET NULL,
  sku TEXT NOT NULL,
  name TEXT NOT NULL,
  price NUMERIC(12,2) NOT NULL,
  cost NUMERIC(12,2),
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (organization_id, sku)
);

CREATE TABLE tienda.inventory (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  product_id UUID NOT NULL REFERENCES tienda.products(id) ON DELETE CASCADE,
  warehouse_location TEXT,
  quantity INTEGER NOT NULL DEFAULT 0,
  reserved_quantity INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE tienda.orders (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES tienda.organizations(id) ON DELETE CASCADE,
  customer_id UUID NOT NULL REFERENCES tienda.customers(id) ON DELETE RESTRICT,
  user_id UUID REFERENCES tienda.users(id) ON DELETE SET NULL,
  status TEXT NOT NULL DEFAULT 'pending',
  total_amount NUMERIC(12,2) NOT NULL DEFAULT 0,
  tax_amount NUMERIC(12,2) NOT NULL DEFAULT 0,
  shipping_amount NUMERIC(12,2) NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE tienda.order_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id UUID NOT NULL REFERENCES tienda.orders(id) ON DELETE CASCADE,
  product_id UUID NOT NULL REFERENCES tienda.products(id) ON DELETE RESTRICT,
  quantity INTEGER NOT NULL,
  unit_price NUMERIC(12,2) NOT NULL,
  discount_amount NUMERIC(12,2) NOT NULL DEFAULT 0
);

CREATE TABLE tienda.shipments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id UUID NOT NULL REFERENCES tienda.orders(id) ON DELETE CASCADE,
  tracking_number TEXT,
  carrier TEXT,
  status TEXT NOT NULL DEFAULT 'preparing'
);

CREATE TABLE tienda.payments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id UUID NOT NULL REFERENCES tienda.orders(id) ON DELETE CASCADE,
  amount NUMERIC(12,2) NOT NULL,
  provider TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending',
  paid_at TIMESTAMPTZ
);

CREATE TABLE tienda.reviews (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  product_id UUID NOT NULL REFERENCES tienda.products(id) ON DELETE CASCADE,
  customer_id UUID NOT NULL REFERENCES tienda.customers(id) ON DELETE CASCADE,
  rating INTEGER NOT NULL CHECK (rating BETWEEN 1 AND 5),
  comment TEXT
);

CREATE TABLE tienda.audit_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  table_name TEXT NOT NULL,
  record_id UUID,
  action TEXT NOT NULL,
  performed_by UUID REFERENCES tienda.users(id) ON DELETE SET NULL,
  performed_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE VIEW tienda.vw_customer_order_summary AS
SELECT c.id AS customer_id, c.email, COUNT(o.id) AS total_orders,
       COALESCE(SUM(o.total_amount), 0) AS total_spent
FROM tienda.customers c
LEFT JOIN tienda.orders o ON o.customer_id = c.id
GROUP BY c.id, c.email;

CREATE VIEW tienda.vw_product_inventory AS
SELECT p.id AS product_id, p.name, p.sku, COALESCE(i.quantity, 0) AS quantity
FROM tienda.products p
LEFT JOIN tienda.inventory i ON i.product_id = p.id;

CREATE VIEW tienda.vw_revenue_by_category AS
SELECT cat.id AS category_id, cat.name AS category,
       SUM(oi.quantity * oi.unit_price) AS revenue
FROM tienda.order_items oi
JOIN tienda.products p ON p.id = oi.product_id
JOIN tienda.categories cat ON cat.id = p.category_id
GROUP BY cat.id, cat.name;

CREATE FUNCTION tienda.fn_get_customer_lifetime_value(p_customer_id UUID)
RETURNS NUMERIC(12,2) AS $$
  SELECT COALESCE(SUM(total_amount), 0) FROM tienda.orders WHERE customer_id = p_customer_id;
$$ LANGUAGE sql;

CREATE FUNCTION tienda.fn_update_inventory_after_order()
RETURNS TRIGGER AS $$
BEGIN
  UPDATE tienda.inventory
  SET reserved_quantity = reserved_quantity + NEW.quantity
  WHERE product_id = NEW.product_id;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_tienda_update_inventory
AFTER INSERT ON tienda.order_items
FOR EACH ROW EXECUTE FUNCTION tienda.fn_update_inventory_after_order();

-- ============================================================
--  ESQUEMA: concesionario  ·  Vehículos, ventas y revisiones
-- ============================================================
CREATE TABLE concesionario.marcas (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  nombre TEXT NOT NULL,
  pais TEXT
);

CREATE TABLE concesionario.modelos (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  marca_id UUID NOT NULL REFERENCES concesionario.marcas(id) ON DELETE CASCADE,
  nombre TEXT NOT NULL,
  anio INTEGER,
  precio_base NUMERIC(12,2)
);

CREATE TABLE concesionario.vehiculos (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  modelo_id UUID NOT NULL REFERENCES concesionario.modelos(id) ON DELETE CASCADE,
  matricula TEXT UNIQUE NOT NULL,
  color TEXT,
  anio INTEGER,
  kilometros INTEGER,
  estado TEXT NOT NULL DEFAULT 'disponible',
  precio NUMERIC(12,2)
);

CREATE TABLE concesionario.clientes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  nombre TEXT NOT NULL,
  email TEXT UNIQUE,
  telefono TEXT,
  dni TEXT,
  ciudad TEXT
);

CREATE TABLE concesionario.empleados (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  nombre TEXT NOT NULL,
  puesto TEXT,
  email TEXT UNIQUE
);

CREATE TABLE concesionario.ventas (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  vehiculo_id UUID NOT NULL REFERENCES concesionario.vehiculos(id) ON DELETE RESTRICT,
  cliente_id UUID NOT NULL REFERENCES concesionario.clientes(id) ON DELETE RESTRICT,
  empleado_id UUID REFERENCES concesionario.empleados(id) ON DELETE SET NULL,
  fecha TIMESTAMPTZ NOT NULL DEFAULT now(),
  importe NUMERIC(12,2) NOT NULL,
  metodo_pago TEXT
);

CREATE TABLE concesionario.revisiones (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  vehiculo_id UUID NOT NULL REFERENCES concesionario.vehiculos(id) ON DELETE CASCADE,
  cliente_id UUID REFERENCES concesionario.clientes(id) ON DELETE SET NULL,
  fecha TIMESTAMPTZ NOT NULL DEFAULT now(),
  tipo TEXT,
  coste NUMERIC(12,2),
  kilometros INTEGER
);

CREATE TABLE concesionario.proveedores (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  nombre TEXT NOT NULL,
  contacto TEXT,
  telefono TEXT
);

CREATE VIEW concesionario.vista_ventas_marca AS
SELECT m.id AS marca_id, m.nombre AS marca, COUNT(v.id) AS total_ventas,
       COALESCE(SUM(v.importe), 0) AS ingresos
FROM concesionario.marcas m
LEFT JOIN concesionario.modelos mo ON mo.marca_id = m.id
LEFT JOIN concesionario.vehiculos ve ON ve.modelo_id = mo.id
LEFT JOIN concesionario.ventas v ON v.vehiculo_id = ve.id
GROUP BY m.id, m.nombre;

CREATE VIEW concesionario.vista_revisiones_vehiculo AS
SELECT ve.id AS vehiculo_id, ve.matricula, COUNT(r.id) AS total_revisiones,
       COALESCE(SUM(r.coste), 0) AS coste_total
FROM concesionario.vehiculos ve
LEFT JOIN concesionario.revisiones r ON r.vehiculo_id = ve.id
GROUP BY ve.id, ve.matricula;

CREATE FUNCTION concesionario.total_gastado_cliente(p_cliente_id UUID)
RETURNS NUMERIC(12,2) AS $$
  SELECT COALESCE(SUM(importe), 0) FROM concesionario.ventas WHERE cliente_id = p_cliente_id;
$$ LANGUAGE sql;

CREATE FUNCTION concesionario.historial_revisiones(p_vehiculo_id UUID)
RETURNS INTEGER AS $$
  SELECT COUNT(*) FROM concesionario.revisiones WHERE vehiculo_id = p_vehiculo_id;
$$ LANGUAGE sql;

-- ============================================================
--  DATOS DE EJEMPLO
-- ============================================================

-- ---------- empresa ----------
INSERT INTO empresa.empleados (nombre, email, puesto, salario) VALUES
  ('Ana García', 'ana.garcia@empresa.com', 'administrador', 2800.00),
  ('Luis Pérez', 'luis.perez@empresa.com', 'ventas', 2200.00);

INSERT INTO empresa.clientes (nombre, email, telefono, ciudad) VALUES
  ('Juan López', 'juan.lopez@email.com', '600111222', 'Madrid'),
  ('María Ruiz', 'maria.ruiz@email.com', '600333444', 'Barcelona');

INSERT INTO empresa.proveedores (nombre, contacto, telefono, pais) VALUES
  ('TecnoSuministros S.L.', 'Carlos Díaz', '910000000', 'España');

INSERT INTO empresa.categorias (nombre, descripcion) VALUES
  ('Informática', 'Ordenadores y componentes'),
  ('Accesorios', 'Periféricos y accesorios');

INSERT INTO empresa.productos (categoria_id, proveedor_id, nombre, sku, precio, coste) VALUES
  ((SELECT id FROM empresa.categorias WHERE nombre = 'Informática'), (SELECT id FROM empresa.proveedores LIMIT 1), 'Portátil Pro 15', 'PORT-001', 1299.99, 900.00),
  ((SELECT id FROM empresa.categorias WHERE nombre = 'Accesorios'), (SELECT id FROM empresa.proveedores LIMIT 1), 'Ratón inalámbrico', 'RAT-001', 49.99, 20.00);

INSERT INTO empresa.inventario (producto_id, almacen, cantidad) VALUES
  ((SELECT id FROM empresa.productos WHERE sku = 'PORT-001'), 'Almacén Central', 100),
  ((SELECT id FROM empresa.productos WHERE sku = 'RAT-001'), 'Almacén Central', 500);

INSERT INTO empresa.pedidos (cliente_id, empleado_id, estado, total, impuestos, gastos_envio) VALUES
  ((SELECT id FROM empresa.clientes WHERE email = 'juan.lopez@email.com'), (SELECT id FROM empresa.empleados LIMIT 1), 'completado', 1349.98, 100.00, 0.00);

INSERT INTO empresa.detalle_pedido (pedido_id, producto_id, cantidad, precio_unitario) VALUES
  ((SELECT id FROM empresa.pedidos LIMIT 1), (SELECT id FROM empresa.productos WHERE sku = 'PORT-001'), 1, 1299.99),
  ((SELECT id FROM empresa.pedidos LIMIT 1), (SELECT id FROM empresa.productos WHERE sku = 'RAT-001'), 1, 49.99);

INSERT INTO empresa.pagos (pedido_id, importe, metodo, estado, fecha_pago) VALUES
  ((SELECT id FROM empresa.pedidos LIMIT 1), 1349.98, 'tarjeta', 'completado', now());

INSERT INTO empresa.envios (pedido_id, transportista, numero_seguimiento, estado) VALUES
  ((SELECT id FROM empresa.pedidos LIMIT 1), 'Correos Express', 'CE-0001', 'entregado');

INSERT INTO empresa.resenas (producto_id, cliente_id, puntuacion, comentario) VALUES
  ((SELECT id FROM empresa.productos WHERE sku = 'PORT-001'), (SELECT id FROM empresa.clientes WHERE email = 'juan.lopez@email.com'), 5, 'Excelente portátil');

-- ---------- tienda ----------
INSERT INTO tienda.organizations (name, slug) VALUES ('Acme Store', 'acme');

INSERT INTO tienda.users (organization_id, email, full_name, role) VALUES
  ((SELECT id FROM tienda.organizations WHERE slug = 'acme'), 'admin@acme.com', 'Alice Admin', 'owner');

INSERT INTO tienda.customers (organization_id, email, first_name, last_name, phone) VALUES
  ((SELECT id FROM tienda.organizations WHERE slug = 'acme'), 'john.doe@email.com', 'John', 'Doe', '600111222');

INSERT INTO tienda.categories (organization_id, name) VALUES
  ((SELECT id FROM tienda.organizations WHERE slug = 'acme'), 'Computers'),
  ((SELECT id FROM tienda.organizations WHERE slug = 'acme'), 'Accessories');

INSERT INTO tienda.products (organization_id, category_id, sku, name, price, cost) VALUES
  ((SELECT id FROM tienda.organizations WHERE slug = 'acme'), (SELECT id FROM tienda.categories WHERE name = 'Computers'), 'LAP-001', 'Pro Laptop 15', 1299.99, 900.00),
  ((SELECT id FROM tienda.organizations WHERE slug = 'acme'), (SELECT id FROM tienda.categories WHERE name = 'Accessories'), 'MOU-001', 'Wireless Mouse', 49.99, 20.00);

INSERT INTO tienda.inventory (product_id, warehouse_location, quantity) VALUES
  ((SELECT id FROM tienda.products WHERE sku = 'LAP-001'), 'Central Warehouse', 100),
  ((SELECT id FROM tienda.products WHERE sku = 'MOU-001'), 'Central Warehouse', 500);

INSERT INTO tienda.orders (organization_id, customer_id, user_id, status, total_amount, tax_amount, shipping_amount) VALUES
  ((SELECT id FROM tienda.organizations WHERE slug = 'acme'), (SELECT id FROM tienda.customers WHERE email = 'john.doe@email.com'), (SELECT id FROM tienda.users WHERE email = 'admin@acme.com'), 'completed', 1349.98, 100.00, 0.00);

INSERT INTO tienda.order_items (order_id, product_id, quantity, unit_price) VALUES
  ((SELECT id FROM tienda.orders LIMIT 1), (SELECT id FROM tienda.products WHERE sku = 'LAP-001'), 1, 1299.99),
  ((SELECT id FROM tienda.orders LIMIT 1), (SELECT id FROM tienda.products WHERE sku = 'MOU-001'), 1, 49.99);

INSERT INTO tienda.payments (order_id, amount, provider, status, paid_at) VALUES
  ((SELECT id FROM tienda.orders LIMIT 1), 1349.98, 'stripe', 'completed', now());

INSERT INTO tienda.shipments (order_id, tracking_number, carrier, status) VALUES
  ((SELECT id FROM tienda.orders LIMIT 1), 'TRK-0001', 'DHL', 'delivered');

INSERT INTO tienda.reviews (product_id, customer_id, rating, comment) VALUES
  ((SELECT id FROM tienda.products WHERE sku = 'LAP-001'), (SELECT id FROM tienda.customers WHERE email = 'john.doe@email.com'), 5, 'Great laptop');

-- ---------- concesionario ----------
INSERT INTO concesionario.marcas (nombre, pais) VALUES
  ('Toyota', 'Japón'),
  ('Seat', 'España');

INSERT INTO concesionario.modelos (marca_id, nombre, anio, precio_base) VALUES
  ((SELECT id FROM concesionario.marcas WHERE nombre = 'Toyota'), 'Corolla', 2023, 24000.00),
  ((SELECT id FROM concesionario.marcas WHERE nombre = 'Seat'), 'León', 2023, 22000.00);

INSERT INTO concesionario.vehiculos (modelo_id, matricula, color, anio, kilometros, estado, precio) VALUES
  ((SELECT id FROM concesionario.modelos WHERE nombre = 'Corolla'), '1234ABC', 'Blanco', 2023, 15000, 'disponible', 23500.00),
  ((SELECT id FROM concesionario.modelos WHERE nombre = 'León'), '5678DEF', 'Negro', 2023, 8000, 'reservado', 21500.00);

INSERT INTO concesionario.clientes (nombre, email, telefono, dni, ciudad) VALUES
  ('Pedro Sánchez', 'pedro@email.com', '600555666', '12345678A', 'Sevilla');

INSERT INTO concesionario.empleados (nombre, puesto, email) VALUES
  ('Laura Gómez', 'comercial', 'laura@concesionario.com');

INSERT INTO concesionario.ventas (vehiculo_id, cliente_id, empleado_id, importe, metodo_pago) VALUES
  ((SELECT id FROM concesionario.vehiculos WHERE matricula = '5678DEF'), (SELECT id FROM concesionario.clientes WHERE dni = '12345678A'), (SELECT id FROM concesionario.empleados LIMIT 1), 21500.00, 'financiado');

INSERT INTO concesionario.revisiones (vehiculo_id, cliente_id, tipo, coste, kilometros) VALUES
  ((SELECT id FROM concesionario.vehiculos WHERE matricula = '1234ABC'), (SELECT id FROM concesionario.clientes WHERE dni = '12345678A'), 'mantenimiento', 250.00, 15000);

INSERT INTO concesionario.proveedores (nombre, contacto, telefono) VALUES
  ('Recambios Ibérica', 'Marta López', '955000000');

-- ============================================================
--  FIN · Ya tienes las 3 bases de datos: empresa, tienda, concesionario
-- ============================================================
