/**
 * Simple WebSocket Test Client
 * Tests connection to LiDAR receiver
 */

import { WebSocket } from 'ws';
import { encode } from '@msgpack/msgpack';

// Configuration
const SERVER_URL = 'ws://localhost:8080';
const API_KEY = 'dev-test-key-change-me-in-production-12345678';
const DEVICE_ID = 'test-client-simple';

// Generate random UUID
function uuid(): string {
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
    const r = Math.random() * 16 | 0;
    const v = c === 'x' ? r : (r & 0x3 | 0x8);
    return v.toString(16);
  });
}

// Generate test point cloud
function generateTestPoints(count: number = 100) {
  const points = [];
  for (let i = 0; i < count; i++) {
    points.push({
      x: (Math.random() - 0.5) * 10,
      y: (Math.random() - 0.5) * 10,
      z: (Math.random() - 0.5) * 10,
      intensity: Math.random()
    });
  }
  return points;
}

// Main test
async function testConnection() {
  console.log('🧪 LiDAR WebSocket Test Client\n');
  console.log(`📡 Connecting to: ${SERVER_URL}`);
  console.log(`🔑 API Key: ${API_KEY.substring(0, 20)}...`);
  console.log(`📱 Device ID: ${DEVICE_ID}\n`);

  // Create WebSocket connection
  const url = `${SERVER_URL}?apiKey=${API_KEY}`;
  const ws = new WebSocket(url, {
    headers: {
      'x-device-id': DEVICE_ID
    }
  });

  // Connection opened
  ws.on('open', () => {
    console.log('✅ Connected to server!\n');

    // Create test scan
    const sessionId = uuid();
    const scan = {
      scanId: uuid(),
      sessionId: sessionId,
      deviceId: DEVICE_ID,
      timestamp: Date.now(),
      points: generateTestPoints(100),
      metadata: {
        orientation: {
          pitch: 45.2,
          roll: -2.1,
          yaw: 180.0
        },
        confidence: 0.95
      }
    };

    console.log('📤 Sending test scan...');
    console.log(`   Scan ID: ${scan.scanId}`);
    console.log(`   Session ID: ${scan.sessionId}`);
    console.log(`   Points: ${scan.points.length}`);
    console.log(`   Timestamp: ${new Date(scan.timestamp).toISOString()}\n`);

    // Encode with MessagePack
    const encoded = encode(scan);
    console.log(`📦 Encoded size: ${encoded.length} bytes\n`);

    // Send to server
    ws.send(Buffer.from(encoded));
  });

  // Message received
  ws.on('message', (data) => {
    try {
      const message = JSON.parse(data.toString());

      console.log('📥 Received response:');
      console.log(JSON.stringify(message, null, 2));
      console.log('');

      if (message.type === 'ack' && message.data) {
        const ack = message.data;

        // Check if this is a scan acknowledgment (not welcome message)
        if (ack.scanId) {
          const latency = Date.now() - ack.received;

          console.log('✅ Acknowledgment Details:');
          console.log(`   Scan ID: ${ack.scanId}`);
          console.log(`   Received at: ${new Date(ack.received).toISOString()}`);
          console.log(`   Stored: ${ack.stored ? '✅ YES' : '❌ NO'}`);
          console.log(`   Latency: ${Math.abs(latency)}ms\n`);

          if (ack.stored) {
            console.log('🎉 SUCCESS! Scan was stored on server.\n');
          } else {
            console.log('⚠️  WARNING: Scan was dropped (server backpressure)\n');
          }

          // Close connection after test
          setTimeout(() => {
            console.log('👋 Closing connection...');
            ws.close();
          }, 1000);
        } else {
          // Welcome message
          console.log('👋 Welcome message from server\n');
        }
      }
    } catch (error) {
      console.error('❌ Failed to parse message:', error);
    }
  });

  // Error occurred
  ws.on('error', (error) => {
    console.error('❌ WebSocket error:', error.message);
    process.exit(1);
  });

  // Connection closed
  ws.on('close', (code, reason) => {
    console.log(`\n🔌 Connection closed: ${code} - ${reason || 'Normal closure'}`);
    console.log('\n✨ Test complete!\n');
    process.exit(0);
  });
}

// Run test
console.clear();
testConnection().catch((error) => {
  console.error('❌ Test failed:', error);
  process.exit(1);
});
