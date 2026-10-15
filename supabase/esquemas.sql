-- ============================================================
--  Las 3 bases de datos de ejemplo (para Supabase, opcional)
--  Cada una en su propio ESQUEMA de PostgreSQL.
--  Ejecutar en el SQL Editor de Supabase si quieres tenerlas.
--  La app NO las necesita: usa los mismos esquemas en memoria.
-- ============================================================

CREATE SCHEMA IF NOT EXISTS empresa;
CREATE SCHEMA IF NOT EXISTS tienda;
CREATE SCHEMA IF NOT EXISTS concesionario;

-- ============================================================
--  ESQUEMA: empresa
-- ============================================================
CREATE TABLE IF NOT EXISTS empresa.empleados (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  nombre TEXT NOT NULL, email TEXT UNIQUE NOT NULL, puesto TEXT NOT NULL DEFAULT 'empleado',
  salario NUMERIC(10,2), fecha_alta TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS empresa.clientes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  nombre TEXT NOT NULL, email TEXT UNIQUE NOT NULL, telefono TEXT, ciudad TEXT,
  fecha_registro TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS empresa.categorias (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  nombre TEXT NOT NULL, descripcion TEXT,
  categoria_padre_id UUID REFERENCES empresa.categorias(id) ON DELETE SET NULL,
  fecha_creacion TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS empresa.proveedores (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  nombre TEXT NOT NULL, contacto TEXT, telefono TEXT, pais TEXT,
  fecha_alta TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS empresa.productos (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  categoria_id UUID REFERENCES empresa.categorias(id) ON DELETE SET NULL,
  proveedor_id UUID REFERENCES empresa.proveedores(id) ON DELETE SET NULL,
  nombre TEXT NOT NULL, sku TEXT UNIQUE NOT NULL, precio NUMERIC(12,2) NOT NULL,
  coste NUMERIC(12,2), activo BOOLEAN NOT NULL DEFAULT true,
  fecha_creacion TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS empresa.inventario (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  producto_id UUID NOT NULL REFERENCES empresa.productos(id) ON DELETE CASCADE,
  almacen TEXT, cantidad INTEGER NOT NULL DEFAULT 0, cantidad_reservada INTEGER NOT NULL DEFAULT 0,
  fecha_actualizacion TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS empresa.pedidos (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  cliente_id UUID NOT NULL REFERENCES empresa.clientes(id) ON DELETE RESTRICT,
  empleado_id UUID REFERENCES empresa.empleados(id) ON DELETE SET NULL,
  estado TEXT NOT NULL DEFAULT 'pendiente', total NUMERIC(12,2) NOT NULL DEFAULT 0,
  impuestos NUMERIC(12,2) NOT NULL DEFAULT 0, gastos_envio NUMERIC(12,2) NOT NULL DEFAULT 0,
  fecha_creacion TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS empresa.detalle_pedido (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  pedido_id UUID NOT NULL REFERENCES empresa.pedidos(id) ON DELETE CASCADE,
  producto_id UUID NOT NULL REFERENCES empresa.productos(id) ON DELETE RESTRICT,
  cantidad INTEGER NOT NULL, precio_unitario NUMERIC(12,2) NOT NULL, descuento NUMERIC(12,2) NOT NULL DEFAULT 0
);
CREATE TABLE IF NOT EXISTS empresa.envios (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  pedido_id UUID NOT NULL REFERENCES empresa.pedidos(id) ON DELETE CASCADE,
  transportista TEXT, numero_seguimiento TEXT, estado TEXT NOT NULL DEFAULT 'preparando'
);
CREATE TABLE IF NOT EXISTS empresa.pagos (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  pedido_id UUID NOT NULL REFERENCES empresa.pedidos(id) ON DELETE CASCADE,
  importe NUMERIC(12,2) NOT NULL, metodo TEXT NOT NULL, estado TEXT NOT NULL DEFAULT 'pendiente',
  fecha_pago TIMESTAMPTZ, fecha_creacion TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS empresa.resenas (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  producto_id UUID NOT NULL REFERENCES empresa.productos(id) ON DELETE CASCADE,
  cliente_id UUID NOT NULL REFERENCES empresa.clientes(id) ON DELETE CASCADE,
  puntuacion INTEGER NOT NULL CHECK (puntuacion BETWEEN 1 AND 5), comentario TEXT,
  fecha_creacion TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS empresa.auditoria (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tabla TEXT NOT NULL, registro_id UUID, accion TEXT NOT NULL,
  empleado_id UUID REFERENCES empresa.empleados(id) ON DELETE SET NULL,
  fecha TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE VIEW empresa.vista_resumen_clientes AS
SELECT c.id AS cliente_id, c.nombre, c.email, COUNT(p.id) AS total_pedidos,
       COALESCE(SUM(p.total), 0) AS total_gastado, MAX(p.fecha_creacion) AS ultimo_pedido
FROM empresa.clientes c LEFT JOIN empresa.pedidos p ON p.cliente_id = c.id
GROUP BY c.id, c.nombre, c.email;

CREATE VIEW empresa.vista_stock_productos AS
SELECT pr.id AS producto_id, pr.nombre, pr.sku, cat.nombre AS categoria,
       COALESCE(i.cantidad, 0) AS cantidad
FROM empresa.productos pr
LEFT JOIN empresa.categorias cat ON cat.id = pr.categoria_id
LEFT JOIN empresa.inventario i ON i.producto_id = pr.id;

CREATE OR REPLACE FUNCTION empresa.valor_total_cliente(p_cliente_id UUID)
RETURNS NUMERIC(12,2) AS $$
  SELECT COALESCE(SUM(total), 0) FROM empresa.pedidos WHERE cliente_id = p_cliente_id;
$$ LANGUAGE sql;

-- ============================================================
--  ESQUEMA: tienda
-- ============================================================
CREATE TABLE IF NOT EXISTS tienda.organizations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(), name TEXT NOT NULL, slug TEXT UNIQUE NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS tienda.users (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES tienda.organizations(id) ON DELETE CASCADE,
  email TEXT NOT NULL, full_name TEXT, role TEXT NOT NULL DEFAULT 'member',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(), UNIQUE (organization_id, email)
);
CREATE TABLE IF NOT EXISTS tienda.customers (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES tienda.organizations(id) ON DELETE CASCADE,
  email TEXT NOT NULL, first_name TEXT, last_name TEXT, phone TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS tienda.categories (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES tienda.organizations(id) ON DELETE CASCADE,
  name TEXT NOT NULL, parent_category_id UUID REFERENCES tienda.categories(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS tienda.products (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES tienda.organizations(id) ON DELETE CASCADE,
  category_id UUID REFERENCES tienda.categories(id) ON DELETE SET NULL,
  sku TEXT NOT NULL, name TEXT NOT NULL, price NUMERIC(12,2) NOT NULL, cost NUMERIC(12,2),
  is_active BOOLEAN NOT NULL DEFAULT true, created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (organization_id, sku)
);
CREATE TABLE IF NOT EXISTS tienda.inventory (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  product_id UUID NOT NULL REFERENCES tienda.products(id) ON DELETE CASCADE,
  warehouse_location TEXT, quantity INTEGER NOT NULL DEFAULT 0, reserved_quantity INTEGER NOT NULL DEFAULT 0
);
CREATE TABLE IF NOT EXISTS tienda.orders (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES tienda.organizations(id) ON DELETE CASCADE,
  customer_id UUID NOT NULL REFERENCES tienda.customers(id) ON DELETE RESTRICT,
  user_id UUID REFERENCES tienda.users(id) ON DELETE SET NULL,
  status TEXT NOT NULL DEFAULT 'pending', total_amount NUMERIC(12,2) NOT NULL DEFAULT 0,
  tax_amount NUMERIC(12,2) NOT NULL DEFAULT 0, shipping_amount NUMERIC(12,2) NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS tienda.order_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id UUID NOT NULL REFERENCES tienda.orders(id) ON DELETE CASCADE,
  product_id UUID NOT NULL REFERENCES tienda.products(id) ON DELETE RESTRICT,
  quantity INTEGER NOT NULL, unit_price NUMERIC(12,2) NOT NULL, discount_amount NUMERIC(12,2) NOT NULL DEFAULT 0
);
CREATE TABLE IF NOT EXISTS tienda.payments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id UUID NOT NULL REFERENCES tienda.orders(id) ON DELETE CASCADE,
  amount NUMERIC(12,2) NOT NULL, provider TEXT NOT NULL, status TEXT NOT NULL DEFAULT 'pending',
  paid_at TIMESTAMPTZ
);
CREATE TABLE IF NOT EXISTS tienda.reviews (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  product_id UUID NOT NULL REFERENCES tienda.products(id) ON DELETE CASCADE,
  customer_id UUID NOT NULL REFERENCES tienda.customers(id) ON DELETE CASCADE,
  rating INTEGER NOT NULL CHECK (rating BETWEEN 1 AND 5), comment TEXT
);

-- ============================================================
--  ESQUEMA: concesionario
-- ============================================================
CREATE TABLE IF NOT EXISTS concesionario.marcas (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(), nombre TEXT NOT NULL, pais TEXT
);
CREATE TABLE IF NOT EXISTS concesionario.modelos (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  marca_id UUID NOT NULL REFERENCES concesionario.marcas(id) ON DELETE CASCADE,
  nombre TEXT NOT NULL, anio INTEGER, precio_base NUMERIC(12,2)
);
CREATE TABLE IF NOT EXISTS concesionario.vehiculos (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  modelo_id UUID NOT NULL REFERENCES concesionario.modelos(id) ON DELETE CASCADE,
  matricula TEXT UNIQUE NOT NULL, color TEXT, anio INTEGER, kilometros INTEGER,
  estado TEXT NOT NULL DEFAULT 'disponible', precio NUMERIC(12,2)
);
CREATE TABLE IF NOT EXISTS concesionario.clientes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  nombre TEXT NOT NULL, email TEXT UNIQUE, telefono TEXT, dni TEXT, ciudad TEXT
);
CREATE TABLE IF NOT EXISTS concesionario.empleados (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  nombre TEXT NOT NULL, puesto TEXT, email TEXT UNIQUE
);
CREATE TABLE IF NOT EXISTS concesionario.ventas (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  vehiculo_id UUID NOT NULL REFERENCES concesionario.vehiculos(id) ON DELETE RESTRICT,
  cliente_id UUID NOT NULL REFERENCES concesionario.clientes(id) ON DELETE RESTRICT,
  empleado_id UUID REFERENCES concesionario.empleados(id) ON DELETE SET NULL,
  fecha TIMESTAMPTZ NOT NULL DEFAULT now(), importe NUMERIC(12,2) NOT NULL, metodo_pago TEXT
);
CREATE TABLE IF NOT EXISTS concesionario.revisiones (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  vehiculo_id UUID NOT NULL REFERENCES concesionario.vehiculos(id) ON DELETE CASCADE,
  cliente_id UUID REFERENCES concesionario.clientes(id) ON DELETE SET NULL,
  fecha TIMESTAMPTZ NOT NULL DEFAULT now(), tipo TEXT, coste NUMERIC(12,2), kilometros INTEGER
);
