# LiDAR Receiver for Raspberry Pi 4

Real-time WebSocket server for receiving and storing LiDAR point cloud data from iPhone React Native app.

## Features

- **Real-time WebSocket streaming** - Low-latency data reception
- **Hybrid storage** - SQLite metadata + MessagePack binary files
- **Backpressure handling** - Memory-aware buffer management
- **Automatic retention** - Configurable data cleanup
- **Production ready** - Systemd service with auto-restart
- **High performance** - Optimized for Raspberry Pi 4

## Architecture

```
iPhone LiDAR App
      ↓
   WebSocket
      ↓
Authentication Layer
      ↓
  Buffer Manager (backpressure)
      ↓
   Processor
      ↓
File Writer + Database
      ↓
    Storage
```

## Requirements

- Raspberry Pi 4 (4GB+ RAM recommended)
- Raspberry Pi OS (64-bit)
- Network connection
- SSD recommended (for write performance)

## Quick Start

### 1. Transfer Project to Pi

```bash
scp -r ./lidar-receiver pi@<PI_IP>:~/
```

### 2. Setup Environment

```bash
ssh pi@<PI_IP>
cd ~/lidar-receiver
chmod +x scripts/*.sh
bash scripts/setup-pi.sh
```

This will:
- Install Bun runtime
- Install dependencies
- Generate secure API key
- Create `.env` configuration

### 3. Test Locally

```bash
bun start
```

### 4. Install as Service

```bash
bash scripts/install-service.sh
```

### 5. Configure iPhone App

Use the WebSocket URL shown after setup:

```
ws://<PI_IP>:8080?apiKey=<YOUR_API_KEY>
```

Add header:
```
x-device-id: <unique-device-id>
```

## Configuration

Edit `.env` file:

```bash
# Server
WS_PORT=8080          # WebSocket port
WS_HOST=0.0.0.0       # Listen on all interfaces

# Authentication
API_KEY=<secure-key>  # Generated during setup

# Performance
MAX_QUEUE_SIZE=1000           # Max scans in buffer
MAX_BUFFER_MEMORY_MB=512      # Max buffer memory
PROCESSING_INTERVAL_MS=10     # Processing interval

# Retention
RETENTION_DAYS=30     # Auto-delete scans older than 30 days

# Logging
LOG_LEVEL=info        # debug|info|warn|error
```

## Development

### Local Development

```bash
# Install dependencies
bun install

# Copy environment template
cp .env.example .env

# Edit configuration
nano .env

# Run in development mode (with hot reload)
bun dev

# Run in production mode
bun start
```

### Testing WebSocket

Use a WebSocket client like [Postman](https://www.postman.com/) or [websocat](https://github.com/vi/websocat):

```bash
# Install websocat
curl -L https://github.com/vi/websocat/releases/download/v1.12.0/websocat.aarch64-unknown-linux-musl -o websocat
chmod +x websocat

# Connect
./websocat "ws://localhost:8080?apiKey=your-key" \
  -H "x-device-id: test-device"
```

## Data Format

### Input (MessagePack encoded)

```typescript
{
  scanId: string,
  sessionId: string,
  deviceId: string,
  timestamp: number,  // Unix timestamp (ms)
  points: [
    { x: number, y: number, z: number, intensity?: number },
    ...
  ],
  metadata?: {
    orientation?: { pitch, roll, yaw },
    location?: { latitude, longitude, altitude },
    confidence?: number
  }
}
```

### Storage Structure

```
data/
├── database.sqlite           # Metadata
└── scans/                   # Binary files
    └── YYYY/
        └── MM/
            └── DD/
                └── HH/
                    └── <scanId>.msgpack
```

## Service Management

```bash
# Status
sudo systemctl status lidar-receiver

# Logs (live)
sudo journalctl -u lidar-receiver -f

# Restart
sudo systemctl restart lidar-receiver

# Stop
sudo systemctl stop lidar-receiver

# Disable auto-start
sudo systemctl disable lidar-receiver
```

## Monitoring

### Check Statistics

View logs for periodic stats (every 60 seconds):

```bash
sudo journalctl -u lidar-receiver -f | grep "System statistics"
```

### Database Queries

```bash
sqlite3 data/database.sqlite

# Total scans
SELECT COUNT(*) FROM scans;

# Scans by session
SELECT sessionId, COUNT(*) as count, SUM(pointCount) as total_points
FROM scans
GROUP BY sessionId;

# Recent scans
SELECT scanId, datetime(timestamp/1000, 'unixepoch') as time, pointCount
FROM scans
ORDER BY timestamp DESC
LIMIT 10;
```

## Performance

**Expected Throughput (Raspberry Pi 4 with SSD)**:
- **Scans**: 15-30 scans/sec
- **Throughput**: 15-30 MB/sec
- **Latency**: 5-20ms (receive → store)
- **CPU**: 30-50%
- **Memory**: 500-800MB

## Troubleshooting

### Service won't start

```bash
# Check logs
sudo journalctl -u lidar-receiver -n 50

# Check permissions
ls -la ~/lidar-receiver/.env
# Should show: -rw------- (600)

# Verify Bun is installed
bun --version
```

### High memory usage

Reduce buffer size in `.env`:

```bash
MAX_BUFFER_MEMORY_MB=256
MAX_QUEUE_SIZE=500
```

### Connection refused

```bash
# Check firewall
sudo ufw status

# Allow port
sudo ufw allow 8080/tcp

# Check if service is listening
sudo netstat -tulpn | grep 8080
```

## Directory Structure

```
lidar-receiver/
├── src/
│   ├── config/         # Configuration
│   ├── models/         # TypeScript types
│   ├── processing/     # Buffer & processor
│   ├── server/         # WebSocket server
│   ├── storage/        # Database & files
│   ├── utils/          # Logging
│   └── index.ts        # Entry point
├── data/               # Storage
├── logs/               # Application logs
├── scripts/            # Setup scripts
├── systemd/            # Service definition
├── package.json
└── .env                # Configuration
```

## Security

### Current Implementation

- API key authentication
- Query string or header-based auth
- Device ID validation

### Production Recommendations

1. **Use WSS (TLS)**: Encrypt WebSocket traffic
2. **JWT tokens**: Replace simple API key
3. **Rate limiting**: Prevent abuse
4. **Firewall**: Restrict access to known IPs
5. **VPN**: Use VPN for remote access

## License

MIT

## Support

For issues, check:
1. Service logs: `sudo journalctl -u lidar-receiver -f`
2. Application logs: `cat ~/lidar-receiver/logs/stderr.log`
3. Database: `sqlite3 data/database.sqlite ".schema"`
