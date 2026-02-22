/**
 * LiDAR Receiver - Main Entry Point
 */

import { env, validateConfig, ensureDirectories, printConfig } from './config/env.js';
import { logger, createLogger } from './utils/logger.js';
import { BufferManager } from './processing/buffer-manager.js';
import { FileWriter } from './storage/file-writer.js';
import { ScanDatabase } from './storage/database.js';
import { LiDARProcessor } from './processing/lidar-processor.js';
import { LiDARWebSocketServer } from './server/websocket.js';
import { RetentionManager } from './storage/retention.js';

const appLogger = createLogger('app');

/**
 * Application instance
 */
class LiDARReceiverApp {
  private buffer!: BufferManager;
  private fileWriter!: FileWriter;
  private db!: ScanDatabase;
  private processor!: LiDARProcessor;
  private wsServer!: LiDARWebSocketServer;
  private retention!: RetentionManager;

  /**
   * Initialize application
   */
  async initialize(): Promise<void> {
    appLogger.info('Initializing LiDAR Receiver');

    // Validate configuration
    validateConfig();

    // Ensure directories exist
    ensureDirectories();

    // Print configuration
    printConfig();

    // Initialize components
    this.buffer = new BufferManager(
      env.MAX_QUEUE_SIZE,
      env.MAX_BUFFER_MEMORY_MB
    );

    this.fileWriter = new FileWriter(env.SCANS_DIR);
    this.db = new ScanDatabase(env.DB_PATH);

    this.processor = new LiDARProcessor(
      this.buffer,
      this.fileWriter,
      this.db
    );

    this.wsServer = new LiDARWebSocketServer(this.processor);

    this.retention = new RetentionManager(
      this.db,
      env.SCANS_DIR,
      env.RETENTION_DAYS
    );

    appLogger.info('All components initialized');
  }

  /**
   * Start application
   */
  async start(): Promise<void> {
    appLogger.info('Starting LiDAR Receiver');

    // Start processor
    this.processor.start();

    // Start retention manager
    this.retention.start();

    // Setup graceful shutdown handlers
    this.setupShutdownHandlers();

    appLogger.info('✓ LiDAR Receiver started successfully');
    appLogger.info(`WebSocket server listening on ${env.WS_HOST}:${env.WS_PORT}`);

    // Log stats periodically
    this.startStatsLogger();
  }

  /**
   * Setup graceful shutdown handlers
   */
  private setupShutdownHandlers(): void {
    const shutdown = async (signal: string) => {
      appLogger.info({ signal }, 'Received shutdown signal');

      try {
        // Stop accepting new connections
        await this.wsServer.close();

        // Stop retention manager
        this.retention.stop();

        // Gracefully shutdown processor (drain buffer)
        await this.processor.shutdown();

        // Close database
        this.db.close();

        appLogger.info('Graceful shutdown completed');
        process.exit(0);
      } catch (error) {
        appLogger.error({ error }, 'Error during shutdown');
        process.exit(1);
      }
    };

    process.on('SIGTERM', () => shutdown('SIGTERM'));
    process.on('SIGINT', () => shutdown('SIGINT'));

    // Handle uncaught errors
    process.on('uncaughtException', (error) => {
      appLogger.fatal({ error }, 'Uncaught exception');
      process.exit(1);
    });

    process.on('unhandledRejection', (reason) => {
      appLogger.fatal({ reason }, 'Unhandled rejection');
      process.exit(1);
    });
  }

  /**
   * Log statistics periodically
   */
  private startStatsLogger(): void {
    // Log stats every 60 seconds
    setInterval(() => {
      const stats = this.processor.getStats();
      const wsStats = this.wsServer.getStats();
      const retentionStats = this.retention.getStats();

      appLogger.info({
        processor: {
          received: stats.processor.received,
          processed: stats.processor.processed,
          failed: stats.processor.failed,
          uptime: stats.processor.uptimeFormatted,
          throughput: stats.processor.throughput
        },
        buffer: {
          queueSize: stats.buffer.currentQueueSize,
          memoryMB: stats.buffer.currentMemoryMB.toFixed(1),
          fillLevel: `${(stats.buffer.fillLevel * 100).toFixed(1)}%`
        },
        websocket: {
          connectedClients: wsStats.connectedClients,
          totalScansReceived: wsStats.totalScansReceived
        },
        database: {
          totalScans: stats.database.totalScans,
          totalSessions: stats.database.totalSessions,
          totalPoints: stats.database.totalPoints
        },
        retention: {
          retentionDays: retentionStats.retentionDays,
          cutoffDate: retentionStats.cutoffDate.toISOString()
        }
      }, 'System statistics');
    }, 60000);
  }
}

/**
 * Main entry point
 */
async function main() {
  try {
    const app = new LiDARReceiverApp();
    await app.initialize();
    await app.start();
  } catch (error) {
    logger.fatal({ error }, 'Failed to start application');
    process.exit(1);
  }
}

// Start application
main();
