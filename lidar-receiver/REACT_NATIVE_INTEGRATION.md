# React Native LiDAR Integration Guide

Complete implementation guide for connecting your React Native app to the LiDAR receiver.

## Overview

This guide shows you how to:
1. Capture LiDAR data from iPhone
2. Encode it with MessagePack
3. Send it over WebSocket to the receiver
4. Handle acknowledgments and errors

## Installation

### Required Packages

```bash
npm install @msgpack/msgpack react-native-webrtc uuid
# or
yarn add @msgpack/msgpack react-native-webrtc uuid
```

### iOS Permissions

Add to `Info.plist`:

```xml
<key>NSCameraUsageDescription</key>
<string>We need camera access to capture LiDAR data</string>
```

## Implementation

### 1. Data Types

Create `types/lidar.ts`:

```typescript
export interface LiDARPoint {
  x: number;
  y: number;
  z: number;
  intensity?: number;
}

export interface LiDARScan {
  scanId: string;
  sessionId: string;
  deviceId: string;
  timestamp: number;
  points: LiDARPoint[];
  metadata?: {
    orientation?: {
      pitch: number;
      roll: number;
      yaw: number;
    };
    location?: {
      latitude: number;
      longitude: number;
      altitude?: number;
    };
    confidence?: number;
  };
}

export interface AckMessage {
  scanId: string;
  received: number;
  processed?: number;
  stored?: boolean;
}
```

### 2. LiDAR Service

Create `services/LiDARService.ts`:

```typescript
import { encode } from '@msgpack/msgpack';
import { v4 as uuid } from 'uuid';

interface Config {
  serverUrl: string;      // ws://192.168.1.100:8080
  apiKey: string;
  deviceId: string;
}

export class LiDARService {
  private ws: WebSocket | null = null;
  private sessionId: string;
  private config: Config;
  private connected = false;
  private reconnectAttempts = 0;
  private maxReconnectAttempts = 5;

  // Callbacks
  onConnect?: () => void;
  onDisconnect?: () => void;
  onError?: (error: Error) => void;
  onAck?: (ack: AckMessage) => void;

  constructor(config: Config) {
    this.config = config;
    this.sessionId = uuid();
  }

  /**
   * Connect to WebSocket server
   */
  connect(): Promise<void> {
    return new Promise((resolve, reject) => {
      try {
        const url = `${this.config.serverUrl}?apiKey=${this.config.apiKey}`;

        this.ws = new WebSocket(url, {
          headers: {
            'x-device-id': this.config.deviceId,
          },
        });

        this.ws.onopen = () => {
          console.log('✓ Connected to LiDAR receiver');
          this.connected = true;
          this.reconnectAttempts = 0;
          this.onConnect?.();
          resolve();
        };

        this.ws.onmessage = (event) => {
          this.handleMessage(event.data);
        };

        this.ws.onerror = (error) => {
          console.error('WebSocket error:', error);
          this.onError?.(new Error('WebSocket error'));
        };

        this.ws.onclose = () => {
          console.log('Disconnected from LiDAR receiver');
          this.connected = false;
          this.onDisconnect?.();
          this.attemptReconnect();
        };

      } catch (error) {
        reject(error);
      }
    });
  }

  /**
   * Handle incoming messages
   */
  private handleMessage(data: string): void {
    try {
      const message = JSON.parse(data);

      if (message.type === 'ack' && message.data) {
        this.onAck?.(message.data);
      } else if (message.type === 'error') {
        console.error('Server error:', message.error);
        this.onError?.(new Error(message.error));
      }
    } catch (error) {
      console.error('Failed to parse message:', error);
    }
  }

  /**
   * Attempt to reconnect
   */
  private attemptReconnect(): void {
    if (this.reconnectAttempts >= this.maxReconnectAttempts) {
      console.error('Max reconnect attempts reached');
      return;
    }

    this.reconnectAttempts++;
    const delay = Math.min(1000 * Math.pow(2, this.reconnectAttempts), 10000);

    console.log(`Reconnecting in ${delay}ms (attempt ${this.reconnectAttempts})`);

    setTimeout(() => {
      this.connect().catch((error) => {
        console.error('Reconnect failed:', error);
      });
    }, delay);
  }

  /**
   * Send LiDAR scan to server
   */
  async sendScan(points: LiDARPoint[], metadata?: any): Promise<boolean> {
    if (!this.connected || !this.ws) {
      console.error('Not connected to server');
      return false;
    }

    try {
      const scan: LiDARScan = {
        scanId: uuid(),
        sessionId: this.sessionId,
        deviceId: this.config.deviceId,
        timestamp: Date.now(),
        points,
        metadata,
      };

      // Encode with MessagePack
      const encoded = encode(scan);

      // Send as ArrayBuffer
      this.ws.send(encoded);

      console.log(`Sent scan ${scan.scanId} with ${points.length} points`);
      return true;

    } catch (error) {
      console.error('Failed to send scan:', error);
      this.onError?.(error as Error);
      return false;
    }
  }

  /**
   * Disconnect from server
   */
  disconnect(): void {
    if (this.ws) {
      this.ws.close();
      this.ws = null;
    }
    this.connected = false;
  }

  /**
   * Check if connected
   */
  isConnected(): boolean {
    return this.connected;
  }

  /**
   * Get current session ID
   */
  getSessionId(): string {
    return this.sessionId;
  }

  /**
   * Start new session
   */
  newSession(): void {
    this.sessionId = uuid();
  }
}
```

