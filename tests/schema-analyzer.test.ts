import { test } from 'node:test';
import assert from 'node:assert/strict';

import {
  containsIdentifier,
  parseDdlTarget,
  predictImpact,
  traceLineage,
  normalizeSchema,
  findColumnByName,
} from '../src/mcp/utils/schema-analyzer';
import type { SchemaMetadata, ColumnInfo } from '../src/mcp/utils/postgres-inspector';

function col(name: string): ColumnInfo {
  return {
    table_schema: 'public',
    table_name: 't',
    column_name: name,
    data_type: 'text',
    is_nullable: 'YES',
    column_default: null,
    ordinal_position: 1,
  };
}

const schema: SchemaMetadata = {
  version: 1,
  tables: [
    { schema: 'public', name: 'clientes', type: 'BASE TABLE', columns: [col('id'), col('email')] },
    { schema: 'public', name: 'pedidos', type: 'BASE TABLE', columns: [col('id'), col('cliente_id')] },
    { schema: 'public', name: 'lineas', type: 'BASE TABLE', columns: [col('id'), col('pedido_id')] },
  ],
  views: [
    { schema: 'public', name: 'v_pedidos', definition: 'SELECT * FROM pedidos' },
    { schema: 'public', name: 'v_pedidos_resumen', definition: 'SELECT * FROM v_pedidos' },
  ],
  routines: [
    {
      schema: 'public',
      name: 'fn_total',
      type: 'FUNCTION',
      return_type: null,
      language: 'plpgsql',
      definition: 'SELECT sum(total) FROM pedidos',
    },
  ],
  foreignKeys: [
    {
      constraint_name: 'fk_pedidos_clientes',
      source_schema: 'public',
      source_table: 'pedidos',
      source_column: 'cliente_id',
      target_schema: 'public',
      target_table: 'clientes',
      target_column: 'id',
      on_delete: 'CASCADE',
    },
    {
      constraint_name: 'fk_lineas_pedidos',
      source_schema: 'public',
      source_table: 'lineas',
      source_column: 'pedido_id',
      target_schema: 'public',
      target_table: 'pedidos',
      target_column: 'id',
      on_delete: 'CASCADE',
    },
  ],
  primaryKeys: [
    { constraint_name: 'pk_clientes', schema: 'public', table: 'clientes', columns: ['id'] },
    { constraint_name: 'pk_pedidos', schema: 'public', table: 'pedidos', columns: ['id'] },
  ],
  indexes: [
    {
      schema: 'public',
      table: 'clientes',
      name: 'clientes_email_key',
      columns: ['email'],
      is_unique: true,
      is_primary: false,
    },
  ],
};

test('containsIdentifier matches whole identifiers only', () => {
  assert.equal(containsIdentifier('select * from pedidos', 'pedidos'), true);
  assert.equal(containsIdentifier('pedido_id', 'pedido'), false);
  assert.equal(containsIdentifier('FROM "pedidos"', 'pedidos'), true);
  assert.equal(containsIdentifier('', 'pedidos'), false);
  assert.equal(containsIdentifier('pedidos', ''), false);
});

