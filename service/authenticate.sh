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
RPC_URL="http://localhost:8545"
NODE_ADDRESS_SCRIPT_URL="https://raw.githubusercontent.com/mathieu166/vitruveo-monitor-agent/main/common/setup-node-address.sh"

# Extract public address
echo "Extracting public address..."
bash <(curl -H 'Cache-Control: no-cache' -s "$NODE_ADDRESS_SCRIPT_URL") && echo "NODE_ADDRESS=$NODE_ADDRESS"

message_to_sign="$NODE_ADDRESS"

# Convert the message to hexadecimal
message_hex=$(echo -n "$message_to_sign" | xxd -p | tr -d '\n')

# Sign the message
key=$(curl -s -X POST --data "{\"jsonrpc\":\"2.0\",\"method\":\"eth_sign\",\"params\":[\"$NODE_ADDRESS\",\"0x$message_hex\"],\"id\":1}" -H "Content-Type: application/json" "$RPC_URL" | jq -r '.result')
echo ""
echo "The following key prove your ownership of address: $NODE_ADDRESS"
echo ""
echo "Authentication: $key"
echo ""
