import type {
  SchemaMetadata,
  TableInfo,
  ForeignKey,
  ViewInfo,
  RoutineInfo,
} from '@/mcp/utils/postgres-inspector';

type Cols = Array<[string, string]>;

function makeTable(name: string, cols: Cols): TableInfo {
  return {
    schema: 'public',
    name,
    type: 'BASE TABLE',
    columns: cols.map(([column_name, data_type], i) => ({
      table_schema: 'public',
      table_name: name,
      column_name,
      data_type,
      is_nullable: 'YES',
      column_default: null,
      ordinal_position: i + 1,
    })),
  };
}

function fk(
  constraint_name: string,
  source_table: string,
  source_column: string,
  target_table: string,
  target_column: string
): ForeignKey {
  return {
    constraint_name,
    source_schema: 'public',
    source_table,
    source_column,
    target_schema: 'public',
    target_table,
    target_column,
  };
}

function view(name: string, definition: string): ViewInfo {
  return { schema: 'public', name, definition };
}

function routine(name: string, definition: string): RoutineInfo {
  return { schema: 'public', name, type: 'FUNCTION', return_type: null, language: 'plpgsql', definition };
}

export interface DatabasePreset {
  id: string;
  label: string;
  description: string;
  schema: SchemaMetadata;
  suggestions: string[];
}

