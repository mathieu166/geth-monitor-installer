#!/bin/bash

echo "Starting the script..."

# Check if NODE_ADDRESS is already set in /etc/environment
if grep -q "NODE_ADDRESS=" /etc/environment; then
    echo "NODE_ADDRESS is already set in /etc/environment. Exiting script."
    exit 0
fi

# Define the path to the info.txt file and expand ~ to the full path
file_path=~/node/info.txt
echo "Looking for info.txt at $file_path..."

# Check if the file exists
if [ ! -f "$file_path" ]; then
    echo "Error: info.txt not found at $file_path"
    exit 1
fi

# Extract the address using grep
address=$(grep -oP '0x[0-9a-fA-F]{40}' "$file_path")

# Check if the address was found
if [ -n "$address" ]; then
    echo "Address extracted successfully: $address"
else
    echo "Error: No valid address found in info.txt"
    exit 1
fi

# Since NODE_ADDRESS was not found in /etc/environment, add it
echo "Adding NODE_ADDRESS to /etc/environment..."
echo "NODE_ADDRESS=\"$address\"" | tee -a /etc/environment

# Export NODE_ADDRESS for the current session
export NODE_ADDRESS="$address"
echo "NODE_ADDRESS is set to: $NODE_ADDRESS"

echo "Script completed successfully."
