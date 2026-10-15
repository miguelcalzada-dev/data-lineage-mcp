import type {
  SchemaMetadata,
  TableInfo,
  ColumnInfo,
  LineageNode,
  DdlImpact,
  AffectedObject,
} from '@/mcp/utils/postgres-inspector';
import type { GraphDefinition, GraphNode, GraphEdge } from '@/mcp/tools/generate-graph';

function containsIdentifier(text: string, identifier: string): boolean {
  if (!identifier) return false;
  const pattern = new RegExp(`(^|[^a-z0-9_])${identifier}([^a-z0-9_]|$)`);
  return pattern.test(text);
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
  const lowerTable = tableName.toLowerCase();
  const lowerColumn = columnName.toLowerCase();

  const originTable = findTableByName(schema, tableName);
  const resolvedSchema = schemaName ?? originTable?.schema ?? 'public';

  const nodes: LineageNode[] = [
    {
      schema: originTable?.schema ?? resolvedSchema,
      table: originTable?.name ?? tableName,
      column: columnName,
      kind: 'table',
      relation: 'origin',
    },
  ];

  for (const fk of schema.foreignKeys) {
    if (
      (fk.target_schema === resolvedSchema || fk.target_schema === schemaName) &&
      fk.target_table.toLowerCase() === lowerTable &&
      fk.target_column.toLowerCase() === lowerColumn
    ) {
      nodes.push({
        schema: fk.source_schema,
        table: fk.source_table,
        column: fk.source_column,
        kind: 'foreign_key',
        relation: 'child_foreign_key',
      });
    }
  }

  for (const view of schema.views) {
    const def = (view.definition ?? '').toLowerCase();
    if (containsIdentifier(def, lowerTable) && containsIdentifier(def, lowerColumn)) {
      nodes.push({
        schema: view.schema,
        table: view.name,
        column: '*',
        kind: 'view',
        relation: 'dependent_view',
      });
    }
  }

  for (const routine of schema.routines) {
    const def = (routine.definition ?? '').toLowerCase();
    if (containsIdentifier(def, lowerTable) && containsIdentifier(def, lowerColumn)) {
      nodes.push({
        schema: routine.schema,
        table: routine.name,
        column: '*',
        kind: 'routine',
        relation: 'dependent_routine',
      });
    }
  }

  return nodes;
}