/* ------------------------------------------------------------------ */
/* 1. Empresa (coincide exactamente con supabase/seed.sql)             */
/* ------------------------------------------------------------------ */
const empresa: DatabasePreset = {
  id: 'empresa',
  label: 'Empresa',
  description: 'Tienda: clientes, productos, pedidos y pagos.',
  schema: {
    tables: [
      makeTable('empleados', [['id', 'uuid'], ['nombre', 'text'], ['email', 'text'], ['puesto', 'text'], ['salario', 'numeric'], ['fecha_alta', 'timestamptz']]),
      makeTable('clientes', [['id', 'uuid'], ['nombre', 'text'], ['email', 'text'], ['telefono', 'text'], ['ciudad', 'text'], ['fecha_registro', 'timestamptz']]),
      makeTable('categorias', [['id', 'uuid'], ['nombre', 'text'], ['descripcion', 'text'], ['categoria_padre_id', 'uuid'], ['fecha_creacion', 'timestamptz']]),
      makeTable('proveedores', [['id', 'uuid'], ['nombre', 'text'], ['contacto', 'text'], ['telefono', 'text'], ['pais', 'text'], ['fecha_alta', 'timestamptz']]),
      makeTable('productos', [['id', 'uuid'], ['categoria_id', 'uuid'], ['proveedor_id', 'uuid'], ['nombre', 'text'], ['sku', 'text'], ['precio', 'numeric'], ['coste', 'numeric'], ['activo', 'boolean'], ['fecha_creacion', 'timestamptz']]),
      makeTable('inventario', [['id', 'uuid'], ['producto_id', 'uuid'], ['almacen', 'text'], ['cantidad', 'integer'], ['cantidad_reservada', 'integer'], ['fecha_actualizacion', 'timestamptz']]),
      makeTable('pedidos', [['id', 'uuid'], ['cliente_id', 'uuid'], ['empleado_id', 'uuid'], ['estado', 'text'], ['total', 'numeric'], ['impuestos', 'numeric'], ['gastos_envio', 'numeric'], ['fecha_creacion', 'timestamptz']]),
      makeTable('detalle_pedido', [['id', 'uuid'], ['pedido_id', 'uuid'], ['producto_id', 'uuid'], ['cantidad', 'integer'], ['precio_unitario', 'numeric'], ['descuento', 'numeric']]),
      makeTable('envios', [['id', 'uuid'], ['pedido_id', 'uuid'], ['transportista', 'text'], ['numero_seguimiento', 'text'], ['estado', 'text']]),
      makeTable('pagos', [['id', 'uuid'], ['pedido_id', 'uuid'], ['importe', 'numeric'], ['metodo', 'text'], ['estado', 'text'], ['fecha_pago', 'timestamptz']]),
      makeTable('resenas', [['id', 'uuid'], ['producto_id', 'uuid'], ['cliente_id', 'uuid'], ['puntuacion', 'integer'], ['comentario', 'text']]),
      makeTable('auditoria', [['id', 'uuid'], ['tabla', 'text'], ['registro_id', 'uuid'], ['accion', 'text'], ['empleado_id', 'uuid'], ['fecha', 'timestamptz']]),
    ],
    views: [
      view('vista_resumen_clientes', 'SELECT c.id, c.email, count(p.id) AS total FROM clientes c LEFT JOIN pedidos p ON p.cliente_id = c.id'),
      view('vista_stock_productos', 'SELECT pr.id, pr.nombre, i.cantidad FROM productos pr LEFT JOIN inventario i ON i.producto_id = pr.id'),
      view('vista_ingresos_categoria', 'SELECT cat.id, sum(dp.cantidad * dp.precio_unitario) FROM detalle_pedido dp JOIN productos pr ON pr.id = dp.producto_id JOIN categorias cat ON cat.id = pr.categoria_id'),
    ],
    routines: [
      routine('valor_total_cliente', 'SELECT sum(total) FROM pedidos WHERE cliente_id = p_cliente_id'),
      routine('actualizar_stock_al_vender', 'UPDATE inventario SET cantidad_reservada = cantidad_reservada + NEW.cantidad WHERE producto_id = NEW.producto_id'),
    ],
    foreignKeys: [
      fk('fk_categorias_padre', 'categorias', 'categoria_padre_id', 'categorias', 'id'),
      fk('fk_productos_categoria', 'productos', 'categoria_id', 'categorias', 'id'),
      fk('fk_productos_proveedor', 'productos', 'proveedor_id', 'proveedores', 'id'),
      fk('fk_inventario_producto', 'inventario', 'producto_id', 'productos', 'id'),
      fk('fk_pedidos_cliente', 'pedidos', 'cliente_id', 'clientes', 'id'),
      fk('fk_pedidos_empleado', 'pedidos', 'empleado_id', 'empleados', 'id'),
      fk('fk_detalle_pedido_pedido', 'detalle_pedido', 'pedido_id', 'pedidos', 'id'),
      fk('fk_detalle_pedido_producto', 'detalle_pedido', 'producto_id', 'productos', 'id'),
      fk('fk_envios_pedido', 'envios', 'pedido_id', 'pedidos', 'id'),
      fk('fk_pagos_pedido', 'pagos', 'pedido_id', 'pedidos', 'id'),
      fk('fk_resenas_producto', 'resenas', 'producto_id', 'productos', 'id'),
      fk('fk_resenas_cliente', 'resenas', 'cliente_id', 'clientes', 'id'),
      fk('fk_auditoria_empleado', 'auditoria', 'empleado_id', 'empleados', 'id'),
    ],
    primaryKeys: [],
  },
  suggestions: [
    '¿Qué pasa si borro la columna cliente_id de pedidos?',
    '¿Qué se rompe si elimino la columna email de clientes?',
    '¿Qué impacto tiene borrar producto_id de detalle_pedido?',
    '¿Qué ocurre si elimino la columna categoria_id de productos?',
    '¿Qué pasa si borro empleado_id de pedidos?',
    '¿Qué se rompe si elimino la columna pedido_id de pagos?',
    '¿Qué impacto tiene borrar precio de productos?',
    '¿Qué pasa si borro cantidad de inventario?',
    '¿Y si elimino proveedor_id de productos?',
    '¿Qué se rompe si elimino la tabla productos?',
    '¿Qué pasa si elimino la tabla pedidos?',
    '¿Qué impacto tiene borrar la tabla clientes?',
    '¿Qué se rompe si elimino la tabla empleados?',
    '¿Y si elimino la tabla categorias?',
    '¿Qué ocurre si elimino la tabla detalle_pedido?',
    '¿Qué pasa si renombro precio en productos?',
    '¿Qué impacto tiene renombrar email en clientes?',
    '¿Y si renombro total en pedidos?',
    '¿Qué se rompe si renombro cliente_id en pedidos?',
    '¿Quién depende de la columna email de clientes?',
    '¿Qué depende de la tabla clientes?',
    '¿Quién usa la columna cliente_id de pedidos?',
    '¿Qué vistas dependen de la tabla pedidos?',
    '¿Qué depende de la columna producto_id de detalle_pedido?',
    '¿Qué tablas hay en la base de datos?',
    '¿Qué columnas tiene la tabla pedidos?',
    '¿Cuántas vistas hay en el esquema?',
    '¿Qué tablas tienen claves foráneas?',
  ],
};

