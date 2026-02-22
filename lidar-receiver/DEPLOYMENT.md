# Deployment Guide

Complete deployment guide for LiDAR Receiver on Raspberry Pi 4.

## Pre-Deployment Checklist

- [ ] Raspberry Pi 4 (4GB+ RAM)
- [ ] Raspberry Pi OS 64-bit installed
- [ ] SSH enabled
- [ ] Network connection configured
- [ ] Static IP assigned (recommended)
- [ ] SSD for storage (recommended)

## Step-by-Step Deployment

### 1. Prepare Raspberry Pi

#### Flash OS
```bash
# Use Raspberry Pi Imager
# Select: Raspberry Pi OS (64-bit)
# Enable SSH in advanced options
# Set hostname: lidar-pi
# Configure WiFi credentials
```

#### Assign Static IP
```bash
# Edit dhcpcd.conf
sudo nano /etc/dhcpcd.conf

# Add:
interface wlan0
static ip_address=192.168.1.100/24
static routers=192.168.1.1
static domain_name_servers=8.8.8.8 8.8.4.4

# Restart networking
sudo systemctl restart dhcpcd
```

### 2. Transfer Project Files

From your development machine:

```bash
# Create project directory on Pi
ssh pi@192.168.1.100 "mkdir -p ~/lidar-receiver"

# Transfer files
scp -r ./lidar-receiver/* pi@192.168.1.100:~/lidar-receiver/

# Or use rsync (recommended)
rsync -avz --progress ./lidar-receiver/ pi@192.168.1.100:~/lidar-receiver/
```

### 3. Run Setup Script

SSH into Raspberry Pi and run setup:

```bash
ssh pi@192.168.1.100
cd ~/lidar-receiver
chmod +x scripts/*.sh
bash scripts/setup-pi.sh
```

The setup script will:
1. Update system packages
2. Install system dependencies
3. Install Bun runtime
4. Create directories
5. Install Node dependencies
6. Generate secure API key
7. Create `.env` file
8. Set permissions

**IMPORTANT**: Save the generated API key! You'll need it for the iPhone app.

### 4. Test Installation

Before installing as a service, test that everything works:

```bash
# Start server manually
bun start

# In another terminal, run test client
bun scripts/test-client.ts
```

Expected output:
```
✓ Connected to server
[1/10] Sent scan: scan-xxx (750 points)
       ✓ ACK: scan-xxx (stored: true, latency: 15ms)
...
```

Press Ctrl+C to stop the server.

### 5. Install as System Service

```bash
bash scripts/install-service.sh
```

Verify service is running:

```bash
sudo systemctl status lidar-receiver
```

Should show: `Active: active (running)`

### 6. Configure Firewall (if enabled)

```bash
# Check firewall status
sudo ufw status

# If active, allow WebSocket port
sudo ufw allow 8080/tcp

# Verify
sudo ufw status
```

### 7. Configure iPhone App

Use these connection details in your React Native app:

**WebSocket URL**:
```
ws://192.168.1.100:8080?apiKey=<YOUR_API_KEY>
```

**Headers**:
```javascript
{
  'x-device-id': 'iphone-<unique-id>'
}
```

**Message Format**:
```javascript
// Encode with MessagePack
import { encode } from '@msgpack/msgpack';

const scan = {
  scanId: uuid(),
  sessionId: sessionId,
  deviceId: deviceId,
  timestamp: Date.now(),
  points: lidarPoints,
  metadata: {
    orientation: { pitch, roll, yaw },
    location: { latitude, longitude }
  }
};

const encoded = encode(scan);
ws.send(encoded);
```

## Verification

### Check Service Logs

```bash
# Live logs
sudo journalctl -u lidar-receiver -f

# Last 100 lines
sudo journalctl -u lidar-receiver -n 100

# Logs from today
sudo journalctl -u lidar-receiver --since today
```

### Check Database

```bash
cd ~/lidar-receiver
sqlite3 data/database.sqlite

# Check scans
SELECT COUNT(*) FROM scans;

# Check sessions
SELECT * FROM sessions;

# Exit
.quit
```

### Check File Storage

```bash
# List recent scan files
find data/scans -name "*.msgpack" -mtime -1 | head -20

# Check storage usage
du -sh data/scans
```

### Monitor System Resources

```bash
# CPU and memory
htop

# Disk I/O
iostat -x 5

# Disk usage
df -h
```

## Performance Tuning

### For High Throughput (>20 scans/sec)

Edit `.env`:

```bash
MAX_QUEUE_SIZE=2000
MAX_BUFFER_MEMORY_MB=1024
PROCESSING_INTERVAL_MS=5
```

Restart service:
```bash
sudo systemctl restart lidar-receiver
```

### For Low Memory Systems (<4GB RAM)

Edit `.env`:

