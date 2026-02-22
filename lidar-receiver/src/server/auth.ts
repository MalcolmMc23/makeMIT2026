/**
 * Authentication middleware for WebSocket connections
 */

import type { IncomingMessage } from 'http';
import { env } from '../config/env.js';
import { createLogger } from '../utils/logger.js';

const logger = createLogger('auth');

/**
 * Authentication result
 */
export interface AuthResult {
  authenticated: boolean;
  deviceId: string | null;
  error?: string;
}

/**
 * Extract query parameters from URL
 */
function parseQueryString(url: string): Map<string, string> {
  const params = new Map<string, string>();

  try {
    const urlObj = new URL(url, 'http://localhost');
    urlObj.searchParams.forEach((value, key) => {
      params.set(key, value);
    });
  } catch (error) {
    logger.debug({ error, url }, 'Failed to parse URL');
  }

  return params;
}

/**
 * Authenticate WebSocket connection
 */
export function authenticateConnection(request: IncomingMessage): AuthResult {
  // Extract API key from query string or header
  const query = parseQueryString(request.url || '');
  const apiKeyFromQuery = query.get('apiKey') || query.get('api_key');
  const apiKeyFromHeader = request.headers['x-api-key'] as string | undefined;
  const apiKey = apiKeyFromQuery || apiKeyFromHeader;

  // Extract device ID from header or query
  const deviceIdFromHeader = request.headers['x-device-id'] as string | undefined;
  const deviceIdFromQuery = query.get('deviceId') || query.get('device_id');
  const deviceId = deviceIdFromHeader || deviceIdFromQuery;

  // Validate API key
  if (!apiKey) {
    logger.warn({
      ip: request.socket.remoteAddress
    }, 'Authentication failed: Missing API key');

    return {
      authenticated: false,
      deviceId: null,
      error: 'Missing API key'
    };
  }

  if (apiKey !== env.API_KEY) {
    logger.warn({
      ip: request.socket.remoteAddress,
      providedKey: apiKey.substring(0, 8) + '...'
    }, 'Authentication failed: Invalid API key');

    return {
      authenticated: false,
      deviceId: null,
      error: 'Invalid API key'
    };
  }

  // Validate device ID
  if (!deviceId) {
    logger.warn({
      ip: request.socket.remoteAddress
    }, 'Authentication failed: Missing device ID');

    return {
      authenticated: false,
      deviceId: null,
      error: 'Missing device ID'
    };
  }

  // Success
  logger.info({
    deviceId,
    ip: request.socket.remoteAddress
  }, 'Authentication successful');

  return {
    authenticated: true,
    deviceId
  };
}