/* ------------------------------------------------------------------ */
/* 2. Tienda online (la base de datos original en inglés)              */
/* ------------------------------------------------------------------ */
const tiendaOnline: DatabasePreset = {
  id: 'tienda-online',
  label: 'Tienda online',
  description: 'Clientes, productos, pedidos y pagos (inglés).',
  schema: {
    tables: [
      makeTable('organizations', [['id', 'uuid'], ['name', 'text'], ['slug', 'text'], ['created_at', 'timestamptz']]),
      makeTable('users', [['id', 'uuid'], ['organization_id', 'uuid'], ['email', 'text'], ['full_name', 'text'], ['role', 'text'], ['created_at', 'timestamptz']]),
      makeTable('customers', [['id', 'uuid'], ['organization_id', 'uuid'], ['email', 'text'], ['first_name', 'text'], ['last_name', 'text'], ['phone', 'text'], ['created_at', 'timestamptz']]),
      makeTable('categories', [['id', 'uuid'], ['organization_id', 'uuid'], ['name', 'text'], ['parent_category_id', 'uuid'], ['created_at', 'timestamptz']]),
      makeTable('products', [['id', 'uuid'], ['organization_id', 'uuid'], ['category_id', 'uuid'], ['sku', 'text'], ['name', 'text'], ['price', 'numeric'], ['cost', 'numeric'], ['is_active', 'boolean'], ['created_at', 'timestamptz']]),
      makeTable('inventory', [['id', 'uuid'], ['product_id', 'uuid'], ['warehouse_location', 'text'], ['quantity', 'integer'], ['reserved_quantity', 'integer']]),
      makeTable('orders', [['id', 'uuid'], ['organization_id', 'uuid'], ['customer_id', 'uuid'], ['user_id', 'uuid'], ['status', 'text'], ['total_amount', 'numeric'], ['tax_amount', 'numeric'], ['shipping_amount', 'numeric'], ['created_at', 'timestamptz']]),
      makeTable('order_items', [['id', 'uuid'], ['order_id', 'uuid'], ['product_id', 'uuid'], ['quantity', 'integer'], ['unit_price', 'numeric'], ['discount_amount', 'numeric']]),
      makeTable('shipments', [['id', 'uuid'], ['order_id', 'uuid'], ['tracking_number', 'text'], ['carrier', 'text'], ['status', 'text']]),
      makeTable('payments', [['id', 'uuid'], ['order_id', 'uuid'], ['amount', 'numeric'], ['provider', 'text'], ['status', 'text'], ['paid_at', 'timestamptz']]),
      makeTable('reviews', [['id', 'uuid'], ['product_id', 'uuid'], ['customer_id', 'uuid'], ['rating', 'integer'], ['comment', 'text']]),
      makeTable('audit_logs', [['id', 'uuid'], ['table_name', 'text'], ['record_id', 'uuid'], ['action', 'text'], ['performed_by', 'uuid'], ['performed_at', 'timestamptz']]),
    ],
    views: [
      view('vw_customer_order_summary', 'SELECT c.id, c.email, count(o.id) AS total FROM customers c LEFT JOIN orders o ON o.customer_id = c.id'),
      view('vw_product_inventory', 'SELECT p.id, p.name, i.quantity FROM products p LEFT JOIN inventory i ON i.product_id = p.id'),
      view('vw_revenue_by_category', 'SELECT cat.id, sum(oi.quantity * oi.unit_price) FROM order_items oi JOIN products p ON p.id = oi.product_id JOIN categories cat ON cat.id = p.category_id'),
    ],
    routines: [
      routine('fn_get_customer_lifetime_value', 'SELECT sum(total_amount) FROM orders WHERE customer_id = p_customer_id'),
      routine('fn_update_inventory_after_order', 'UPDATE inventory SET reserved_quantity = reserved_quantity + NEW.quantity WHERE product_id = NEW.product_id'),
    ],
    foreignKeys: [
      fk('fk_users_org', 'users', 'organization_id', 'organizations', 'id'),
      fk('fk_customers_org', 'customers', 'organization_id', 'organizations', 'id'),
      fk('fk_categories_org', 'categories', 'organization_id', 'organizations', 'id'),
      fk('fk_categories_parent', 'categories', 'parent_category_id', 'categories', 'id'),
      fk('fk_products_org', 'products', 'organization_id', 'organizations', 'id'),
      fk('fk_products_cat', 'products', 'category_id', 'categories', 'id'),
      fk('fk_inventory_product', 'inventory', 'product_id', 'products', 'id'),
      fk('fk_orders_org', 'orders', 'organization_id', 'organizations', 'id'),
      fk('fk_orders_customer', 'orders', 'customer_id', 'customers', 'id'),
      fk('fk_orders_user', 'orders', 'user_id', 'users', 'id'),
      fk('fk_order_items_order', 'order_items', 'order_id', 'orders', 'id'),
      fk('fk_order_items_product', 'order_items', 'product_id', 'products', 'id'),
      fk('fk_shipments_order', 'shipments', 'order_id', 'orders', 'id'),
      fk('fk_payments_order', 'payments', 'order_id', 'orders', 'id'),
      fk('fk_reviews_product', 'reviews', 'product_id', 'products', 'id'),
      fk('fk_reviews_customer', 'reviews', 'customer_id', 'customers', 'id'),
      fk('fk_audit_user', 'audit_logs', 'performed_by', 'users', 'id'),
    ],
    primaryKeys: [],
  },
  suggestions: [
    '¿Qué pasa si borro la columna customer_id de orders?',
    '¿Qué se rompe si elimino la columna email de users?',
    '¿Qué impacto tiene borrar product_id de order_items?',
    '¿Qué ocurre si elimino la columna category_id de products?',
    '¿Qué pasa si borro user_id de orders?',
    '¿Qué se rompe si elimino la columna order_id de payments?',
    '¿Qué impacto tiene borrar price de products?',
    '¿Qué pasa si borro quantity de inventory?',
    '¿Y si elimino organization_id de products?',
    '¿Qué se rompe si elimino la tabla products?',
    '¿Qué pasa si elimino la tabla orders?',
    '¿Qué impacto tiene borrar la tabla customers?',
    '¿Qué se rompe si elimino la tabla users?',
    '¿Y si elimino la tabla categories?',
    '¿Qué ocurre si elimino la tabla order_items?',
    '¿Qué pasa si renombro price en products?',
    '¿Qué impacto tiene renombrar email en users?',
    '¿Y si renombro total_amount en orders?',
    '¿Qué se rompe si renombro customer_id en orders?',
    '¿Quién depende de la columna email de users?',
    '¿Qué depende de la tabla customers?',
    '¿Quién usa la columna customer_id de orders?',
    '¿Qué vistas dependen de la tabla orders?',
    '¿Qué depende de la columna product_id de order_items?',
    '¿Qué tablas hay en la base de datos?',
    '¿Qué columnas tiene la tabla orders?',
    '¿Cuántas vistas hay en el esquema?',
    '¿Qué tablas tienen claves foráneas?',
  ],
};

