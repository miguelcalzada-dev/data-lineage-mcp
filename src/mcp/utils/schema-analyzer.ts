import type {
  SchemaMetadata,
  TableInfo,
  ColumnInfo,
  LineageNode,
  DdlImpact,
  AffectedObject,
  IndexInfo,
  ForeignKey,
  ViewInfo,
  RoutineInfo,
} from '@/mcp/utils/postgres-inspector';
import { SCHEMA_CONTRACT_VERSION } from './schema-contract';
import type { GraphDefinition, GraphNode, GraphEdge } from '@/mcp/tools/generate-graph';

const MAX_LINEAGE_DEPTH = 5;

const RISK_WEIGHTS: Record<AffectedObject['type'], number> = {
  routine: 3,
  foreign_key: 3,
  view: 2,
  table: 2,
  column: 1,
  index: 1,
  constraint: 1,
};

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

export function containsIdentifier(text: string, identifier: string): boolean {
  if (!identifier) return false;
  const needle = identifier.toLowerCase();
  const pattern = new RegExp(`(^|[^a-z0-9_])${escapeRegExp(needle)}([^a-z0-9_]|$)`);
  return pattern.test(text.toLowerCase());
}

const TABLE_REFERENCE_RE = /\b(?:from|join|update|into|table)\s+((?:"[^"]+"|[\w$]+)(?:\s*\.\s*(?:"[^"]+"|[\w$]+))?)/gi;

export function sanitizeSql(sql: string): string {
  return sql
    .replace(/\$([A-Za-z0-9_]*)\$[\s\S]*?\$\1\$/g, ' ')
    .replace(/'(?:[^']|'')*'/g, ' ')
    .replace(/--[^\n]*/g, ' ')
    .replace(/\/\*[\s\S]*?\*\//g, ' ');
}