test('parseDdlTarget covers legacy and new actions', () => {
  assert.deepEqual(parseDdlTarget('ALTER TABLE pedidos DROP COLUMN cliente_id'), {
    action: 'drop_column',
    schemaName: undefined,
    tableName: 'pedidos',
    columnName: 'cliente_id',
  });

  assert.equal(parseDdlTarget('DROP TABLE IF EXISTS public.pedidos')?.action, 'drop_table');
  assert.equal(
    parseDdlTarget('ALTER TABLE pedidos RENAME TO ordenes')?.newTableName,
    'ordenes'
  );
  assert.equal(
    parseDdlTarget('ALTER TABLE pedidos ALTER COLUMN estado TYPE varchar(20)')?.action,
    'alter_column_type'
  );
  assert.equal(
    parseDdlTarget('ALTER TABLE pedidos ALTER COLUMN estado SET NOT NULL')?.action,
    'set_not_null'
  );
  assert.equal(
    parseDdlTarget('ALTER TABLE pedidos ALTER COLUMN estado DROP NOT NULL')?.action,
    'drop_not_null'
  );
  assert.equal(parseDdlTarget('ALTER TABLE pedidos ADD COLUMN nota text')?.action, 'add_column');
  assert.equal(
    parseDdlTarget('ALTER TABLE pedidos DROP CONSTRAINT fk_pedidos_clientes')?.action,
    'drop_constraint'
  );
  assert.equal(
    parseDdlTarget('ALTER TABLE pedidos DROP CONSTRAINT pk_pedidos PRIMARY KEY')?.action,
    'drop_primary_key'
  );
  assert.equal(parseDdlTarget('DROP INDEX clientes_email_key')?.indexName, 'clientes_email_key');
  assert.equal(parseDdlTarget('TRUNCATE TABLE pedidos')?.action, 'truncate_table');
});

test('parseDdlTarget does not treat ADD CONSTRAINT as a column', () => {
  const parsed = parseDdlTarget('ALTER TABLE pedidos ADD CONSTRAINT fk CHECK (id > 0)');
  assert.notEqual(parsed?.action, 'add_column');
});

test('traceLineage is transitive and keeps the parent link', () => {
  const nodes = traceLineage(schema, 'clientes', 'id');
  const names = nodes.map((n) => `${n.schema}.${n.table}`);

  assert.ok(names.includes('public.pedidos'));
  assert.ok(names.includes('public.v_pedidos'));
  assert.ok(names.includes('public.v_pedidos_resumen'), 'second-level view should be reachable');

  const secondLevel = nodes.find((n) => n.table === 'v_pedidos_resumen');
  assert.equal(secondLevel?.via, 'public.v_pedidos');

  const origin = nodes.find((n) => n.relation === 'origin');
  assert.equal(origin?.table, 'clientes');
});

test('predictImpact flags not-found targets', () => {
  const impact = predictImpact(schema, 'DROP TABLE noexiste');
  assert.equal(impact.notFound, true);
  assert.equal(impact.risk, 'LOW');
});

test('predictImpact weights risk by object type and cascades', () => {
  const dropPedidos = predictImpact(schema, 'DROP TABLE pedidos');
  assert.equal(dropPedidos.risk, 'HIGH');

  const dropClientes = predictImpact(schema, 'DROP TABLE clientes');
  assert.notEqual(dropClientes.risk, 'LOW');
  assert.ok(dropClientes.affectedObjects.some((o) => o.name === 'pedidos'));

  const dropEmail = predictImpact(schema, 'ALTER TABLE clientes DROP COLUMN email');
  assert.equal(dropEmail.risk, 'LOW');
  assert.equal(dropEmail.affectedObjects.length, 0);
});

test('predictImpact handles primary key and index drops', () => {
  const dropPk = predictImpact(schema, 'ALTER TABLE pedidos DROP CONSTRAINT pk_pedidos PRIMARY KEY');
  assert.equal(dropPk.risk, 'HIGH');

  const dropIndex = predictImpact(schema, 'DROP INDEX clientes_email_key');
  assert.equal(dropIndex.risk, 'MEDIUM');
  assert.equal(dropIndex.affectedObjects[0]?.type, 'index');
});

test('normalizeSchema fills contract defaults', () => {
  const normalized = normalizeSchema({
    tables: [],
    views: [],
    routines: [],
    foreignKeys: [],
    primaryKeys: [],
  });
  assert.ok(normalized);
  assert.equal(normalized?.version, 1);
  assert.deepEqual(normalized?.indexes, []);
  assert.equal(normalizeSchema({ tables: [] }), null);
});

test('findColumnByName is schema-insensitive to casing', () => {
  assert.ok(findColumnByName(schema, 'Clientes', 'EMAIL'));
  assert.equal(findColumnByName(schema, 'clientes', 'nope'), undefined);
});
