# Quick Reference

## Running Locally on Laptop

```bash
# Install
cd lidar-receiver
bun install

# Start server
bun dev

# Test
bun scripts/test-client.ts

# Find your IP
ipconfig getifaddr en0

# iPhone connection
ws://YOUR_IP:8080?apiKey=dev-test-key-change-me-in-production-12345678
```

## React Native Integration

### Install Packages
```bash
npm install @msgpack/msgpack uuid react-native-device-info
```

### Connection Code
```typescript
import { encode } from '@msgpack/msgpack';

const ws = new WebSocket(
  'ws://192.168.1.100:8080?apiKey=YOUR_KEY',
  {
    headers: { 'x-device-id': deviceId }
  }
);

// Send scan
const scan = {
  scanId: uuid(),
  sessionId: sessionId,
  deviceId: deviceId,
  timestamp: Date.now(),
  points: [{ x, y, z }]
};

ws.send(encode(scan));
```

### Full Implementation
See `CODING_AGENT_PROMPT.txt` - copy entire file to your coding agent.

## Server Commands

```bash
# Development
bun dev                    # Start with hot reload
bun start                  # Production mode
bun scripts/test-client.ts # Test connection

# Database
sqlite3 data/database.sqlite "SELECT COUNT(*) FROM scans;"

# Logs
tail -f logs/stdout.log

# Deploy to Pi
scp -r . pi@IP:~/lidar-receiver
ssh pi@IP "cd lidar-receiver && bash scripts/setup-pi.sh"
```

## Data Format

### LiDAR Scan (MessagePack)
```typescript
{
  scanId: string,           // UUID
  sessionId: string,        // UUID
  deviceId: string,
  timestamp: number,        // Unix ms
  points: [
    { x, y, z, intensity? }
  ],
  metadata?: {
    orientation?: { pitch, roll, yaw },
    location?: { lat, lng, alt }
  }
}
```

### Acknowledgment (JSON)
```typescript
{
  type: 'ack',
  data: {
    scanId: string,
    received: number,
    stored: boolean
  }
}
```

## Troubleshooting

### Can't connect from iPhone
1. Server running? `bun dev`
2. Same WiFi? Check network
3. Firewall? Allow port 8080
4. Use IP not localhost

### Scans dropped (stored: false)
- Reduce scan rate
- Server overloaded
- Check server logs

## File Locations

- **Server**: `lidar-receiver/src/index.ts`
- **Config**: `lidar-receiver/.env`
- **Data**: `lidar-receiver/data/`
- **Docs**: All `*.md` files

## Next Steps

1. ✅ Run server locally (`bun dev`)
2. ✅ Test connection (`bun scripts/test-client.ts`)
3. ✅ Get coding agent prompt (`CODING_AGENT_PROMPT.txt`)
4. ✅ Implement React Native client
5. ✅ Test with mock data
6. ✅ Integrate real LiDAR
7. ✅ Deploy to Raspberry Pi