/* ------------------------------------------------------------------ */
/* 3. Concesionario                                                    */
/* ------------------------------------------------------------------ */
const concesionario: DatabasePreset = {
  id: 'concesionario',
  label: 'Concesionario',
  description: 'Vehículos, ventas, revisiones y clientes.',
  schema: {
    tables: [
      makeTable('marcas', [['id', 'uuid'], ['nombre', 'text'], ['pais', 'text']]),
      makeTable('modelos', [['id', 'uuid'], ['marca_id', 'uuid'], ['nombre', 'text'], ['anio', 'integer'], ['precio_base', 'numeric']]),
      makeTable('vehiculos', [['id', 'uuid'], ['modelo_id', 'uuid'], ['matricula', 'text'], ['color', 'text'], ['anio', 'integer'], ['kilometros', 'integer'], ['estado', 'text'], ['precio', 'numeric']]),
      makeTable('clientes', [['id', 'uuid'], ['nombre', 'text'], ['email', 'text'], ['telefono', 'text'], ['dni', 'text'], ['ciudad', 'text']]),
      makeTable('empleados', [['id', 'uuid'], ['nombre', 'text'], ['puesto', 'text'], ['email', 'text']]),
      makeTable('ventas', [['id', 'uuid'], ['vehiculo_id', 'uuid'], ['cliente_id', 'uuid'], ['empleado_id', 'uuid'], ['fecha', 'timestamptz'], ['importe', 'numeric'], ['metodo_pago', 'text']]),
      makeTable('revisiones', [['id', 'uuid'], ['vehiculo_id', 'uuid'], ['cliente_id', 'uuid'], ['fecha', 'timestamptz'], ['tipo', 'text'], ['coste', 'numeric'], ['kilometros', 'integer']]),
      makeTable('proveedores', [['id', 'uuid'], ['nombre', 'text'], ['contacto', 'text'], ['telefono', 'text']]),
    ],
    views: [
      view('vista_ventas_marca', 'SELECT m.id, m.nombre, count(v.id) FROM marcas m LEFT JOIN modelos mo ON mo.marca_id = m.id LEFT JOIN vehiculos ve ON ve.modelo_id = mo.id LEFT JOIN ventas v ON v.vehiculo_id = ve.id'),
      view('vista_revisiones_vehiculo', 'SELECT ve.id, ve.matricula, count(r.id) FROM vehiculos ve LEFT JOIN revisiones r ON r.vehiculo_id = ve.id'),
    ],
    routines: [
      routine('total_gastado_cliente', 'SELECT sum(importe) FROM ventas WHERE cliente_id = p_cliente_id'),
      routine('historial_revisiones', 'SELECT count(*) FROM revisiones WHERE vehiculo_id = p_vehiculo_id'),
    ],
    foreignKeys: [
      fk('fk_modelos_marca', 'modelos', 'marca_id', 'marcas', 'id'),
      fk('fk_vehiculos_modelo', 'vehiculos', 'modelo_id', 'modelos', 'id'),
      fk('fk_ventas_vehiculo', 'ventas', 'vehiculo_id', 'vehiculos', 'id'),
      fk('fk_ventas_cliente', 'ventas', 'cliente_id', 'clientes', 'id'),
      fk('fk_ventas_empleado', 'ventas', 'empleado_id', 'empleados', 'id'),
      fk('fk_revisiones_vehiculo', 'revisiones', 'vehiculo_id', 'vehiculos', 'id'),
      fk('fk_revisiones_cliente', 'revisiones', 'cliente_id', 'clientes', 'id'),
    ],
    primaryKeys: [],
  },
  suggestions: [
    '¿Qué pasa si borro la columna modelo_id de vehiculos?',
    '¿Qué se rompe si elimino la columna marca_id de modelos?',
    '¿Qué impacto tiene borrar vehiculo_id de ventas?',
    '¿Qué ocurre si elimino la columna cliente_id de ventas?',
    '¿Qué pasa si borro empleado_id de ventas?',
    '¿Qué se rompe si elimino la columna vehiculo_id de revisiones?',
    '¿Qué impacto tiene borrar precio de vehiculos?',
    '¿Qué pasa si borro kilometros de vehiculos?',
    '¿Y si elimino dni de clientes?',
    '¿Qué se rompe si elimino la tabla vehiculos?',
    '¿Qué pasa si elimino la tabla ventas?',
    '¿Qué impacto tiene borrar la tabla clientes?',
    '¿Qué se rompe si elimino la tabla modelos?',
    '¿Y si elimino la tabla marcas?',
    '¿Qué ocurre si elimino la tabla revisiones?',
    '¿Qué pasa si renombro precio en vehiculos?',
    '¿Qué impacto tiene renombrar email en clientes?',
    '¿Y si renombro importe en ventas?',
    '¿Qué se rompe si renombro modelo_id en vehiculos?',
    '¿Quién depende de la columna vehiculo_id de ventas?',
    '¿Qué depende de la tabla modelos?',
    '¿Quién usa la columna marca_id de modelos?',
    '¿Qué vistas dependen de la tabla ventas?',
    '¿Qué depende de la columna cliente_id de clientes?',
    '¿Qué tablas hay en la base de datos?',
    '¿Qué columnas tiene la tabla vehiculos?',
    '¿Cuántas vistas hay en el esquema?',
    '¿Qué tablas tienen claves foráneas?',
  ],
};

export const DATABASE_PRESETS: DatabasePreset[] = [empresa, tiendaOnline, concesionario];