### 3. LiDAR Capture Hook

Create `hooks/useLiDAR.ts`:

```typescript
import { useState, useEffect, useRef } from 'react';
import { LiDARService } from '../services/LiDARService';
import type { LiDARPoint, AckMessage } from '../types/lidar';
import DeviceInfo from 'react-native-device-info';

interface UseLiDAROptions {
  serverUrl: string;
  apiKey: string;
  autoConnect?: boolean;
}

export function useLiDAR(options: UseLiDAROptions) {
  const [connected, setConnected] = useState(false);
  const [scanning, setScanning] = useState(false);
  const [scanCount, setScanCount] = useState(0);
  const [lastAck, setLastAck] = useState<AckMessage | null>(null);

  const serviceRef = useRef<LiDARService | null>(null);

  useEffect(() => {
    // Initialize service
    const deviceId = DeviceInfo.getUniqueId();

    const service = new LiDARService({
      serverUrl: options.serverUrl,
      apiKey: options.apiKey,
      deviceId,
    });

    // Setup callbacks
    service.onConnect = () => {
      console.log('Connected to LiDAR receiver');
      setConnected(true);
    };

    service.onDisconnect = () => {
      console.log('Disconnected from LiDAR receiver');
      setConnected(false);
    };

    service.onError = (error) => {
      console.error('LiDAR service error:', error);
    };

    service.onAck = (ack) => {
      setLastAck(ack);
      setScanCount((prev) => prev + 1);
    };

    serviceRef.current = service;

    // Auto-connect if enabled
    if (options.autoConnect) {
      service.connect().catch(console.error);
    }

    // Cleanup
    return () => {
      service.disconnect();
    };
  }, [options.serverUrl, options.apiKey, options.autoConnect]);

  const connect = async () => {
    if (serviceRef.current) {
      await serviceRef.current.connect();
    }
  };

  const disconnect = () => {
    if (serviceRef.current) {
      serviceRef.current.disconnect();
    }
  };

  const sendScan = async (points: LiDARPoint[], metadata?: any) => {
    if (serviceRef.current) {
      return await serviceRef.current.sendScan(points, metadata);
    }
    return false;
  };

  const startScanning = () => {
    setScanning(true);
  };

  const stopScanning = () => {
    setScanning(false);
  };

  const newSession = () => {
    if (serviceRef.current) {
      serviceRef.current.newSession();
      setScanCount(0);
    }
  };

  return {
    connected,
    scanning,
    scanCount,
    lastAck,
    connect,
    disconnect,
    sendScan,
    startScanning,
    stopScanning,
    newSession,
  };
}
```

### 4. React Component Example

Create `components/LiDARScanner.tsx`:

