-- ============================================================
--  Base de datos de ejemplo: empresa de venta online
--  Todo en español. Ejecutar en el SQL Editor de Supabase.
-- ============================================================

-- Limpieza (permite volver a ejecutarlo)
DROP VIEW IF EXISTS public.vista_resumen_clientes CASCADE;
DROP VIEW IF EXISTS public.vista_stock_productos CASCADE;
DROP VIEW IF EXISTS public.vista_ingresos_categoria CASCADE;
DROP MATERIALIZED VIEW IF EXISTS public.vista_ingresos_mensuales CASCADE;
DROP FUNCTION IF EXISTS public.valor_total_cliente(UUID);
DROP FUNCTION IF EXISTS public.actualizar_stock_al_vender() CASCADE;
DROP TABLE IF EXISTS public.auditoria CASCADE;
DROP TABLE IF EXISTS public.resenas CASCADE;
DROP TABLE IF EXISTS public.pagos CASCADE;
DROP TABLE IF EXISTS public.envios CASCADE;
DROP TABLE IF EXISTS public.detalle_pedido CASCADE;
DROP TABLE IF EXISTS public.pedidos CASCADE;
DROP TABLE IF EXISTS public.inventario CASCADE;
DROP TABLE IF EXISTS public.productos CASCADE;
DROP TABLE IF EXISTS public.proveedores CASCADE;
DROP TABLE IF EXISTS public.categorias CASCADE;
DROP TABLE IF EXISTS public.clientes CASCADE;
DROP TABLE IF EXISTS public.empleados CASCADE;

