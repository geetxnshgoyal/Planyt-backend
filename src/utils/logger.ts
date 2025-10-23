import { appConfig } from '../config.js';

type LogLevel = 'info' | 'warn' | 'error' | 'debug';

const format = (level: LogLevel, message: string, meta?: Record<string, unknown>) => {
  const payload = {
    level,
    message,
    timestamp: new Date().toISOString(),
    ...meta,
  };
  return appConfig.logPretty ? JSON.stringify(payload, null, 2) : JSON.stringify(payload);
};

export const logger = {
  info: (message: string, meta?: Record<string, unknown>) => {
    console.log(format('info', message, meta));
  },
  warn: (message: string, meta?: Record<string, unknown>) => {
    console.warn(format('warn', message, meta));
  },
  error: (message: string, meta?: Record<string, unknown>) => {
    console.error(format('error', message, meta));
  },
  debug: (message: string, meta?: Record<string, unknown>) => {
    if (process.env.NODE_ENV !== 'production') {
      console.debug(format('debug', message, meta));
    }
  },
};
