#!/bin/bash

# Define the Geth JSON-RPC endpoint
RPC_URL="http://localhost:8545"
EXTERNAL_URL="https://vitruveo.dgen.tools/checkin"  # The URL to send the data to

# Get peer count
peer_count=$(curl -s -X POST -H "Content-Type: application/json" --data '{"jsonrpc":"2.0","method":"net_peerCount","params":[],"id":1}' $RPC_URL | jq -r '.result' | xargs printf "%d")

if [ "$peer_count" == "null" ]; then
    echo "Failed to retrieve peer count."
    return 1
fi

echo "Peer count: $peer_count"

# Get the latest block number
latest_block_number=$(curl -s -X POST --data '{"jsonrpc":"2.0","method":"eth_blockNumber","params":[],"id":1}' -H "Content-Type: application/json" "$RPC_URL" | jq -r '.result')

if [ "$latest_block_number" == "null" ]; then
    echo "Failed to retrieve the latest block number."
    return 1
fi

# Get block details using the latest block number
block_details=$(curl -s -X POST --data "{\"jsonrpc\":\"2.0\",\"method\":\"eth_getBlockByNumber\",\"params\":[\"$latest_block_number\", true],\"id\":1}" -H "Content-Type: application/json" "$RPC_URL")

if [ "$(echo "$block_details" | jq -r '.result')" == "null" ]; then
    echo "Failed to retrieve block details."
    return 1
fi

# Extract the timestamp from the block details
timestamp_hex=$(echo "$block_details" | jq -r '.result.timestamp')

# Remove the 0x prefix if it exists
timestamp_hex=${timestamp_hex#0x}

# Convert hexadecimal timestamp to decimal
timestamp_decimal=$(printf "%d" "$((16#$timestamp_hex))")

if [ -z "$timestamp_decimal" ]; then
    echo "Failed to convert timestamp to decimal."
    return 1
fi

echo "Timestamp: $timestamp_decimal"

# Concatenate the address and timestamp
message_to_sign="$NODE_ADDRESS$timestamp_decimal"

# Convert the message to hexadecimal
message_hex=$(echo -n "$message_to_sign" | xxd -p | tr -d '\n')

# Sign the message
key=$(curl -s -X POST --data "{\"jsonrpc\":\"2.0\",\"method\":\"eth_sign\",\"params\":[\"$NODE_ADDRESS\",\"0x$message_hex\"],\"id\":1}" -H "Content-Type: application/json" "$RPC_URL" | jq -r '.result')

echo "Key: $key"
if [ "$key" == "null" ]; then
    echo "Failed to sign the message."
    return 1
fi

# Post the signed message and other data to the external server
response=$(curl -s -o response.txt -w "%{http_code}" -X POST -H "Content-Type: application/json" \
    --data "{\"key\":\"$key\",\"address\":\"$NODE_ADDRESS\",\"timestamp\":\"$timestamp_decimal\",\"peer_count\":\"$peer_count\"}" \
    "$EXTERNAL_URL")

# Capture HTTP status code
http_code=$(echo "$response" | tail -n1)
response_body=$(cat response.txt)

# Check HTTP status code and handle errors
if [ "$http_code" -eq 200 ]; then
    echo "Data posted successfully."
else
    echo "Failed to post data. HTTP status code: $http_code"
    echo "Response body: $response_body"
    return 1
fi