```typescript
import React, { useEffect } from 'react';
import { View, Text, Button, StyleSheet } from 'react-native';
import { useLiDAR } from '../hooks/useLiDAR';
import { LiDARPoint } from '../types/lidar';

// NOTE: You'll need to replace this with actual LiDAR capture
// using ARKit or similar library
function captureLiDARFrame(): LiDARPoint[] {
  // This is a placeholder
  // In real app, use react-native-arkit or similar
  return [];
}

export function LiDARScanner() {
  const lidar = useLiDAR({
    serverUrl: 'ws://192.168.1.100:8080',  // Replace with your server
    apiKey: 'dev-test-key-change-me-in-production-12345678',
    autoConnect: true,
  });

  // Capture and send LiDAR data when scanning
  useEffect(() => {
    if (!lidar.scanning) return;

    const interval = setInterval(async () => {
      const points = captureLiDARFrame();

      if (points.length > 0) {
        await lidar.sendScan(points, {
          confidence: 0.95,
          // Add device orientation, location, etc.
        });
      }
    }, 100); // 10 scans per second

    return () => clearInterval(interval);
  }, [lidar.scanning]);

  return (
    <View style={styles.container}>
      <Text style={styles.title}>LiDAR Scanner</Text>

      <View style={styles.status}>
        <Text>Connected: {lidar.connected ? '✓' : '✗'}</Text>
        <Text>Scans Sent: {lidar.scanCount}</Text>
        {lidar.lastAck && (
          <Text>
            Last ACK: {lidar.lastAck.scanId.substring(0, 8)}...
            {lidar.lastAck.stored ? ' ✓' : ' ✗'}
          </Text>
        )}
      </View>

      <View style={styles.buttons}>
        {!lidar.connected ? (
          <Button title="Connect" onPress={lidar.connect} />
        ) : (
          <>
            <Button
              title={lidar.scanning ? 'Stop Scanning' : 'Start Scanning'}
              onPress={lidar.scanning ? lidar.stopScanning : lidar.startScanning}
            />
            <Button title="New Session" onPress={lidar.newSession} />
            <Button title="Disconnect" onPress={lidar.disconnect} />
          </>
        )}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    padding: 20,
  },
  title: {
    fontSize: 24,
    fontWeight: 'bold',
    marginBottom: 20,
  },
  status: {
    marginBottom: 20,
  },
  buttons: {
    gap: 10,
  },
});
```

## Configuration

### Server Connection

```typescript
// Development (local laptop)
const serverUrl = 'ws://192.168.1.XXX:8080';

// Production (Raspberry Pi)
const serverUrl = 'ws://192.168.1.100:8080';

// Use environment variable
const serverUrl = process.env.LIDAR_SERVER_URL;
```

### API Key

Store in environment variables or secure storage:

```typescript
import Config from 'react-native-config';

const apiKey = Config.LIDAR_API_KEY;
```

## Error Handling

```typescript
service.onError = (error) => {
  if (error.message.includes('Unauthorized')) {
    Alert.alert('Authentication Error', 'Invalid API key');
  } else if (error.message.includes('Connection')) {
    Alert.alert('Connection Error', 'Cannot reach server');
  } else {
    Alert.alert('Error', error.message);
  }
};
```

## Performance Tips

1. **Throttle scan rate**: Don't send more than 30 scans/sec
2. **Filter points**: Remove low-confidence points
3. **Batch if needed**: Combine multiple frames
4. **Monitor acknowledgments**: Track stored vs dropped scans
5. **Handle backpressure**: Slow down if server is dropping scans

## Testing

```typescript
// Mock data for testing
function generateMockScan(pointCount: number = 1000): LiDARPoint[] {
  return Array.from({ length: pointCount }, () => ({
    x: (Math.random() - 0.5) * 10,
    y: (Math.random() - 0.5) * 10,
    z: (Math.random() - 0.5) * 10,
    intensity: Math.random(),
  }));
}

// Test connection
const testScan = generateMockScan(500);
await lidar.sendScan(testScan);
```

## Complete Example

See `examples/LiDARApp.tsx` for a complete working example with:
- ARKit integration
- Real LiDAR capture
- UI controls
- Error handling
- Performance monitoring

## Troubleshooting

### Can't Connect

1. Check server is running: `bun dev`
2. Verify server URL (use IP, not localhost)
3. Confirm same WiFi network
4. Check firewall allows port 8080

### Scans Not Stored

Check acknowledgment messages:
```typescript
service.onAck = (ack) => {
  if (!ack.stored) {
    console.warn('Server dropped scan due to backpressure');
    // Slow down scan rate
  }
};
```

### High Latency

- Reduce scan rate
- Filter points (send fewer points per scan)
- Check network quality
- Ensure server not overloaded

## Next Steps

1. ✅ Implement LiDAR capture using ARKit
2. ✅ Test with mock data
3. ✅ Test with real LiDAR data
4. ✅ Deploy to Raspberry Pi
5. ✅ Test end-to-end on same network
6. ✅ Add error handling and retry logic
7. ✅ Optimize performance