```bash
MAX_QUEUE_SIZE=500
MAX_BUFFER_MEMORY_MB=256
```

### Use External SSD

For better write performance:

```bash
# Mount SSD
sudo mkdir -p /mnt/ssd
sudo mount /dev/sda1 /mnt/ssd

# Change data directory
sudo nano ~/lidar-receiver/.env
# Set: DATA_DIR=/mnt/ssd/lidar-data

# Restart service
sudo systemctl restart lidar-receiver
```

## Maintenance

### Daily Checks

```bash
# Service status
sudo systemctl status lidar-receiver

# Recent errors
sudo journalctl -u lidar-receiver -p err --since today

# Disk usage
df -h /home/pi/lidar-receiver/data
```

### Weekly Tasks

```bash
# Check database stats
cd ~/lidar-receiver
sqlite3 data/database.sqlite "SELECT
  COUNT(*) as total_scans,
  SUM(pointCount) as total_points,
  SUM(sizeBytes)/1024/1024 as total_mb
FROM scans;"

# Optimize database
sqlite3 data/database.sqlite "VACUUM;"

# Check retention
ls -lh data/scans/$(date -d '30 days ago' +%Y/%m)
```

### Monthly Backups

```bash
# Create backup directory
mkdir -p ~/backups

# Backup database
DATE=$(date +%Y%m%d)
sqlite3 data/database.sqlite ".backup ~/backups/database-$DATE.sqlite"

# Compress old scans
cd data/scans
tar -czf ~/backups/scans-$DATE.tar.gz $(date -d '30 days ago' +%Y/%m)

# Keep last 3 months of backups
find ~/backups -name "*.sqlite" -mtime +90 -delete
find ~/backups -name "*.tar.gz" -mtime +90 -delete
```

## Troubleshooting

### Service Won't Start

```bash
# Check logs
sudo journalctl -u lidar-receiver -n 50 --no-pager

# Check permissions
ls -la ~/lidar-receiver/.env
# Should show: -rw------- (600)

# Verify Bun
bun --version

# Try manual start
cd ~/lidar-receiver
bun start
```

### Connection Issues

```bash
# Check if server is listening
sudo netstat -tulpn | grep 8080

# Test locally
bun scripts/test-client.ts

# Check firewall
sudo ufw status

# Check network
ping -c 3 192.168.1.100
```

### High Memory Usage

```bash
# Check current usage
free -h

# Reduce buffer size
sudo nano ~/lidar-receiver/.env
# Set: MAX_BUFFER_MEMORY_MB=256

# Restart
sudo systemctl restart lidar-receiver
```

### Disk Full

```bash
# Check usage
df -h

# Reduce retention period
sudo nano ~/lidar-receiver/.env
# Set: RETENTION_DAYS=7

# Manual cleanup
cd ~/lidar-receiver
find data/scans -mtime +7 -type f -delete
find data/scans -type d -empty -delete

# Restart
sudo systemctl restart lidar-receiver
```

## Upgrade Procedure

```bash
# Stop service
sudo systemctl stop lidar-receiver

# Backup
sqlite3 data/database.sqlite ".backup data/database.backup.sqlite"

# Pull latest code
cd ~/lidar-receiver
git pull

# Update dependencies
bun install

# Restart service
sudo systemctl start lidar-receiver

# Verify
sudo systemctl status lidar-receiver
```

## Rollback Procedure

```bash
# Stop service
sudo systemctl stop lidar-receiver

# Restore code
git reset --hard <previous-commit>

# Restore database
cp data/database.backup.sqlite data/database.sqlite

# Restart
sudo systemctl start lidar-receiver
```

## Monitoring Dashboard (Optional)

For advanced monitoring, consider:

1. **Grafana + Prometheus**: Metrics visualization
2. **Netdata**: Real-time performance monitoring
3. **Uptime Kuma**: Service uptime monitoring

Installation instructions available in separate documentation.

## Security Hardening

### Change Default Port

```bash
sudo nano ~/lidar-receiver/.env
# Set: WS_PORT=9443

sudo systemctl restart lidar-receiver
```

### Enable WSS (TLS)

Use nginx as reverse proxy:

```bash
sudo apt-get install nginx certbot

# Configure nginx for WSS
sudo nano /etc/nginx/sites-available/lidar

# Get Let's Encrypt certificate
sudo certbot --nginx -d lidar.yourdomain.com
```

### Firewall Rules

```bash
# Enable firewall
sudo ufw enable

# Allow only SSH and WebSocket
sudo ufw allow 22/tcp
sudo ufw allow 8080/tcp

# Limit SSH attempts
sudo ufw limit 22/tcp

# Status
sudo ufw status verbose
```

## Support

For issues:
1. Check logs: `sudo journalctl -u lidar-receiver -f`
2. Review database: `sqlite3 data/database.sqlite`
3. Test connection: `bun scripts/test-client.ts`
