#!/bin/bash

# Define the Geth JSON-RPC endpoint
RPC_URL="http://localhost:8545"
EXTERNAL_URL="https://vitruveo.dgen.tools/agent/password"  # The URL to send the GET request to

# Function to extract JSON value using grep and sed (basic parser for simple JSON)
extract_json_value() {
    echo "$1" | grep -o "\"$2\": *\"[^\"]*\"" | sed -E "s/\"$2\": *\"([^\"]*)\"/\1/"
}

# Get the latest block number
latest_block_number=$(curl -s -X POST --data '{"jsonrpc":"2.0","method":"eth_blockNumber","params":[],"id":1}' -H "Content-Type: application/json" "$RPC_URL" | grep -o '"result":"[^"]*"' | sed 's/"result":"\([^"]*\)"/\1/')

if [ -z "$latest_block_number" ]; then
    echo "Failed to retrieve the latest block number."
    exit 0
fi

# Get block details using the latest block number
block_details=$(curl -s -X POST --data "{\"jsonrpc\":\"2.0\",\"method\":\"eth_getBlockByNumber\",\"params\":[\"$latest_block_number\", true],\"id\":1}" -H "Content-Type: application/json" "$RPC_URL")

if [ -z "$(echo "$block_details" | grep '"result":{')" ]; then
    echo "Failed to retrieve block details."
    exit 0
fi

# Extract the timestamp from the block details
timestamp_hex=$(extract_json_value "$block_details" "timestamp")

# Validate that the timestamp is not empty or null
if [ -z "$timestamp_hex" ]; then
    echo "Invalid or missing timestamp."
    exit 0
fi

# Remove the 0x prefix if it exists
timestamp_hex=${timestamp_hex#0x}

# Convert hexadecimal timestamp to decimal
if ! timestamp_decimal=$(printf "%d" "$((16#$timestamp_hex))" 2>/dev/null); then
    echo "Failed to convert timestamp to decimal."
    exit 0
fi

# Concatenate the address and timestamp
message_to_sign="$NODE_ADDRESS$timestamp_decimal"

# Convert the message to hexadecimal
message_hex=$(echo -n "$message_to_sign" | xxd -p | tr -d '\n')

# Sign the message
key=$(curl -s -X POST --data "{\"jsonrpc\":\"2.0\",\"method\":\"eth_sign\",\"params\":[\"$NODE_ADDRESS\",\"0x$message_hex\"],\"id\":1}" -H "Content-Type: application/json" "$RPC_URL" | grep -o '"result":"[^"]*"' | sed 's/"result":"\([^"]*\)"/\1/')

if [ -z "$key" ]; then
    echo "Failed to sign the message."
    exit 0
fi

# Send the signed message, address, and timestamp as query parameters using a GET request
response=$(curl -s -w "%{http_code}" -o /tmp/response_body.txt -X GET "$EXTERNAL_URL?key=$key&address=$NODE_ADDRESS&timestamp=$timestamp_decimal")

# Extract HTTP code and response body
http_code=$(echo "$response" | awk '{print substr($0,length($0)-2)}')
response_body=$(cat /tmp/response_body.txt)

# Check if HTTP code indicates success (200)
if [ "$http_code" -eq 200 ]; then
  # Extract fields from the JSON response using grep and sed
  user=$(extract_json_value "$response_body" "user")
  password=$(extract_json_value "$response_body" "password")
  url=$(extract_json_value "$response_body" "url")

  # Output the fields
  echo "User: $user"
  echo "Password: $password"
  echo "URL: $url"
else
  echo "Request failed with HTTP status code $http_code"
fi

# Clean up
rm /tmp/response_body.txt
