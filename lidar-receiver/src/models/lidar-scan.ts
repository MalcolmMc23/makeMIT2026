/**
 * LiDAR Point Cloud Data Models
 */

/**
 * Individual 3D point from LiDAR sensor
 */
export interface LiDARPoint {
  x: number;
  y: number;
  z: number;
  intensity?: number; // Optional reflectance intensity (0-1)
}

/**
 * Complete LiDAR scan with metadata
 */
export interface LiDARScan {
  scanId: string;          // Unique identifier for this scan
  sessionId: string;       // Session identifier (groups related scans)
  deviceId: string;        // Device that captured the scan
  timestamp: number;       // Unix timestamp (milliseconds)
  points: LiDARPoint[];    // Array of 3D points
  metadata?: {
    orientation?: {        // Device orientation when captured
      pitch: number;
      roll: number;
      yaw: number;
    };
    location?: {          // GPS coordinates (if available)
      latitude: number;
      longitude: number;
      altitude?: number;
    };
    confidence?: number;  // Scan quality metric (0-1)
    [key: string]: any;   // Additional custom metadata
  };
}

/**
 * Database record for scan metadata
 */
export interface ScanMetadata {
  id?: number;             // Auto-increment primary key
  scanId: string;
  sessionId: string;
  deviceId: string;
  timestamp: number;
  filePath: string;        // Path to binary file
  sizeBytes: number;       // File size
  pointCount: number;      // Number of points in scan
  createdAt?: string;      // ISO timestamp
}

/**
 * Session metadata
 */
export interface SessionMetadata {
  id?: number;
  sessionId: string;
  deviceId: string;
  startTime: number;
  endTime?: number;
  scanCount: number;
  totalPoints: number;
  totalSizeBytes: number;
  createdAt?: string;
}

/**
 * WebSocket message types
 */
export enum MessageType {
  SCAN = 'scan',
  ACK = 'ack',
  ERROR = 'error',
  PING = 'ping',
  PONG = 'pong'
}

/**
 * WebSocket message wrapper
 */
export interface WSMessage {
  type: MessageType;
  data?: any;
  error?: string;
}

/**
 * Acknowledgment message
 */
export interface AckMessage {
  scanId: string;
  received: number;       // Server timestamp
  processed?: number;     // Processing timestamp
  stored?: boolean;
}
