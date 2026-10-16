import type { SchemaMetadata } from '@/mcp/utils/postgres-inspector';

export interface ToolContext {
  schema?: SchemaMetadata;
  targetSchema?: string;
  preferredSchema?: string;
}

export interface McpTool {
  name: string;
  description: string;
  inputSchema: {
    type: 'object';
    properties: Record<string, unknown>;
    required?: string[];
  };
  execute(
    args: Record<string, unknown>,
    context?: ToolContext
  ): Promise<{
    content: Array<{ type: 'text'; text: string }>;
    isError?: boolean;
  }>;
}
