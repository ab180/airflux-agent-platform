/**
 * Semantic layer loader.
 * Provides structured schema info for SQL generation.
 */

export interface ColumnDef {
  name: string;
  type: string;
  description: string;
}

export interface TableDef {
  description: string;
  columns: ColumnDef[];
}

export interface MetricDef {
  description: string;
  sql: string;
}

export interface SemanticLayerConfig {
  database: string;
  schema: string;
  tables: Record<string, TableDef>;
  metrics: Record<string, MetricDef>;
}

export class SemanticLayer {
  constructor(private config: SemanticLayerConfig) {}

  getTable(name: string): TableDef | undefined {
    return this.config.tables[name];
  }

  listTables(): string[] {
    return Object.keys(this.config.tables);
  }

  getMetric(name: string): MetricDef | undefined {
    return this.config.metrics[name];
  }

  listMetrics(): string[] {
    return Object.keys(this.config.metrics);
  }

  /** Generate a context string for LLM SQL generation */
  toPromptContext(): string {
    const lines: string[] = [];
    lines.push(`Database: ${this.config.database}, Schema: ${this.config.schema}`);
    lines.push('');

    lines.push('## Tables');
    for (const [name, table] of Object.entries(this.config.tables)) {
      lines.push(`### ${name} — ${table.description}`);
      for (const col of table.columns) {
        lines.push(`  - ${col.name} (${col.type}): ${col.description}`);
      }
      lines.push('');
    }

    lines.push('## Metrics');
    for (const [name, metric] of Object.entries(this.config.metrics)) {
      lines.push(`- ${name}: ${metric.description}`);
    }

    return lines.join('\n');
  }
}
