/**
 * Observability — placeholder for trace/metric sinks.
 * Default sink (SQLite/Postgres) + optional adapters (Langfuse, Phoenix,
 * LangSmith) per spec Round 16.
 */

export interface TraceSink {
  readonly name: string;
  record(span: unknown): Promise<void>;
}
