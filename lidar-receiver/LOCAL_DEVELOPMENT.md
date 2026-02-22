# Local Development Guide

Run the LiDAR receiver on your laptop for testing before deploying to Raspberry Pi.

## Quick Start (macOS/Linux)

### 1. Install Dependencies

```bash
cd lidar-receiver
bun install
```

### 2. Start Server

```bash
# Development mode (with hot reload)
bun dev

# Production mode
bun start
```

Expected output:
```
Configuration:
  Environment: development
  WebSocket: 0.0.0.0:8080
  Database: ./data/database.sqlite
  Max Queue: 1000 scans
  Max Memory: 512 MB

✓ LiDAR Receiver started successfully
WebSocket server listening on 0.0.0.0:8080
```

### 3. Test Connection

In another terminal:

```bash
bun scripts/test-client.ts
```

Should show:
```
✓ Connected to server
[1/10] Sent scan: scan-xxx (750 points)
       ✓ ACK: scan-xxx (stored: true, latency: 2ms)
```

## Connect from iPhone

### Find Your Computer's IP

```bash
# macOS
ipconfig getifaddr en0

# Linux
hostname -I | awk '{print $1}'
```

### Configure iPhone App

Use your computer's IP instead of localhost:

```
ws://192.168.1.XXX:8080?apiKey=dev-test-key-change-me-in-production-12345678
```

## Development Commands

```bash
# Start with hot reload
bun dev

# Start production mode
bun start

# Run test client
bun scripts/test-client.ts

# Check database
sqlite3 data/database.sqlite "SELECT COUNT(*) FROM scans;"

# View recent scans
sqlite3 data/database.sqlite "SELECT scanId, pointCount, datetime(timestamp/1000, 'unixepoch') FROM scans ORDER BY timestamp DESC LIMIT 10;"

# Clear all data
rm -rf data/scans/* data/database.sqlite
```

## Environment Variables

Edit `.env` for local configuration:

```bash
# Server
WS_PORT=8080              # Change if port is in use

# Authentication
API_KEY=dev-test-key-change-me-in-production-12345678

# Logging
LOG_LEVEL=debug           # Use 'debug' for development

# Performance (reduce for laptop)
MAX_QUEUE_SIZE=500
MAX_BUFFER_MEMORY_MB=256
```

## Troubleshooting

### Port 8080 Already in Use

```bash
# Find process using port 8080
lsof -i :8080

# Kill the process
kill -9 <PID>

# Or change port in .env
WS_PORT=8081
```

### Permission Denied

```bash
# Make scripts executable
chmod +x scripts/*.sh
```

### Can't Connect from iPhone

1. **Check firewall**: Allow port 8080
   ```bash
   # macOS
   sudo /usr/libexec/ApplicationFirewall/socketfilterfw --add bun
   ```

2. **Same network**: Ensure iPhone and laptop on same WiFi

3. **Use IP, not localhost**: iPhone can't connect to "localhost"

## File Structure

```
lidar-receiver/
├── data/
│   ├── database.sqlite      # Metadata
│   └── scans/              # Binary files (YYYY/MM/DD/HH/)
├── logs/                   # Application logs
└── .env                    # Configuration
```

## Monitoring

### View Logs

Server logs appear in terminal when running `bun dev`.

### Database Inspection

```bash
# Open database
sqlite3 data/database.sqlite

# Show tables
.tables

# Count scans
SELECT COUNT(*) FROM scans;

# Show sessions
SELECT * FROM sessions;

# Recent scans
SELECT
  scanId,
  pointCount,
  datetime(timestamp/1000, 'unixepoch') as time
FROM scans
ORDER BY timestamp DESC
LIMIT 10;

# Exit
.quit
```

### Storage Usage

```bash
# Total storage
du -sh data/

# Scans directory
du -sh data/scans/

# Database size
ls -lh data/database.sqlite
```

## Testing Tips

### Custom Test Parameters

```bash
# Send more scans
NUM_SCANS=100 bun scripts/test-client.ts

# Faster interval
SCAN_INTERVAL_MS=50 bun scripts/test-client.ts

# Custom device ID
DEVICE_ID=my-test-device bun scripts/test-client.ts

# Combine parameters
NUM_SCANS=50 SCAN_INTERVAL_MS=20 bun scripts/test-client.ts
```

### Stress Testing

```bash
# High volume test (1000 scans at 10ms interval)
NUM_SCANS=1000 SCAN_INTERVAL_MS=10 bun scripts/test-client.ts
```

### Monitor Performance

```bash
# While test is running, in another terminal:
watch -n 1 "sqlite3 data/database.sqlite 'SELECT COUNT(*) FROM scans'"
```

## Next Steps

Once local testing is successful:

1. ✅ Server runs and accepts connections
2. ✅ Test client can send scans
3. ✅ Data stored in database and files
4. ➡️ Deploy to Raspberry Pi (see DEPLOYMENT.md)
5. ➡️ Implement iPhone app (see REACT_NATIVE_INTEGRATION.md)
