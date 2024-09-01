#!/bin/bash

echo "Starting the script..."

# Define the file path
file_path="/home/ubuntu/node/info.txt"
echo "Looking for info.txt at $file_path..."

# Check if the file exists
if [ -f "$file_path" ]; then
    echo "info.txt found. Extracting the address..."
else
    echo "Error: info.txt not found at $file_path"
    exit 1
fi

# Extract the address using grep and awk
address=$(grep -oP '0x[0-9a-fA-F]{40}' "$file_path")

# Check if the address was found
if [ -n "$address" ]; then
    echo "Address extracted successfully: $address"
else
    echo "Error: No valid address found in info.txt"
    exit 1
fi

# Set the address in a system variable
export NODE_ADDRESS="$address"
echo "NODE_ADDRESS is set to: $NODE_ADDRESS"

echo "Script completed successfully."
