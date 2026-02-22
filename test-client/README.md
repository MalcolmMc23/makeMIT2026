# LiDAR WebSocket Test Client

Simple test client to verify WebSocket connection to LiDAR receiver.

## Quick Start

```bash
# Install dependencies
bun install

# Run test
bun test
```

## What It Does

1. ✅ Connects to WebSocket server
2. ✅ Authenticates with API key
3. ✅ Generates test point cloud (100 points)
4. ✅ Encodes with MessagePack
5. ✅ Sends to server
6. ✅ Receives acknowledgment
7. ✅ Displays results

## Expected Output

```
🧪 LiDAR WebSocket Test Client

📡 Connecting to: ws://localhost:8080
🔑 API Key: dev-test-key-chang...
📱 Device ID: test-client-simple

✅ Connected to server!

📤 Sending test scan...
   Scan ID: 550e8400-e29b-41d4-a716-446655440000
   Session ID: 7c9e6679-7425-40de-944b-e07fc1f90ae7
   Points: 100
   Timestamp: 2026-02-21T02:30:45.123Z

📦 Encoded size: 2456 bytes

📥 Received response:
{
  "type": "ack",
  "data": {
    "scanId": "550e8400-e29b-41d4-a716-446655440000",
    "received": 1771726245123,
    "stored": true
  }
}

✅ Acknowledgment Details:
   Scan ID: 550e8400-e29b-41d4-a716-446655440000
   Received at: 2026-02-21T02:30:45.123Z
   Stored: ✅ YES
   Latency: 2ms

🎉 SUCCESS! Scan was stored on server.

👋 Closing connection...

🔌 Connection closed: 1000 - Normal closure

✨ Test complete!
```

## Configuration

Edit `index.ts` to change:

```typescript
const SERVER_URL = 'ws://localhost:8080';  // Change to your server
const API_KEY = 'your-api-key-here';       // Your API key
const DEVICE_ID = 'test-client-simple';    // Any unique ID
```

## Troubleshooting

### Can't connect
- Make sure server is running: `cd ../lidar-receiver && bun dev`
- Check server URL is correct
- Verify firewall allows port 8080

### Authentication failed
- Check API key matches server's `.env` file
- Verify no extra spaces in API key

### Scan not stored (stored: false)
- Server is overloaded
- Buffer is full
- This is normal under heavy load

## Files

- `index.ts` - Main test client
- `package.json` - Dependencies
- `README.md` - This file
