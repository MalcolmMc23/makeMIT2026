/**
 * WebSocket server for receiving LiDAR scans
 */

import { WebSocketServer, WebSocket } from 'ws';
import type { IncomingMessage } from 'http';
import { decode } from '@msgpack/msgpack';
import { env } from '../config/env.js';
import { createLogger } from '../utils/logger.js';
import { authenticateConnection } from './auth.js';
import type { LiDARProcessor } from '../processing/lidar-processor.js';
import type { LiDARScan, WSMessage, MessageType, AckMessage } from '../models/lidar-scan.js';

const logger = createLogger('websocket');

/**
 * WebSocket client wrapper
 */
interface Client {
  ws: WebSocket;
  deviceId: string;
  connectedAt: number;
  scansReceived: number;
  lastScanAt: number;
}

/**
 * WebSocket server for LiDAR streaming
 */
export class LiDARWebSocketServer {
  private wss: WebSocketServer;
  private processor: LiDARProcessor;
  private clients: Map<string, Client> = new Map();

  constructor(processor: LiDARProcessor) {
    this.processor = processor;

    // Create WebSocket server
    this.wss = new WebSocketServer({
      port: env.WS_PORT,
      host: env.WS_HOST,
      perMessageDeflate: {
        zlibDeflateOptions: {
          level: 3 // Compression level (1-9, lower = faster)
        },
        threshold: 1024 // Only compress messages > 1KB
      },
      maxPayload: 100 * 1024 * 1024, // 100MB max message size
      verifyClient: this.verifyClient.bind(this)
    });

    this.setupEventHandlers();

    logger.info({
      host: env.WS_HOST,
      port: env.WS_PORT
    }, 'WebSocket server created');
  }

  /**
   * Verify client authentication before connection
   */
  private verifyClient(
    info: { req: IncomingMessage },
    callback: (result: boolean, code?: number, message?: string) => void
  ): void {
    const auth = authenticateConnection(info.req);

    if (!auth.authenticated) {
      logger.warn({
        ip: info.req.socket.remoteAddress,
        error: auth.error
      }, 'Client verification failed');

      callback(false, 401, auth.error || 'Unauthorized');
      return;
    }

    // Store device ID in request for later use
    (info.req as any).deviceId = auth.deviceId;
    callback(true);
  }

  /**
   * Setup WebSocket event handlers
   */
  private setupEventHandlers(): void {
    this.wss.on('connection', (ws, request) => {
      this.handleConnection(ws, request);
    });

    this.wss.on('error', (error) => {
      logger.error({ error }, 'WebSocket server error');
    });

    this.wss.on('listening', () => {
      logger.info({
        address: this.wss.address()
      }, 'WebSocket server listening');
    });
  }

  /**
   * Handle new client connection
   */
  private handleConnection(ws: WebSocket, request: IncomingMessage): void {
    const deviceId = (request as any).deviceId as string;
    const clientIp = request.socket.remoteAddress;

    const client: Client = {
      ws,
      deviceId,
      connectedAt: Date.now(),
      scansReceived: 0,
      lastScanAt: 0
    };

    this.clients.set(deviceId, client);

    logger.info({
      deviceId,
      ip: clientIp,
      totalClients: this.clients.size
    }, 'Client connected');

    // Setup client event handlers
    ws.on('message', (data) => {
      this.handleMessage(client, data);
    });

    ws.on('close', () => {
      this.handleDisconnect(client);
    });

    ws.on('error', (error) => {
      logger.error({
        deviceId,
        error
      }, 'Client WebSocket error');
    });

    ws.on('ping', () => {
      logger.debug({ deviceId }, 'Received ping');
      ws.pong();
    });

    // Send welcome message
    this.sendMessage(ws, {
      type: 'ack' as MessageType,
      data: {
        message: 'Connected to LiDAR receiver',
        deviceId,
        serverTime: Date.now()
      }
    });
  }

  /**
   * Handle incoming message
   */
  private async handleMessage(client: Client, data: any): Promise<void> {
    const receiveTime = Date.now();

    try {
      // Decode MessagePack
      const buffer = data instanceof Buffer ? data : Buffer.from(data);
      const scan = decode(buffer) as LiDARScan;

      // Add device ID if not present
      if (!scan.deviceId) {
        scan.deviceId = client.deviceId;
      }

      // Validate device ID matches
      if (scan.deviceId !== client.deviceId) {
        logger.warn({
          deviceId: client.deviceId,
          scanDeviceId: scan.deviceId,
          scanId: scan.scanId
        }, 'Device ID mismatch');

        this.sendError(client.ws, 'Device ID mismatch');
        return;
      }

      // Submit to processor
      const accepted = this.processor.submit(scan);

      // Update client stats
      client.scansReceived++;
      client.lastScanAt = receiveTime;

      // Send acknowledgment
      const ack: AckMessage = {
        scanId: scan.scanId,
        received: receiveTime,
        stored: accepted
      };

      this.sendMessage(client.ws, {
        type: 'ack' as MessageType,
        data: ack
      });

      logger.debug({
        deviceId: client.deviceId,
        scanId: scan.scanId,
        points: scan.points.length,
        accepted
      }, 'Scan received');

    } catch (error) {
      logger.error({
        deviceId: client.deviceId,
        error
      }, 'Failed to process message');

      this.sendError(client.ws, 'Failed to process scan');
    }
  }

  /**
   * Handle client disconnect
   */
  private handleDisconnect(client: Client): void {
    this.clients.delete(client.deviceId);

    const duration = Date.now() - client.connectedAt;

    logger.info({
      deviceId: client.deviceId,
      scansReceived: client.scansReceived,
      duration: `${(duration / 1000).toFixed(1)}s`,
      totalClients: this.clients.size
    }, 'Client disconnected');
  }

  /**
   * Send message to client
   */
  private sendMessage(ws: WebSocket, message: WSMessage): void {
    try {
      if (ws.readyState === WebSocket.OPEN) {
        ws.send(JSON.stringify(message));
      }
    } catch (error) {
      logger.error({ error }, 'Failed to send message');
    }
  }

  /**
   * Send error to client
   */
  private sendError(ws: WebSocket, error: string): void {
    this.sendMessage(ws, {
      type: 'error' as MessageType,
      error
    });
  }

  /**
   * Get connected clients
   */
  getClients(): Array<{
    deviceId: string;
    connectedAt: number;
    scansReceived: number;
    lastScanAt: number;
  }> {
    return Array.from(this.clients.values()).map(client => ({
      deviceId: client.deviceId,
      connectedAt: client.connectedAt,
      scansReceived: client.scansReceived,
      lastScanAt: client.lastScanAt
    }));
  }

  /**
   * Broadcast message to all clients
   */
  broadcast(message: WSMessage): void {
    this.clients.forEach(client => {
      this.sendMessage(client.ws, message);
    });
  }

  /**
   * Close server
   */
  async close(): Promise<void> {
    return new Promise((resolve, reject) => {
      logger.info('Closing WebSocket server');

      // Close all client connections
      this.clients.forEach(client => {
        client.ws.close(1000, 'Server shutting down');
      });

      // Close server
      this.wss.close((error) => {
        if (error) {
          logger.error({ error }, 'Error closing WebSocket server');
          reject(error);
        } else {
          logger.info('WebSocket server closed');
          resolve();
        }
      });
    });
  }

  /**
   * Get server statistics
   */
  getStats() {
    const clients = this.getClients();

    return {
      connectedClients: clients.length,
      totalScansReceived: clients.reduce((sum, c) => sum + c.scansReceived, 0),
      clients
    };
  }
}
