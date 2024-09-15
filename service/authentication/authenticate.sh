#!/bin/bash

# Define the Geth JSON-RPC endpoint
RPC_URL="http://localhost:8545"
EXTERNAL_URL="https://vitruveo.dgen.tools/agent/password"  # The URL to send the GET request to

# Get the latest block number
latest_block_number=$(curl -s -X POST --data '{"jsonrpc":"2.0","method":"eth_blockNumber","params":[],"id":1}' -H "Content-Type: application/json" "$RPC_URL" | jq -r '.result')

if [ "$latest_block_number" == "null" ]; then
    echo "Failed to retrieve the latest block number."
    exit 0
fi

# Get block details using the latest block number
block_details=$(curl -s -X POST --data "{\"jsonrpc\":\"2.0\",\"method\":\"eth_getBlockByNumber\",\"params\":[\"$latest_block_number\", true],\"id\":1}" -H "Content-Type: application/json" "$RPC_URL")

if [ "$(echo "$block_details" | jq -r '.result')" == "null" ]; then
    echo "Failed to retrieve block details."
    exit 0
fi

# Extract the timestamp from the block details
timestamp_hex=$(echo "$block_details" | jq -r '.result.timestamp')

# Remove the 0x prefix if it exists
timestamp_hex=${timestamp_hex#0x}

# Convert hexadecimal timestamp to decimal
timestamp_decimal=$(printf "%d" "$((16#$timestamp_hex))")

if [ -z "$timestamp_decimal" ]; then
    echo "Failed to convert timestamp to decimal."
    exit 0
fi

# Concatenate the address and timestamp
message_to_sign="$NODE_ADDRESS$timestamp_decimal"

# Convert the message to hexadecimal
message_hex=$(echo -n "$message_to_sign" | xxd -p | tr -d '\n')

# Sign the message
key=$(curl -s -X POST --data "{\"jsonrpc\":\"2.0\",\"method\":\"eth_sign\",\"params\":[\"$NODE_ADDRESS\",\"0x$message_hex\"],\"id\":1}" -H "Content-Type: application/json" "$RPC_URL" | jq -r '.result')

if [ "$key" == "null" ]; then
    echo "Failed to sign the message."
    exit 0
fi

# Send the signed message, address, and timestamp as query parameters using a GET request
response=$(curl -s -w "%{http_code}" -X GET "$EXTERNAL_URL?key=$key&address=$NODE_ADDRESS&timestamp=$timestamp_decimal")

# Extract HTTP code and response body
http_code=$(echo "$response" | tail -n1)
response_body=$(echo "$response" | head -n -1)

# Check if HTTP code indicates success (200)
if [ "$http_code" -eq 200 ]; then
  # Use jq to extract fields from the JSON response
  user=$(echo "$response_body" | jq -r '.user')
  password=$(echo "$response_body" | jq -r '.password')
  url=$(echo "$response_body" | jq -r '.url')

  # Output the fields
  echo "User: $user"
  echo "Password: $password"
  echo "URL: $url"
else
  echo "Request failed with HTTP status code $http_code"
fi
