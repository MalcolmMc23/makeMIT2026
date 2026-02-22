#!/bin/bash

# LiDAR Receiver - Service Installation Script
# Installs and enables the systemd service

set -e

echo "========================================="
echo "Installing LiDAR Receiver Service"
echo "========================================="
echo ""

# Colors
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
NC='\033[0m'

# Check if systemd is available
if ! command -v systemctl &> /dev/null; then
    echo -e "${RED}Error: systemd is not available on this system${NC}"
    exit 1
fi

# Check if .env exists
if [ ! -f .env ]; then
    echo -e "${RED}Error: .env file not found${NC}"
    echo -e "${YELLOW}Please run 'bash scripts/setup-pi.sh' first${NC}"
    exit 1
fi

# Copy service file
echo -e "${GREEN}[1/4] Installing systemd service file...${NC}"
sudo cp systemd/lidar-receiver.service /etc/systemd/system/

# Reload systemd
echo -e "${GREEN}[2/4] Reloading systemd daemon...${NC}"
sudo systemctl daemon-reload

# Enable service
echo -e "${GREEN}[3/4] Enabling service...${NC}"
sudo systemctl enable lidar-receiver

# Start service
echo -e "${GREEN}[4/4] Starting service...${NC}"
sudo systemctl start lidar-receiver

# Wait a moment for service to start
sleep 2

# Check status
echo ""
echo -e "${GREEN}=========================================${NC}"
echo -e "${GREEN}Service Status${NC}"
echo -e "${GREEN}=========================================${NC}"
sudo systemctl status lidar-receiver --no-pager

echo ""
echo -e "${GREEN}Service installed successfully!${NC}"
echo ""
echo -e "${YELLOW}Useful Commands:${NC}"
echo "  Status:  sudo systemctl status lidar-receiver"
echo "  Logs:    sudo journalctl -u lidar-receiver -f"
echo "  Restart: sudo systemctl restart lidar-receiver"
echo "  Stop:    sudo systemctl stop lidar-receiver"
echo ""
