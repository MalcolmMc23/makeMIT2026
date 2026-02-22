# Quick Start Guide

Get up and running in 5 minutes.

## Prerequisites

- Raspberry Pi 4 with Raspberry Pi OS (64-bit)
- Network access
- iPhone with LiDAR sensor

## 1. Transfer to Pi

```bash
scp -r ./lidar-receiver pi@<PI_IP>:~/
```

## 2. Setup

```bash
ssh pi@<PI_IP>
cd ~/lidar-receiver
bash scripts/setup-pi.sh
```

**Save the API key shown!**

## 3. Start Service

```bash
bash scripts/install-service.sh
```

## 4. Verify

```bash
# Check status
sudo systemctl status lidar-receiver

# Watch logs
sudo journalctl -u lidar-receiver -f
```

## 5. Test Connection

```bash
# Install test client dependencies (if not already installed)
bun install

# Run test
bun scripts/test-client.ts
```

Expected output:
```
✓ Connected to server
[1/10] Sent scan: scan-xxx (750 points)
       ✓ ACK: scan-xxx (stored: true)
```

## 6. Configure iPhone App

**WebSocket URL**:
```
ws://<PI_IP>:8080?apiKey=<YOUR_API_KEY>
```

**Headers**:
```json
{
  "x-device-id": "iphone-001"
}
```

**Message Format**: MessagePack encoded LiDARScan object

## Useful Commands

```bash
# Service status
sudo systemctl status lidar-receiver

# Live logs
sudo journalctl -u lidar-receiver -f

# Restart service
sudo systemctl restart lidar-receiver

# Check database
sqlite3 data/database.sqlite "SELECT COUNT(*) FROM scans;"

# Storage usage
du -sh data/scans
```

## Troubleshooting

**Can't connect?**
```bash
# Check if server is running
sudo systemctl status lidar-receiver

# Check if port is open
sudo netstat -tulpn | grep 8080

# Check firewall
sudo ufw status
```

**Service won't start?**
```bash
# Check logs
sudo journalctl -u lidar-receiver -n 50

# Try manual start
bun start
```

## Next Steps

- Read [README.md](README.md) for full documentation
- See [DEPLOYMENT.md](DEPLOYMENT.md) for detailed deployment guide
- Configure retention policy in `.env`
- Set up monitoring (optional)

## Performance Tips

**Raspberry Pi 4 with SSD**: 15-30 scans/sec
**Raspberry Pi 4 with SD card**: 8-15 scans/sec

For best performance:
- Use external SSD for storage
- Enable swap file (if <8GB RAM)
- Reduce retention period to save space
- Monitor with `htop` and `iostat`