export function predictImpact(schema: SchemaMetadata, ddlStatement: string): DdlImpact {
  const normalized = ddlStatement.replace(/\s+/g, ' ').trim().toLowerCase();
  const affectedObjects: AffectedObject[] = [];
  const schemaName = 'public';

  const parsed = parseDdlTarget(normalized);
  if (!parsed) {
    return {
      risk: 'LOW',
      summary: 'No se pudo interpretar la sentencia. Sin impacto estructural detectado.',
      affectedObjects,
    };
  }

  const { action, tableName, columnName, newColumnName } = parsed;

  const targetTable = findTableByName(schema, tableName);
  if (!targetTable) {
    return {
      risk: 'LOW',
      summary: `La tabla "${tableName}" no existe en el esquema seleccionado, así que la operación "${action}" no tiene ningún efecto.`,
      affectedObjects: [],
      notFound: true,
      target: { schema: schemaName, table: tableName, column: columnName ?? '*' },
    };
  }

  const resolvedSchemaName = targetTable.schema || schemaName;

  if (columnName && (action === 'drop_column' || action === 'alter_column' || action === 'rename_column')) {
    const targetColumn = findColumnByName(schema, tableName, columnName);
    if (!targetColumn) {
      return {
        risk: 'LOW',
        summary: `La columna "${columnName}" no existe en la tabla "${targetTable.name}", así que la operación "${action}" no tiene ningún efecto.`,
        affectedObjects: [],
        notFound: true,
        target: { schema: resolvedSchemaName, table: targetTable.name, column: columnName },
      };
    }
  }

  if (action === 'drop_column' || action === 'alter_column') {
    collectColumnDependents(schema, resolvedSchemaName, targetTable.name, columnName, affectedObjects, '');
  }

  if (action === 'drop_table') {
    for (const fk of schema.foreignKeys) {
      if (fk.target_table.toLowerCase() === targetTable.name.toLowerCase()) {
        affectedObjects.push({
          type: 'foreign_key',
          schema: fk.source_schema,
          name: fk.source_table,
          detail: `Clave foránea hacia la tabla ${targetTable.name}`,
        });
      }
    }
    for (const view of schema.views) {
      if (containsIdentifier((view.definition ?? '').toLowerCase(), targetTable.name.toLowerCase())) {
        affectedObjects.push({
          type: 'view',
          schema: view.schema,
          name: view.name,
          detail: `La vista usa la tabla ${targetTable.name}`,
        });
      }
    }
  }

  if (action === 'rename_column') {
    collectColumnDependents(
      schema,
      resolvedSchemaName,
      targetTable.name,
      columnName,
      affectedObjects,
      ` (renombrada a ${newColumnName})`
    );
  }

  const risk: 'HIGH' | 'MEDIUM' | 'LOW' =
    affectedObjects.length > 3 ? 'HIGH' : affectedObjects.length > 0 ? 'MEDIUM' : 'LOW';

  return {
    risk,
    summary: `La operación "${action}" sobre ${targetTable.name}${
      columnName ? `.${columnName}` : ''
    } afecta a ${affectedObjects.length} objeto(s).`,
    affectedObjects,
    target: { schema: resolvedSchemaName, table: targetTable.name, column: columnName ?? '*' },
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
    const def = (view.definition ?? '').toLowerCase();
    if (containsIdentifier(def, tableName.toLowerCase()) && containsIdentifier(def, columnName.toLowerCase())) {
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
    const def = (routine.definition ?? '').toLowerCase();
    if (containsIdentifier(def, tableName.toLowerCase()) && containsIdentifier(def, columnName.toLowerCase())) {
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
  const nodes: GraphNode[] = schema.tables.map((table) => ({
    id: `${table.schema}.${table.name}`,
    type: table.type === 'BASE TABLE' ? 'table' : 'view',
    label: table.name,
    schema: table.schema,
    table: table.name,
    column: '*',
    affected: false,
  }));

  const nodeIds = new Set(nodes.map((n) => n.id));

  const edges: GraphEdge[] = schema.foreignKeys
    .map((fk, index) => ({
      id: `fk-${index}-${fk.constraint_name}`,
      source: `${fk.source_schema}.${fk.source_table}`,
      target: `${fk.target_schema}.${fk.target_table}`,
      label: fk.source_column,
    }))
    .filter((edge) => nodeIds.has(edge.source) && nodeIds.has(edge.target));

  return { nodes, edges };
}

export interface ParsedDdl {
  action: 'drop_column' | 'drop_table' | 'rename_column' | 'alter_column';
  tableName: string;
  columnName?: string;
  newColumnName?: string;
}

export function parseDdlTarget(ddl: string): ParsedDdl | null {
  const dropColumnMatch = ddl.match(
    /alter\s+table\s+(?:([a-z_][a-z0-9_]*)\.)?([a-z_][a-z0-9_]*)\s+drop\s+(?:column\s+)?([a-z_][a-z0-9_]*)/i
  );
  if (dropColumnMatch) {
    return { action: 'drop_column', tableName: dropColumnMatch[2], columnName: dropColumnMatch[3] };
  }

  const dropTableMatch = ddl.match(
    /drop\s+table\s+(?:if\s+exists\s+)?(?:([a-z_][a-z0-9_]*)\.)?([a-z_][a-z0-9_]*)/i
  );
  if (dropTableMatch) {
    return { action: 'drop_table', tableName: dropTableMatch[2] };
  }

  const renameColumnMatch = ddl.match(
    /alter\s+table\s+(?:([a-z_][a-z0-9_]*)\.)?([a-z_][a-z0-9_]*)\s+rename\s+(?:column\s+)?([a-z_][a-z0-9_]*)\s+to\s+([a-z_][a-z0-9_]*)/i
  );
  if (renameColumnMatch) {
    return {
      action: 'rename_column',
      tableName: renameColumnMatch[2],
      columnName: renameColumnMatch[3],
      newColumnName: renameColumnMatch[4],
    };
  }

  const alterColumnMatch = ddl.match(
    /alter\s+table\s+(?:([a-z_][a-z0-9_]*)\.)?([a-z_][a-z0-9_]*)\s+(?:alter|modify)\s+(?:column\s+)?([a-z_][a-z0-9_]*)/i
  );
  if (alterColumnMatch) {
    return { action: 'alter_column', tableName: alterColumnMatch[2], columnName: alterColumnMatch[3] };
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
