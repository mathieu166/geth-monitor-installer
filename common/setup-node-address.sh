#!/bin/bash

# Extract the address
address=$(grep -oP '0x[0-9a-fA-F]{40}' /home/ubuntu/node/info.txt)

# Remove any existing NODE_ADDRESS line
sudo sed -i '/^NODE_ADDRESS=/d' /etc/environment

# Add the new NODE_ADDRESS line
sudo sh -c "echo 'NODE_ADDRESS=$address' >> /etc/environment"

echo "NODE_ADDRESS is set to: $address"