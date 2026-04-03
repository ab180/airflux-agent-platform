/**
 * Structured JSON Logger
 * CloudWatch Logs Insights로 검색 가능한 JSON 로그
 */

import crypto from 'crypto';

export interface LogEntry {
  timestamp: string;
  level: 'debug' | 'info' | 'warn' | 'error';
  traceId: string;
  userId?: string;
  component: string;
  event: string;
  duration?: number;
  metadata?: Record<string, any>;
  error?: { code: string; message: string; stack?: string };
}

export class Logger {
  private traceId: string;
  private component: string;
  private userId?: string;

  constructor(component: string, traceId?: string, userId?: string) {
    this.component = component;
    this.traceId = traceId || crypto.randomUUID();
    this.userId = userId;
  }

  debug(event: string, metadata?: Record<string, any>): void {
    this.emit({ level: 'debug', event, metadata });
  }

  info(event: string, metadata?: Record<string, any>): void {
    this.emit({ level: 'info', event, metadata });
  }

  warn(event: string, metadata?: Record<string, any>): void {
    this.emit({ level: 'warn', event, metadata });
  }

  error(event: string, error: Error, metadata?: Record<string, any>): void {
    this.emit({
      level: 'error',
      event,
      metadata,
      error: {
        code: (error as any).code || 'UNKNOWN',
        message: error.message,
        stack: error.stack,
      },
    });
  }

  // Performance measurement helper
  async timed<T>(event: string, fn: () => Promise<T>, metadata?: Record<string, any>): Promise<T> {
    const start = Date.now();
    try {
      const result = await fn();
      this.info(event, { ...metadata, duration: Date.now() - start, status: 'success' });
      return result;
    } catch (error) {
      this.error(event, error as Error, { ...metadata, duration: Date.now() - start });
      throw error;
    }
  }

  child(component: string): Logger {
    return new Logger(component, this.traceId, this.userId);
  }

  private emit(entry: Partial<LogEntry>): void {
    const log: LogEntry = {
      timestamp: new Date().toISOString(),
      traceId: this.traceId,
      userId: this.userId,
      component: this.component,
      ...entry,
    } as LogEntry;
    console.log(JSON.stringify(log));
  }
}
