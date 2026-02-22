/**
 * Logging utility using Pino
 */

import pino from 'pino';
import { env } from '../config/env.js';

/**
 * Create logger instance with environment-aware configuration
 */
export const logger = pino({
  level: env.LOG_LEVEL,

  // Pretty print in development
  transport: env.isDevelopment ? {
    target: 'pino-pretty',
    options: {
      colorize: true,
      translateTime: 'HH:MM:ss',
      ignore: 'pid,hostname'
    }
  } : undefined,

  // Production: structured JSON logs
  formatters: env.isProduction ? {
    level: (label) => {
      return { level: label };
    }
  } : undefined,

  // Base fields
  base: {
    env: env.NODE_ENV,
    service: 'lidar-receiver'
  }
});

/**
 * Create child logger for specific module
 */
export function createLogger(module: string) {
  return logger.child({ module });
}
