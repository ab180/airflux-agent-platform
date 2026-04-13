/**
 * Structured logger for the Airflux server.
 * Outputs JSON-lines format for easy parsing by log aggregators.
 * In development, falls back to readable console output.
 */

const IS_PROD = process.env.NODE_ENV === 'production';

interface LogEntry {
  level: 'info' | 'warn' | 'error';
  msg: string;
  [key: string]: unknown;
}

function formatLog(entry: LogEntry): string {
  if (IS_PROD) {
    return JSON.stringify({ ts: new Date().toISOString(), ...entry });
  }
  const prefix = entry.level === 'error' ? '✗' : entry.level === 'warn' ? '⚠' : '→';
  const extra = Object.keys(entry).filter(k => k !== 'level' && k !== 'msg');
  const extraStr = extra.length > 0
    ? ' ' + extra.map(k => `${k}=${JSON.stringify(entry[k])}`).join(' ')
    : '';
  return `${prefix} ${entry.msg}${extraStr}`;
}

export const logger = {
  info(msg: string, data?: Record<string, unknown>) {
    console.log(formatLog({ level: 'info', msg, ...data }));
  },
  warn(msg: string, data?: Record<string, unknown>) {
    console.warn(formatLog({ level: 'warn', msg, ...data }));
  },
  error(msg: string, data?: Record<string, unknown>) {
    console.error(formatLog({ level: 'error', msg, ...data }));
  },
};
