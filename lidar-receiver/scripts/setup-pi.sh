#!/bin/bash

# LiDAR Receiver - Raspberry Pi Setup Script
# This script sets up the Raspberry Pi environment for the LiDAR receiver

set -e

echo "========================================="
echo "LiDAR Receiver - Raspberry Pi Setup"
echo "========================================="
echo ""

# Colors for output
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
NC='\033[0m' # No Color

# Check if running on Raspberry Pi
if [ ! -f /proc/device-tree/model ] || ! grep -q "Raspberry Pi" /proc/device-tree/model 2>/dev/null; then
    echo -e "${YELLOW}Warning: This doesn't appear to be a Raspberry Pi${NC}"
    echo -e "${YELLOW}Continuing anyway...${NC}"
    echo ""
fi

# Update system
echo -e "${GREEN}[1/8] Updating system packages...${NC}"
sudo apt-get update
sudo apt-get upgrade -y

# Install dependencies
echo -e "${GREEN}[2/8] Installing system dependencies...${NC}"
sudo apt-get install -y \
    curl \
    git \
    build-essential \
    python3 \
    python3-pip \
    sqlite3

# Install Bun runtime
echo -e "${GREEN}[3/8] Installing Bun runtime...${NC}"
if ! command -v bun &> /dev/null; then
    curl -fsSL https://bun.sh/install | bash

    # Add to PATH for current session
    export BUN_INSTALL="$HOME/.bun"
    export PATH="$BUN_INSTALL/bin:$PATH"

    # Add to .bashrc for persistence
    if ! grep -q "BUN_INSTALL" ~/.bashrc; then
        echo 'export BUN_INSTALL="$HOME/.bun"' >> ~/.bashrc
        echo 'export PATH="$BUN_INSTALL/bin:$PATH"' >> ~/.bashrc
    fi

    echo -e "${GREEN}✓ Bun installed successfully${NC}"
else
    echo -e "${GREEN}✓ Bun already installed${NC}"
fi

# Create directories
echo -e "${GREEN}[4/8] Creating directories...${NC}"
cd ~/lidar-receiver
mkdir -p data/scans logs

# Install Node dependencies
echo -e "${GREEN}[5/8] Installing dependencies...${NC}"
bun install

# Generate secure API key
echo -e "${GREEN}[6/8] Generating secure API key...${NC}"
API_KEY=$(openssl rand -base64 48 | tr -d "=+/" | cut -c1-64)
echo -e "${YELLOW}Generated API key: ${API_KEY}${NC}"
echo -e "${YELLOW}Save this key! You'll need it for the iPhone app.${NC}"
echo ""

# Create .env file
echo -e "${GREEN}[7/8] Creating .env file...${NC}"
cat > .env << EOF
# Server Configuration
WS_PORT=8080
WS_HOST=0.0.0.0

# Authentication
API_KEY=${API_KEY}

# Storage Paths
DATA_DIR=./data
SCANS_DIR=./data/scans
DB_PATH=./data/database.sqlite
LOG_DIR=./logs

# Performance Tuning
MAX_QUEUE_SIZE=1000
MAX_BUFFER_MEMORY_MB=512
PROCESSING_INTERVAL_MS=10

# Retention Policy
RETENTION_DAYS=30

# Logging
LOG_LEVEL=info

# Environment
NODE_ENV=production
EOF

echo -e "${GREEN}✓ .env file created${NC}"

# Set permissions
echo -e "${GREEN}[8/8] Setting permissions...${NC}"
chmod 600 .env
chmod +x scripts/*.sh

echo ""
echo -e "${GREEN}=========================================${NC}"
echo -e "${GREEN}Setup Complete!${NC}"
echo -e "${GREEN}=========================================${NC}"
echo ""
echo -e "${YELLOW}Next Steps:${NC}"
echo ""
echo "1. Copy this API key for your iPhone app:"
echo -e "   ${GREEN}${API_KEY}${NC}"
echo ""
echo "2. Find your Raspberry Pi's IP address:"
echo "   hostname -I"
echo ""
echo "3. Test the server:"
echo "   bun start"
echo ""
echo "4. Install as a service:"
echo "   bash scripts/install-service.sh"
echo ""
echo "5. Check service status:"
echo "   sudo systemctl status lidar-receiver"
echo ""
echo -e "${GREEN}WebSocket URL will be:${NC}"
echo "   ws://[YOUR_PI_IP]:8080?apiKey=${API_KEY}"
echo ""
