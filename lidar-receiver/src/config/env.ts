/**
 * Environment configuration with validation and defaults
 */

import { config } from 'dotenv';
import { existsSync, mkdirSync } from 'fs';
import { resolve } from 'path';

// Load .env file
config();

/**
 * Parse environment variable as number with default
 */
function parseNumber(value: string | undefined, defaultValue: number): number {
  if (!value) return defaultValue;
  const parsed = parseInt(value, 10);
  return isNaN(parsed) ? defaultValue : parsed;
}

/**
 * Parse environment variable as boolean with default
 */
function parseBoolean(value: string | undefined, defaultValue: boolean): boolean {
  if (!value) return defaultValue;
  return value.toLowerCase() === 'true';
}

/**
 * Environment configuration
 */
export const env = {
  // Server
  WS_PORT: parseNumber(process.env.WS_PORT, 8080),
  WS_HOST: process.env.WS_HOST || '0.0.0.0',

  // Authentication
  API_KEY: process.env.API_KEY || '',

  // Storage
  DATA_DIR: resolve(process.env.DATA_DIR || './data'),
  SCANS_DIR: resolve(process.env.SCANS_DIR || './data/scans'),
  DB_PATH: resolve(process.env.DB_PATH || './data/database.sqlite'),
  LOG_DIR: resolve(process.env.LOG_DIR || './logs'),

  // Performance
  MAX_QUEUE_SIZE: parseNumber(process.env.MAX_QUEUE_SIZE, 1000),
  MAX_BUFFER_MEMORY_MB: parseNumber(process.env.MAX_BUFFER_MEMORY_MB, 512),
  PROCESSING_INTERVAL_MS: parseNumber(process.env.PROCESSING_INTERVAL_MS, 10),

  // Retention
  RETENTION_DAYS: parseNumber(process.env.RETENTION_DAYS, 30),

  // Logging
  LOG_LEVEL: process.env.LOG_LEVEL || 'info',

  // Node environment
  NODE_ENV: process.env.NODE_ENV || 'development',

  // Computed
  get isDevelopment() {
    return this.NODE_ENV === 'development';
  },
  get isProduction() {
    return this.NODE_ENV === 'production';
  }
};

/**
 * Validate required configuration
 */
export function validateConfig(): void {
  const errors: string[] = [];

  // Check required fields
  if (!env.API_KEY) {
    errors.push('API_KEY is required. Set it in .env file.');
  }

  if (env.API_KEY && env.API_KEY.length < 32) {
    errors.push('API_KEY must be at least 32 characters for security.');
  }

  // Validate ranges
  if (env.WS_PORT < 1024 || env.WS_PORT > 65535) {
    errors.push('WS_PORT must be between 1024 and 65535.');
  }

  if (env.MAX_QUEUE_SIZE < 100) {
    errors.push('MAX_QUEUE_SIZE must be at least 100.');
  }

  if (env.MAX_BUFFER_MEMORY_MB < 128) {
    errors.push('MAX_BUFFER_MEMORY_MB must be at least 128.');
  }

  if (errors.length > 0) {
    console.error('Configuration errors:');
    errors.forEach(err => console.error(`  - ${err}`));
    process.exit(1);
  }
}

/**
 * Ensure required directories exist
 */
export function ensureDirectories(): void {
  const dirs = [
    env.DATA_DIR,
    env.SCANS_DIR,
    env.LOG_DIR
  ];

  for (const dir of dirs) {
    if (!existsSync(dir)) {
      mkdirSync(dir, { recursive: true });
      console.log(`Created directory: ${dir}`);
    }
  }
}

/**
 * Print configuration summary
 */
export function printConfig(): void {
  console.log('Configuration:');
  console.log(`  Environment: ${env.NODE_ENV}`);
  console.log(`  WebSocket: ${env.WS_HOST}:${env.WS_PORT}`);
  console.log(`  Database: ${env.DB_PATH}`);
  console.log(`  Scans: ${env.SCANS_DIR}`);
  console.log(`  Max Queue: ${env.MAX_QUEUE_SIZE} scans`);
  console.log(`  Max Memory: ${env.MAX_BUFFER_MEMORY_MB} MB`);
  console.log(`  Retention: ${env.RETENTION_DAYS} days`);
  console.log(`  Log Level: ${env.LOG_LEVEL}`);
}
