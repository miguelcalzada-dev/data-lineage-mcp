export type LogLevel = 'debug' | 'info' | 'warn' | 'error';

export interface LogMeta {
  [key: string]: unknown;
}

export function log(level: LogLevel, message: string, meta?: LogMeta): void {
  const entry = {
    ts: new Date().toISOString(),
    level,
    message,
    ...(meta ?? {}),
  };
  const line = JSON.stringify(entry);

  if (level === 'error') {
    console.error(line);
  } else if (level === 'warn') {
    console.warn(line);
  } else {
    console.log(line);
  }
}