-- 1. empleados
CREATE TABLE public.empleados (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  nombre TEXT NOT NULL,
  email TEXT UNIQUE NOT NULL,
  puesto TEXT NOT NULL DEFAULT 'empleado',
  salario NUMERIC(10,2),
  fecha_alta TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- 2. clientes
CREATE TABLE public.clientes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  nombre TEXT NOT NULL,
  email TEXT UNIQUE NOT NULL,
  telefono TEXT,
  ciudad TEXT,
  fecha_registro TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- 3. categorias
CREATE TABLE public.categorias (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  nombre TEXT NOT NULL,
  descripcion TEXT,
  categoria_padre_id UUID REFERENCES public.categorias(id) ON DELETE SET NULL,
  fecha_creacion TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- 4. proveedores
CREATE TABLE public.proveedores (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  nombre TEXT NOT NULL,
  contacto TEXT,
  telefono TEXT,
  pais TEXT,
  fecha_alta TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- 5. productos
CREATE TABLE public.productos (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  categoria_id UUID REFERENCES public.categorias(id) ON DELETE SET NULL,
  proveedor_id UUID REFERENCES public.proveedores(id) ON DELETE SET NULL,
  nombre TEXT NOT NULL,
  descripcion TEXT,
  sku TEXT UNIQUE NOT NULL,
  precio NUMERIC(12,2) NOT NULL,
  coste NUMERIC(12,2),
  activo BOOLEAN NOT NULL DEFAULT true,
  fecha_creacion TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- 6. inventario
CREATE TABLE public.inventario (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  producto_id UUID NOT NULL REFERENCES public.productos(id) ON DELETE CASCADE,
  almacen TEXT,
  cantidad INTEGER NOT NULL DEFAULT 0,
  cantidad_reservada INTEGER NOT NULL DEFAULT 0,
  fecha_actualizacion TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- 7. pedidos
CREATE TABLE public.pedidos (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  cliente_id UUID NOT NULL REFERENCES public.clientes(id) ON DELETE RESTRICT,
  empleado_id UUID REFERENCES public.empleados(id) ON DELETE SET NULL,
  estado TEXT NOT NULL DEFAULT 'pendiente',
  total NUMERIC(12,2) NOT NULL DEFAULT 0,
  impuestos NUMERIC(12,2) NOT NULL DEFAULT 0,
  gastos_envio NUMERIC(12,2) NOT NULL DEFAULT 0,
  fecha_creacion TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- 8. detalle_pedido
CREATE TABLE public.detalle_pedido (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  pedido_id UUID NOT NULL REFERENCES public.pedidos(id) ON DELETE CASCADE,
  producto_id UUID NOT NULL REFERENCES public.productos(id) ON DELETE RESTRICT,
  cantidad INTEGER NOT NULL,
  precio_unitario NUMERIC(12,2) NOT NULL,
  descuento NUMERIC(12,2) NOT NULL DEFAULT 0
);

-- 9. envios
CREATE TABLE public.envios (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  pedido_id UUID NOT NULL REFERENCES public.pedidos(id) ON DELETE CASCADE,
  transportista TEXT,
  numero_seguimiento TEXT,
  fecha_envio TIMESTAMPTZ,
  fecha_entrega TIMESTAMPTZ,
  estado TEXT NOT NULL DEFAULT 'preparando'
);

-- 10. pagos
CREATE TABLE public.pagos (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  pedido_id UUID NOT NULL REFERENCES public.pedidos(id) ON DELETE CASCADE,
  importe NUMERIC(12,2) NOT NULL,
  metodo TEXT NOT NULL,
  estado TEXT NOT NULL DEFAULT 'pendiente',
  fecha_pago TIMESTAMPTZ,
  fecha_creacion TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- 11. resenas
CREATE TABLE public.resenas (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  producto_id UUID NOT NULL REFERENCES public.productos(id) ON DELETE CASCADE,
  cliente_id UUID NOT NULL REFERENCES public.clientes(id) ON DELETE CASCADE,
  puntuacion INTEGER NOT NULL CHECK (puntuacion BETWEEN 1 AND 5),
  comentario TEXT,
  fecha_creacion TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- 12. auditoria
CREATE TABLE public.auditoria (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tabla TEXT NOT NULL,
  registro_id UUID,
  accion TEXT NOT NULL,
  datos_anteriores JSONB,
  datos_nuevos JSONB,
  empleado_id UUID REFERENCES public.empleados(id) ON DELETE SET NULL,
  fecha TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ============================================================
--  Vistas
-- ============================================================
CREATE OR REPLACE VIEW public.vista_resumen_clientes AS
SELECT
  c.id AS cliente_id,
  c.nombre,
  c.email,
  COUNT(p.id) AS total_pedidos,
  COALESCE(SUM(p.total), 0) AS total_gastado,
  MAX(p.fecha_creacion) AS ultimo_pedido
FROM public.clientes c
LEFT JOIN public.pedidos p ON p.cliente_id = c.id
GROUP BY c.id, c.nombre, c.email;

CREATE OR REPLACE VIEW public.vista_stock_productos AS
SELECT
  pr.id AS producto_id,
  pr.nombre,
  pr.sku,
  cat.nombre AS categoria,
  COALESCE(i.cantidad, 0) AS cantidad,
  COALESCE(i.cantidad, 0) - COALESCE(i.cantidad_reservada, 0) AS disponible
FROM public.productos pr
LEFT JOIN public.categorias cat ON cat.id = pr.categoria_id
LEFT JOIN public.inventario i ON i.producto_id = pr.id;

CREATE OR REPLACE VIEW public.vista_ingresos_categoria AS
SELECT
  cat.id AS categoria_id,
  cat.nombre AS categoria,
  SUM(dp.cantidad * dp.precio_unitario - dp.descuento) AS ingresos,
  SUM(pr.coste * dp.cantidad) AS coste_total,
  SUM(dp.cantidad * dp.precio_unitario - dp.descuento) - SUM(pr.coste * dp.cantidad) AS beneficio
FROM public.detalle_pedido dp
JOIN public.productos pr ON pr.id = dp.producto_id
JOIN public.categorias cat ON cat.id = pr.categoria_id
GROUP BY cat.id, cat.nombre;

CREATE MATERIALIZED VIEW public.vista_ingresos_mensuales AS
SELECT
  DATE_TRUNC('month', p.fecha_creacion) AS mes,
  COUNT(DISTINCT p.id) AS num_pedidos,
  SUM(p.total) AS ingresos,
  SUM(p.impuestos) AS impuestos,
  SUM(p.gastos_envio) AS envios
FROM public.pedidos p
GROUP BY DATE_TRUNC('month', p.fecha_creacion);

-- ============================================================
--  Funciones
-- ============================================================
CREATE OR REPLACE FUNCTION public.valor_total_cliente(p_cliente_id UUID)
RETURNS NUMERIC(12,2) AS $$
DECLARE
  v_total NUMERIC(12,2);
BEGIN
  SELECT COALESCE(SUM(total), 0)
  INTO v_total
  FROM public.pedidos
  WHERE cliente_id = p_cliente_id;
  RETURN v_total;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION public.actualizar_stock_al_vender()
RETURNS TRIGGER AS $$
BEGIN
  UPDATE public.inventario
  SET cantidad_reservada = cantidad_reservada + NEW.cantidad,
      fecha_actualizacion = now()
  WHERE producto_id = NEW.producto_id;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_actualizar_stock
AFTER INSERT ON public.detalle_pedido
FOR EACH ROW
EXECUTE FUNCTION public.actualizar_stock_al_vender();

-- ============================================================
--  Datos de ejemplo
-- ============================================================
INSERT INTO public.empleados (nombre, email, puesto, salario) VALUES
  ('Ana García', 'ana.garcia@empresa.com', 'administrador', 2800.00),
  ('Luis Pérez', 'luis.perez@empresa.com', 'ventas', 2200.00);

INSERT INTO public.clientes (nombre, email, telefono, ciudad) VALUES
  ('Juan López', 'juan.lopez@email.com', '600111222', 'Madrid'),
  ('María Ruiz', 'maria.ruiz@email.com', '600333444', 'Barcelona');

INSERT INTO public.proveedores (nombre, contacto, telefono, pais) VALUES
  ('TecnoSuministros S.L.', 'Carlos Díaz', '910000000', 'España');

INSERT INTO public.categorias (nombre, descripcion) VALUES
  ('Informática', 'Ordenadores y componentes'),
  ('Accesorios', 'Periféricos y accesorios');

INSERT INTO public.productos (categoria_id, proveedor_id, nombre, sku, precio, coste) VALUES
  ((SELECT id FROM public.categorias WHERE nombre='Informática'), (SELECT id FROM public.proveedores LIMIT 1), 'Portátil Pro 15', 'PORT-001', 1299.99, 900.00),
  ((SELECT id FROM public.categorias WHERE nombre='Accesorios'), (SELECT id FROM public.proveedores LIMIT 1), 'Ratón inalámbrico', 'RAT-001', 49.99, 20.00);

INSERT INTO public.inventario (producto_id, almacen, cantidad) VALUES
  ((SELECT id FROM public.productos WHERE sku='PORT-001'), 'Almacén Central', 100),
  ((SELECT id FROM public.productos WHERE sku='RAT-001'), 'Almacén Central', 500);

INSERT INTO public.pedidos (cliente_id, empleado_id, estado, total, impuestos, gastos_envio) VALUES
  ((SELECT id FROM public.clientes WHERE email='juan.lopez@email.com'), (SELECT id FROM public.empleados LIMIT 1), 'completado', 1349.98, 100.00, 0.00);

INSERT INTO public.detalle_pedido (pedido_id, producto_id, cantidad, precio_unitario) VALUES
  ((SELECT id FROM public.pedidos LIMIT 1), (SELECT id FROM public.productos WHERE sku='PORT-001'), 1, 1299.99),
  ((SELECT id FROM public.pedidos LIMIT 1), (SELECT id FROM public.productos WHERE sku='RAT-001'), 1, 49.99);

INSERT INTO public.pagos (pedido_id, importe, metodo, estado, fecha_pago) VALUES
  ((SELECT id FROM public.pedidos LIMIT 1), 1349.98, 'tarjeta', 'completado', now());

INSERT INTO public.resenas (producto_id, cliente_id, puntuacion, comentario) VALUES
  ((SELECT id FROM public.productos WHERE sku='PORT-001'), (SELECT id FROM public.clientes WHERE email='juan.lopez@email.com'), 5, 'Excelente portátil');

REFRESH MATERIALIZED VIEW public.vista_ingresos_mensuales;
