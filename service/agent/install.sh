#!/bin/bash

# Function to check for sudo and prompt for password if required
check_sudo() {
    if [ "$(id -u)" -ne 0 ]; then
        echo "This script requires sudo privileges. Please enter your password."
        sudo "$0" "$@"
        exit
    fi
}

# Check if the script is running with sudo, if not, rerun it with sudo
check_sudo "$@"

# Define variables
BASE_URL="https://raw.githubusercontent.com/mathieu166/vitruveo-monitor-services/main"
SERVICE_DIR="/home/ubuntu/vitruveo-monitor-agent"
SERVICE_PATH="/etc/systemd/system/vitruveo-monitor-agent.service"
TIMER_PATH="/etc/systemd/system/vitruveo-monitor-agent.timer"
AGENT_SCRIPT_URL="https://raw.githubusercontent.com/mathieu166/vitruveo-monitor-services/main/service/agent/agent.sh"
NODE_ADDRESS_SCRIPT_URL="https://raw.githubusercontent.com/mathieu166/vitruveo-monitor-services/main/common/setup-node-address.sh"

# Create the directory if it doesn't exist
mkdir -p "$SERVICE_DIR"

# Extract public address
echo "Extracting public address..."
bash <(curl -H 'Cache-Control: no-cache' -s "$NODE_ADDRESS_SCRIPT_URL") && echo "NODE_ADDRESS=$NODE_ADDRESS"

# Download agent script
echo "Downloading agent script..."
curl -fsSL "$AGENT_SCRIPT_URL" -o "$SERVICE_DIR/agent.sh"

# Replace placeholder in the agent script with the actual NODE_ADDRESS
echo "Updating agent script with NODE_ADDRESS..."
sed -i "s/\$NODE_ADDRESS/$NODE_ADDRESS/g" "$SERVICE_DIR/agent.sh"

# Download service and timer files
echo "Downloading service and timer files..."
curl -fsSL "$BASE_URL/service/agent/vitruveo-monitor-agent.service" -o "$SERVICE_PATH"
curl -fsSL "$BASE_URL/service/agent/vitruveo-monitor-agent.timer" -o "$TIMER_PATH"

# Set permissions for the agent script
chmod +x "$SERVICE_DIR/agent.sh"

# Reload systemd to recognize the new service and timer files
echo "Reloading systemd manager configuration..."
systemctl daemon-reload

# Enable and start the timer
echo "Enabling and starting the timer..."
systemctl enable vitruveo-monitor-agent.timer
systemctl start vitruveo-monitor-agent.timer

systemctl enable vitruveo-monitor-agent.service
systemctl start vitruveo-monitor-agent.service

echo "Installation complete. The agent and timer should now be running."