export function referencedTables(sql: string): string[] {
  const text = sanitizeSql(sql);
  const found = new Set<string>();
  const re = new RegExp(TABLE_REFERENCE_RE.source, 'gi');
  let match: RegExpExecArray | null;
  while ((match = re.exec(text)) !== null) {
    const parts = match[1]
      .replace(/"/g, '')
      .split('.')
      .map((part) => part.trim().toLowerCase())
      .filter(Boolean);
    if (parts.length > 0) found.add(parts[parts.length - 1]);
  }
  return Array.from(found);
}

function definitionReferences(
  definition: string | null | undefined,
  table: string,
  column?: string
): boolean {
  const text = sanitizeSql(definition ?? '');
  if (!text) return false;
  if (!containsIdentifier(text, table)) return false;
  if (column && !containsIdentifier(text, column)) return false;
  return true;
}

function nodeKey(schema: string, table: string): string {
  return `${schema}.${table}`;
}

export function findTableByName(schema: SchemaMetadata, tableName: string): TableInfo | undefined {
  const lower = tableName.toLowerCase();
  return schema.tables.find((t) => t.name.toLowerCase() === lower);
}

export function findColumnByName(
  schema: SchemaMetadata,
  tableName: string,
  columnName: string
): ColumnInfo | undefined {
  const table = findTableByName(schema, tableName);
  if (!table) return undefined;
  const lower = columnName.toLowerCase();
  return table.columns.find((c) => c.column_name.toLowerCase() === lower);
}

export function traceLineage(
  schema: SchemaMetadata,
  tableName: string,
  columnName: string,
  schemaName = 'public'
): LineageNode[] {
  const originTable = findTableByName(schema, tableName);
  const resolvedSchema = originTable?.schema ?? schemaName ?? 'public';

  const origin: LineageNode = {
    schema: resolvedSchema,
    table: originTable?.name ?? tableName,
    column: columnName,
    kind: 'table',
    relation: 'origin',
    depth: 0,
  };

  const nodes: LineageNode[] = [origin];
  const visited = new Set<string>([nodeKey(origin.schema, origin.table)]);
  const queue: Array<{ schema: string; table: string; column?: string; depth: number }> = [
    { schema: origin.schema, table: origin.table, column: columnName, depth: 0 },
  ];

  while (queue.length > 0) {
    const current = queue.shift()!;
    if (current.depth >= MAX_LINEAGE_DEPTH) continue;

    const lowerTable = current.table.toLowerCase();
    const lowerColumn = current.depth === 0 ? current.column?.toLowerCase() : undefined;
    const via = nodeKey(current.schema, current.table);

    for (const fk of schema.foreignKeys) {
      if (fk.target_table.toLowerCase() !== lowerTable) continue;
      if (lowerColumn && fk.target_column.toLowerCase() !== lowerColumn) continue;
      const key = nodeKey(fk.source_schema, fk.source_table);
      if (visited.has(key)) continue;
      visited.add(key);
      nodes.push({
        schema: fk.source_schema,
        table: fk.source_table,
        column: fk.source_column,
        kind: 'foreign_key',
        relation: 'child_foreign_key',
        via,
        depth: current.depth + 1,
      });
      queue.push({ schema: fk.source_schema, table: fk.source_table, depth: current.depth + 1 });
    }

    for (const view of schema.views) {
      if (!definitionReferences(view.definition, lowerTable, lowerColumn)) continue;
      const key = nodeKey(view.schema, view.name);
      if (visited.has(key)) continue;
      visited.add(key);
      nodes.push({
        schema: view.schema,
        table: view.name,
        column: '*',
        kind: 'view',
        relation: 'dependent_view',
        via,
        depth: current.depth + 1,
      });
      queue.push({ schema: view.schema, table: view.name, depth: current.depth + 1 });
    }

    for (const routine of schema.routines) {
      if (!definitionReferences(routine.definition, lowerTable, lowerColumn)) continue;
      const key = nodeKey(routine.schema, routine.name);
      if (visited.has(key)) continue;
      visited.add(key);
      nodes.push({
        schema: routine.schema,
        table: routine.name,
        column: '*',
        kind: 'routine',
        relation: 'dependent_routine',
        via,
        depth: current.depth + 1,
      });
      queue.push({ schema: routine.schema, table: routine.name, depth: current.depth + 1 });
    }
  }

  return nodes;
}

function isCascade(fk: { on_delete?: string | null }): boolean {
  const rule = (fk.on_delete ?? '').toUpperCase();
  return rule === 'CASCADE' || rule === 'SET NULL' || rule === 'SET DEFAULT';
}

function computeRisk(
  affected: AffectedObject[],
  context: { cascades?: boolean; dropsPrimaryKey?: boolean } = {}
): 'HIGH' | 'MEDIUM' | 'LOW' {
  if (affected.length === 0 && !context.cascades && !context.dropsPrimaryKey) {
    return 'LOW';
  }

  let score = affected.reduce((sum, obj) => sum + (RISK_WEIGHTS[obj.type] ?? 1), 0);
  if (context.cascades) score += 2;
  if (context.dropsPrimaryKey) score += 3;

  if (score >= 6) return 'HIGH';
  return 'MEDIUM';
}

export function assessRisk(affected: AffectedObject[]): 'HIGH' | 'MEDIUM' | 'LOW' {
  return computeRisk(affected, {});
}

function collectTableDependents(
  schema: SchemaMetadata,
  targetTable: TableInfo,
  affectedObjects: AffectedObject[]
): void {
  const lowerTable = targetTable.name.toLowerCase();

  for (const fk of schema.foreignKeys) {
    if (fk.target_table.toLowerCase() === lowerTable) {
      affectedObjects.push({
        type: 'foreign_key',
        schema: fk.source_schema,
        name: fk.source_table,
        detail: `Clave foránea hacia la tabla ${targetTable.name}`,
      });
    }
  }

  for (const view of schema.views) {
    if (definitionReferences(view.definition, lowerTable)) {
      affectedObjects.push({
        type: 'view',
        schema: view.schema,
        name: view.name,
        detail: `La vista usa la tabla ${targetTable.name}`,
      });
    }
  }

  for (const routine of schema.routines) {
    if (definitionReferences(routine.definition, lowerTable)) {
      affectedObjects.push({
        type: 'routine',
        schema: routine.schema,
        name: routine.name,
        detail: `La función usa la tabla ${targetTable.name}`,
      });
    }
  }
}

export function predictImpact(schema: SchemaMetadata, ddlStatement: string): DdlImpact {
  const normalized = ddlStatement.replace(/\s+/g, ' ').trim();
  const parsed = parseDdlTarget(normalized);
  if (!parsed) {
    return {
      risk: 'LOW',
      summary: 'No se pudo interpretar la sentencia. Sin impacto estructural detectado.',
      affectedObjects: [],
    };
  }

  const schemaName = parsed.schemaName ?? 'public';

  if (parsed.action === 'drop_index') {
    return predictDropIndex(schema, parsed);
  }

  const tableName = parsed.tableName;
  if (!tableName) {
    return {
      risk: 'LOW',
      summary: 'No se pudo identificar la tabla objetivo de la sentencia.',
      affectedObjects: [],
    };
  }

  const targetTable = findTableByName(schema, tableName);
  if (!targetTable) {
    return {
      risk: 'LOW',
      summary: `La tabla "${tableName}" no existe en el esquema seleccionado, así que la operación "${parsed.action}" no tiene ningún efecto.`,
      affectedObjects: [],
      notFound: true,
      target: { schema: schemaName, table: tableName, column: parsed.columnName ?? '*' },
    };
  }

  const resolvedSchemaName = targetTable.schema || schemaName;
  const affectedObjects: AffectedObject[] = [];
  let cascades = false;
  let dropsPrimaryKey = false;

  const columnActions: ParsedDdl['action'][] = [
    'drop_column',
    'alter_column',
    'alter_column_type',
    'set_not_null',
    'drop_not_null',
    'rename_column',
  ];

  if (columnActions.includes(parsed.action) && parsed.columnName) {
    if (!findColumnByName(schema, tableName, parsed.columnName)) {
      return {
        risk: 'LOW',
        summary: `La columna "${parsed.columnName}" no existe en la tabla "${targetTable.name}", así que la operación "${parsed.action}" no tiene ningún efecto.`,
        affectedObjects: [],
        notFound: true,
        target: { schema: resolvedSchemaName, table: targetTable.name, column: parsed.columnName },
      };
    }
  }

  switch (parsed.action) {
    case 'drop_column':
    case 'alter_column':
    case 'alter_column_type':
    case 'set_not_null':
    case 'drop_not_null':
      collectColumnDependents(
        schema,
        resolvedSchemaName,
        targetTable.name,
        parsed.columnName,
        affectedObjects,
        ''
      );
      break;

    case 'rename_column':
      collectColumnDependents(
        schema,
        resolvedSchemaName,
        targetTable.name,
        parsed.columnName,
        affectedObjects,
        ` (renombrada a ${parsed.newColumnName})`
      );
      break;

    case 'rename_table':
    case 'drop_table':
      collectTableDependents(schema, targetTable, affectedObjects);
      if (parsed.action === 'drop_table') {
        cascades = schema.foreignKeys.some(
          (fk) => fk.target_table.toLowerCase() === targetTable.name.toLowerCase() && isCascade(fk)
        );
      }
      break;

    case 'drop_primary_key': {
      dropsPrimaryKey = true;
      const pk = (schema.primaryKeys ?? []).find(
        (p) => p.table.toLowerCase() === targetTable.name.toLowerCase()
      );
      if (!pk) {
        return {
          risk: 'LOW',
          summary: `La tabla "${targetTable.name}" no tiene clave primaria que eliminar.`,
          affectedObjects: [],
          notFound: true,
          target: { schema: resolvedSchemaName, table: targetTable.name, column: '*' },
        };
      }
      for (const fk of schema.foreignKeys) {
        if (
          fk.target_table.toLowerCase() === targetTable.name.toLowerCase() &&
          pk.columns.some((c) => c.toLowerCase() === fk.target_column.toLowerCase())
        ) {
          affectedObjects.push({
            type: 'foreign_key',
            schema: fk.source_schema,
            name: fk.source_table,
            detail: `Clave foránea hacia la clave primaria de ${targetTable.name}`,
          });
        }
      }
      break;
    }

    case 'drop_constraint': {
      const constraint = (parsed.constraintName ?? '').toLowerCase();
      const fk = schema.foreignKeys.find((f) => f.constraint_name.toLowerCase() === constraint);
      const pk = (schema.primaryKeys ?? []).find(
        (p) => p.constraint_name.toLowerCase() === constraint
      );
      if (fk) {
        affectedObjects.push({
          type: 'foreign_key',
          schema: fk.source_schema,
          name: fk.source_table,
          detail: `Se elimina la restricción ${fk.constraint_name}`,
        });
      }
      if (pk) dropsPrimaryKey = true;
      break;
    }

    case 'add_column':
      break;

    case 'truncate_table': {
      for (const fk of schema.foreignKeys) {
        if (fk.target_table.toLowerCase() === targetTable.name.toLowerCase()) {
          affectedObjects.push({
            type: 'foreign_key',
            schema: fk.source_schema,
            name: fk.source_table,
            detail: `Clave foránea hacia ${targetTable.name}; puede impedir el TRUNCATE`,
          });
        }
      }
      break;
    }
  }

  const risk = computeRisk(affectedObjects, { cascades, dropsPrimaryKey });

  return {
    risk,
    summary: `La operación "${parsed.action}" sobre ${targetTable.name}${
      parsed.columnName ? `.${parsed.columnName}` : ''
    } afecta a ${affectedObjects.length} objeto(s).`,
    affectedObjects,
    target: { schema: resolvedSchemaName, table: targetTable.name, column: parsed.columnName ?? '*' },
  };
}

function predictDropIndex(schema: SchemaMetadata, parsed: ParsedDdl): DdlImpact {
  const wanted = (parsed.indexName ?? '').toLowerCase();
  const indexes: IndexInfo[] = schema.indexes ?? [];
  const index = indexes.find((i) => i.name.toLowerCase() === wanted);

  if (!index) {
    return {
      risk: 'LOW',
      summary: `El índice "${parsed.indexName}" no existe en el esquema seleccionado, así que la operación no tiene ningún efecto.`,
      affectedObjects: [],
      notFound: true,
      target: { schema: parsed.schemaName ?? 'public', table: parsed.indexName ?? '', column: '*' },
    };
  }

  const affectedObjects: AffectedObject[] = [
    {
      type: 'index',
      schema: index.schema,
      name: index.name,
      detail: `Índice ${index.is_unique ? 'único ' : ''}sobre ${index.table}(${index.columns.join(', ')})`,
    },
  ];

  const risk: DdlImpact['risk'] = index.is_primary || index.is_unique ? 'MEDIUM' : 'LOW';

  return {
    risk,
    summary: `Se elimina el índice ${index.name} sobre ${index.table}. ${
      index.is_unique
        ? 'Es único: puede afectar a restricciones que dependan de él.'
        : 'El impacto se limita al rendimiento de las consultas.'
    }`,
    affectedObjects,
    target: { schema: index.schema, table: index.table, column: '*' },
  };
}

function collectColumnDependents(
  schema: SchemaMetadata,
  schemaName: string,
  tableName: string,
  columnName: string | undefined,
  affectedObjects: AffectedObject[],
  suffix: string
): void {
  if (!columnName) return;

  for (const view of schema.views) {
    if (definitionReferences(view.definition, tableName.toLowerCase(), columnName.toLowerCase())) {
      affectedObjects.push({
        type: 'view',
        schema: view.schema,
        name: view.name,
        detail: `La vista depende de ${tableName}.${columnName}${suffix}`,
      });
    }
  }

  for (const fk of schema.foreignKeys) {
    if (
      fk.target_table.toLowerCase() === tableName.toLowerCase() &&
      fk.target_column.toLowerCase() === columnName.toLowerCase()
    ) {
      affectedObjects.push({
        type: 'foreign_key',
        schema: fk.source_schema,
        name: fk.source_table,
        detail: `Clave foránea hacia ${tableName}.${columnName}${suffix}`,
      });
    }
  }

  for (const routine of schema.routines) {
    if (definitionReferences(routine.definition, tableName.toLowerCase(), columnName.toLowerCase())) {
      affectedObjects.push({
        type: 'routine',
        schema: routine.schema,
        name: routine.name,
        detail: `La función usa ${tableName}.${columnName}${suffix}`,
      });
    }
  }
}

export function schemaToGraph(schema: SchemaMetadata): GraphDefinition {
  const tableNodes: GraphNode[] = schema.tables.map((table) => ({
    id: `${table.schema}.${table.name}`,
    type: table.type === 'BASE TABLE' ? 'table' : 'view',
    label: table.name,
    schema: table.schema,
    table: table.name,
    column: '*',
    affected: false,
  }));

  const routineNodes: GraphNode[] = (schema.routines ?? []).map((routine) => ({
    id: `${routine.schema}.${routine.name}`,
    type: 'routine',
    label: routine.name,
    schema: routine.schema,
    table: routine.name,
    column: '*',
    affected: false,
  }));

  const nodes: GraphNode[] = [...tableNodes, ...routineNodes];
  const nodeIds = new Set(nodes.map((n) => n.id));

  const fkEdges: GraphEdge[] = schema.foreignKeys.map((fk, index) => ({
    id: `fk-${index}-${fk.constraint_name}`,
    source: `${fk.source_schema}.${fk.source_table}`,
    target: `${fk.target_schema}.${fk.target_table}`,
    label: fk.source_column,
  }));

  const routineEdges: GraphEdge[] = [];
  let edgeIndex = 0;
  for (const routine of schema.routines ?? []) {
    const refs = new Set(referencedTables(routine.definition ?? ''));
    for (const table of schema.tables) {
      if (refs.has(table.name.toLowerCase())) {
        routineEdges.push({
          id: `routine-${edgeIndex++}`,
          source: `${routine.schema}.${routine.name}`,
          target: `${table.schema}.${table.name}`,
          label: 'usa',
        });
      }
    }
  }

  const edges: GraphEdge[] = [...fkEdges, ...routineEdges].filter(
    (edge) => nodeIds.has(edge.source) && nodeIds.has(edge.target)
  );

  return { nodes, edges };
}

export type DdlAction =
  | 'drop_column'
  | 'drop_table'
  | 'rename_column'
  | 'rename_table'
  | 'alter_column'
  | 'alter_column_type'
  | 'set_not_null'
  | 'drop_not_null'
  | 'add_column'
  | 'drop_constraint'
  | 'drop_primary_key'
  | 'drop_index'
  | 'truncate_table';

export interface ParsedDdl {
  action: DdlAction;
  schemaName?: string;
  tableName?: string;
  columnName?: string;
  newColumnName?: string;
  newTableName?: string;
  constraintName?: string;
  indexName?: string;
}

export function parseDdlTarget(ddl: string): ParsedDdl | null {
  const renameTable = ddl.match(
    /alter\s+table\s+(?:([a-z_][a-z0-9_]*)\.)?([a-z_][a-z0-9_]*)\s+rename\s+to\s+([a-z_][a-z0-9_]*)/i
  );
  if (renameTable) {
    return {
      action: 'rename_table',
      schemaName: renameTable[1],
      tableName: renameTable[2],
      newTableName: renameTable[3],
    };
  }

  const renameColumn = ddl.match(
    /alter\s+table\s+(?:([a-z_][a-z0-9_]*)\.)?([a-z_][a-z0-9_]*)\s+rename\s+(?:column\s+)?([a-z_][a-z0-9_]*)\s+to\s+([a-z_][a-z0-9_]*)/i
  );
  if (renameColumn) {
    return {
      action: 'rename_column',
      schemaName: renameColumn[1],
      tableName: renameColumn[2],
      columnName: renameColumn[3],
      newColumnName: renameColumn[4],
    };
  }

  const dropConstraint = ddl.match(
    /alter\s+table\s+(?:([a-z_][a-z0-9_]*)\.)?([a-z_][a-z0-9_]*)\s+drop\s+constraint\s+(?:if\s+exists\s+)?([a-z_][a-z0-9_]*)/i
  );
  if (dropConstraint) {
    const isPrimaryKey = /\bprimary\s+key\b/i.test(ddl);
    return {
      action: isPrimaryKey ? 'drop_primary_key' : 'drop_constraint',
      schemaName: dropConstraint[1],
      tableName: dropConstraint[2],
      constraintName: dropConstraint[3],
    };
  }

  const dropPrimaryKey = ddl.match(
    /alter\s+table\s+(?:([a-z_][a-z0-9_]*)\.)?([a-z_][a-z0-9_]*)\s+drop\s+primary\s+key/i
  );
  if (dropPrimaryKey) {
    return { action: 'drop_primary_key', schemaName: dropPrimaryKey[1], tableName: dropPrimaryKey[2] };
  }

  const dropColumn = ddl.match(
    /alter\s+table\s+(?:([a-z_][a-z0-9_]*)\.)?([a-z_][a-z0-9_]*)\s+drop\s+(?:column\s+)?([a-z_][a-z0-9_]*)/i
  );
  if (dropColumn) {
    return {
      action: 'drop_column',
      schemaName: dropColumn[1],
      tableName: dropColumn[2],
      columnName: dropColumn[3],
    };
  }

  const alterColumnType = ddl.match(
    /alter\s+table\s+(?:([a-z_][a-z0-9_]*)\.)?([a-z_][a-z0-9_]*)\s+alter\s+(?:column\s+)?([a-z_][a-z0-9_]*)\s+(?:type|set\s+data\s+type)\b/i
  );
  if (alterColumnType) {
    return {
      action: 'alter_column_type',
      schemaName: alterColumnType[1],
      tableName: alterColumnType[2],
      columnName: alterColumnType[3],
    };
  }

  const setNotNull = ddl.match(
    /alter\s+table\s+(?:([a-z_][a-z0-9_]*)\.)?([a-z_][a-z0-9_]*)\s+alter\s+(?:column\s+)?([a-z_][a-z0-9_]*)\s+set\s+not\s+null/i
  );
  if (setNotNull) {
    return {
      action: 'set_not_null',
      schemaName: setNotNull[1],
      tableName: setNotNull[2],
      columnName: setNotNull[3],
    };
  }

  const dropNotNull = ddl.match(
    /alter\s+table\s+(?:([a-z_][a-z0-9_]*)\.)?([a-z_][a-z0-9_]*)\s+alter\s+(?:column\s+)?([a-z_][a-z0-9_]*)\s+drop\s+not\s+null/i
  );
  if (dropNotNull) {
    return {
      action: 'drop_not_null',
      schemaName: dropNotNull[1],
      tableName: dropNotNull[2],
      columnName: dropNotNull[3],
    };
  }

  const addColumn = ddl.match(
    /alter\s+table\s+(?:([a-z_][a-z0-9_]*)\.)?([a-z_][a-z0-9_]*)\s+add\s+(?:column\s+)?(?:if\s+not\s+exists\s+)?([a-z_][a-z0-9_]*)/i
  );
  if (addColumn && !/^alter\s+table\s+(?:[a-z_][a-z0-9_]*\.)?[a-z_][a-z0-9_]*\s+add\s+(?:constraint|primary|foreign|unique|check|exclude)\b/i.test(ddl)) {
    return {
      action: 'add_column',
      schemaName: addColumn[1],
      tableName: addColumn[2],
      columnName: addColumn[3],
    };
  }

  const alterColumn = ddl.match(
    /alter\s+table\s+(?:([a-z_][a-z0-9_]*)\.)?([a-z_][a-z0-9_]*)\s+(?:alter|modify)\s+(?:column\s+)?([a-z_][a-z0-9_]*)/i
  );
  if (alterColumn) {
    return {
      action: 'alter_column',
      schemaName: alterColumn[1],
      tableName: alterColumn[2],
      columnName: alterColumn[3],
    };
  }

  const truncateTable = ddl.match(
    /truncate\s+(?:table\s+)?(?:only\s+)?(?:([a-z_][a-z0-9_]*)\.)?([a-z_][a-z0-9_]*)/i
  );
  if (truncateTable) {
    return { action: 'truncate_table', schemaName: truncateTable[1], tableName: truncateTable[2] };
  }

  const dropTable = ddl.match(
    /drop\s+table\s+(?:if\s+exists\s+)?(?:([a-z_][a-z0-9_]*)\.)?([a-z_][a-z0-9_]*)/i
  );
  if (dropTable) {
    return { action: 'drop_table', schemaName: dropTable[1], tableName: dropTable[2] };
  }

  const dropIndex = ddl.match(
    /drop\s+index\s+(?:concurrently\s+)?(?:if\s+exists\s+)?(?:([a-z_][a-z0-9_]*)\.)?([a-z_][a-z0-9_]*)/i
  );
  if (dropIndex) {
    return { action: 'drop_index', schemaName: dropIndex[1], indexName: dropIndex[2] };
  }

  return null;
}

export function isValidSchema(value: unknown): value is SchemaMetadata {
  if (typeof value !== 'object' || value === null) return false;
  const s = value as Record<string, unknown>;
  return (
    Array.isArray(s.tables) &&
    Array.isArray(s.views) &&
    Array.isArray(s.routines) &&
    Array.isArray(s.foreignKeys) &&
    Array.isArray(s.primaryKeys)
  );
}

export function normalizeSchema(value: unknown): SchemaMetadata | null {
  if (!isValidSchema(value)) return null;
  const s = value as SchemaMetadata;
  return {
    version: typeof s.version === 'number' ? s.version : SCHEMA_CONTRACT_VERSION,
    tables: s.tables ?? [],
    views: s.views ?? [],
    routines: s.routines ?? [],
    foreignKeys: s.foreignKeys ?? [],
    primaryKeys: s.primaryKeys ?? [],
    indexes: Array.isArray(s.indexes) ? s.indexes : [],
  };
}

export interface ColumnChange {
  column: string;
  from: string;
  to: string;
}

export interface TableChange {
  name: string;
  addedColumns: string[];
  removedColumns: string[];
  changedColumns: ColumnChange[];
}

export interface SchemaDiff {
  addedTables: string[];
  removedTables: string[];
  changedTables: TableChange[];
  addedForeignKeys: string[];
  removedForeignKeys: string[];
  addedViews: string[];
  removedViews: string[];
  addedRoutines: string[];
  removedRoutines: string[];
}

function relationKey(rel: { schema: string; name: string }): string {
  return `${rel.schema}.${rel.name}`;
}

export function diffSchemas(from: SchemaMetadata, to: SchemaMetadata): SchemaDiff {
  const fromTables = new Map((from.tables ?? []).map((t) => [relationKey(t), t]));
  const toTables = new Map((to.tables ?? []).map((t) => [relationKey(t), t]));

  const addedTables: string[] = [];
  const removedTables: string[] = [];
  const changedTables: TableChange[] = [];

  for (const key of toTables.keys()) {
    if (!fromTables.has(key)) addedTables.push(key);
  }
  for (const key of fromTables.keys()) {
    if (!toTables.has(key)) removedTables.push(key);
  }

  for (const [key, fromTable] of fromTables) {
    const toTable = toTables.get(key);
    if (!toTable) continue;

    const fromCols = new Map(fromTable.columns.map((c) => [c.column_name.toLowerCase(), c]));
    const toCols = new Map(toTable.columns.map((c) => [c.column_name.toLowerCase(), c]));

    const addedColumns: string[] = [];
    const removedColumns: string[] = [];
    const changedColumns: ColumnChange[] = [];

    for (const [name, col] of toCols) {
      if (!fromCols.has(name)) addedColumns.push(col.column_name);
    }
    for (const [name, col] of fromCols) {
      if (!toCols.has(name)) removedColumns.push(col.column_name);
    }
    for (const [name, fromCol] of fromCols) {
      const toCol = toCols.get(name);
      if (toCol && toCol.data_type !== fromCol.data_type) {
        changedColumns.push({
          column: fromCol.column_name,
          from: fromCol.data_type,
          to: toCol.data_type,
        });
      }
    }

    if (addedColumns.length || removedColumns.length || changedColumns.length) {
      changedTables.push({ name: key, addedColumns, removedColumns, changedColumns });
    }
  }

  const fkKey = (fk: ForeignKey): string =>
    `${fk.source_schema}.${fk.source_table}.${fk.source_column}->${fk.target_schema}.${fk.target_table}.${fk.target_column}`;
  const fromFks = new Set((from.foreignKeys ?? []).map(fkKey));
  const toFks = new Set((to.foreignKeys ?? []).map(fkKey));

  const viewKey = (v: ViewInfo): string => `${v.schema}.${v.name}`;
  const fromViews = new Set((from.views ?? []).map(viewKey));
  const toViews = new Set((to.views ?? []).map(viewKey));

  const routineKey = (r: RoutineInfo): string => `${r.schema}.${r.name}`;
  const fromRoutines = new Set((from.routines ?? []).map(routineKey));
  const toRoutines = new Set((to.routines ?? []).map(routineKey));

  return {
    addedTables: addedTables.sort(),
    removedTables: removedTables.sort(),
    changedTables,
    addedForeignKeys: Array.from(toFks).filter((k) => !fromFks.has(k)),
    removedForeignKeys: Array.from(fromFks).filter((k) => !toFks.has(k)),
    addedViews: Array.from(toViews).filter((k) => !fromViews.has(k)),
    removedViews: Array.from(fromViews).filter((k) => !toViews.has(k)),
    addedRoutines: Array.from(toRoutines).filter((k) => !fromRoutines.has(k)),
    removedRoutines: Array.from(fromRoutines).filter((k) => !toRoutines.has(k)),
  };
}

export interface SchemaAudit {
  foreignKeysWithoutIndex: Array<{
    table: string;
    column: string;
    constraint: string;
    references: string;
  }>;
  unusedColumns: Array<{ table: string; column: string }>;
  unusedViews: string[];
  unusedRoutines: string[];
  counts: { tables: number; views: number; routines: number; foreignKeys: number };
}

export function auditSchema(schema: SchemaMetadata): SchemaAudit {
  const indexes = Array.isArray(schema.indexes) ? schema.indexes : [];
  const indexesAvailable = indexes.length > 0;

  const foreignKeysWithoutIndex = indexesAvailable
    ? (schema.foreignKeys ?? [])
        .filter(
          (fk) =>
            !indexes.some(
              (idx) =>
                idx.schema === fk.source_schema &&
                idx.table === fk.source_table &&
                Array.isArray(idx.columns) &&
                idx.columns.length > 0 &&
                idx.columns[0].toLowerCase() === fk.source_column.toLowerCase()
            )
        )
        .map((fk) => ({
          table: `${fk.source_schema}.${fk.source_table}`,
          column: fk.source_column,
          constraint: fk.constraint_name,
          references: `${fk.target_schema}.${fk.target_table}.${fk.target_column}`,
        }))
    : [];

  const definitions = [
    ...(schema.views ?? []).map((v) => sanitizeSql(v.definition ?? '')),
    ...(schema.routines ?? []).map((r) => sanitizeSql(r.definition ?? '')),
  ];

  const fkColumns = new Set<string>();
  for (const fk of schema.foreignKeys ?? []) {
    fkColumns.add(`${fk.source_table.toLowerCase()}.${fk.source_column.toLowerCase()}`);
    fkColumns.add(`${fk.target_table.toLowerCase()}.${fk.target_column.toLowerCase()}`);
  }
  for (const pk of schema.primaryKeys ?? []) {
    for (const col of pk.columns) fkColumns.add(`${pk.table.toLowerCase()}.${col.toLowerCase()}`);
  }

  const unusedColumns: Array<{ table: string; column: string }> = [];
  for (const table of schema.tables ?? []) {
    if (table.type !== 'BASE TABLE') continue;
    const tableName = table.name.toLowerCase();
    for (const col of table.columns) {
      const column = col.column_name.toLowerCase();
      const referenced =
        fkColumns.has(`${tableName}.${column}`) ||
        definitions.some((def) => containsIdentifier(def, column));
      if (!referenced) {
        unusedColumns.push({ table: `${table.schema}.${table.name}`, column: col.column_name });
      }
    }
  }

  const unusedViews = (schema.views ?? [])
    .filter((view) => !definitions.some((def) => containsIdentifier(def, view.name)))
    .map(relationKey);

  const unusedRoutines = (schema.routines ?? [])
    .filter((routine) => !definitions.some((def) => containsIdentifier(def, routine.name)))
    .map(relationKey);

  return {
    foreignKeysWithoutIndex,
    unusedColumns,
    unusedViews,
    unusedRoutines,
    counts: {
      tables: (schema.tables ?? []).length,
      views: (schema.views ?? []).length,
      routines: (schema.routines ?? []).length,
      foreignKeys: (schema.foreignKeys ?? []).length,
    },
  };
}
