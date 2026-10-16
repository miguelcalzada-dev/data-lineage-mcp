import type { DdlImpact, LineageNode } from '@/mcp/utils/postgres-inspector';
import type { GraphDefinition } from '@/mcp/tools/generate-graph';

export interface ReportInput {
  databaseLabel: string;
  question?: string;
  impact?: DdlImpact | null;
  lineage?: LineageNode[] | null;
  graph?: GraphDefinition | null;
}

const RISK_LABEL: Record<string, string> = {
  HIGH: 'Alto',
  MEDIUM: 'Medio',
  LOW: 'Bajo',
};

const OBJECT_LABEL: Record<string, string> = {
  view: 'Vista',
  routine: 'Función',
  foreign_key: 'Clave foránea',
  table: 'Tabla',
  column: 'Columna',
  index: 'Índice',
  constraint: 'Restricción',
};

export function buildMarkdownReport(input: ReportInput): string {
  const { databaseLabel, question, impact, lineage, graph } = input;
  const lines: string[] = [];

  lines.push('# Informe de impacto — ImpactDB-MCP');
  lines.push('');
  lines.push(`- **Fecha:** ${new Date().toISOString()}`);
  lines.push(`- **Base de datos:** ${databaseLabel}`);
  if (question) lines.push(`- **Consulta:** ${question}`);
  lines.push('');

  if (impact) {
    lines.push('## Análisis de impacto');
    lines.push('');
    lines.push(`**Riesgo:** ${RISK_LABEL[impact.risk] ?? impact.risk}`);
    if (impact.summary) lines.push('');
    if (impact.summary) lines.push(impact.summary);
    lines.push('');

    if (impact.affectedObjects.length > 0) {
      lines.push('### Objetos afectados');
      lines.push('');
      for (const obj of impact.affectedObjects) {
        lines.push(`- **${obj.name}** (${OBJECT_LABEL[obj.type] ?? obj.type}) — ${obj.detail}`);
      }
      lines.push('');
    } else {
      lines.push('Sin objetos afectados.');
      lines.push('');
    }
  }

  if (lineage && lineage.length > 0) {
    lines.push('## Linaje');
    lines.push('');
    for (const node of lineage) {
      const depth = node.depth ?? 0;
      const relation = node.relation ?? 'relation';
      lines.push(`- ${'  '.repeat(depth)}${node.schema}.${node.table}.${node.column} _(${relation})_`);
    }
    lines.push('');
  }

  if (graph) {
    lines.push('## Grafo');
    lines.push('');
    lines.push(`- Nodos: ${graph.nodes.length}`);
    lines.push(`- Aristas: ${graph.edges.length}`);
    lines.push('');
  }

  lines.push('---');
  lines.push('');
  lines.push('_Generado por ImpactDB-MCP._');

  return lines.join('\n');
}

export function downloadTextFile(filename: string, content: string, mime = 'text/markdown'): void {
  const blob = new Blob([content], { type: `${mime};charset=utf-8` });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = filename;
  anchor.click();
  URL.revokeObjectURL(url);
}
