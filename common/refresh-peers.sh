#!/bin/bash

echo "Adding peers to Geth..."

# Define the path to the geth executable and expand ~ to full path
geth_path=~/vitruveo-protocol/build/bin/geth

# Define the RPC URL
rpc_url="http://localhost:8545"

# Array of enodes to add
enodes=(
    "enode://b8ba4c7cd18c09a023677d2c9207502dfb470beda3a2838288427e6ea1fa3576c914f20e3d8421b7a8700667418204eabfc3f5c26b8f9a1e51139181715f577b@51.20.139.90:30304"
    "enode://59a90290564a6b471cf870c5056660f02fed2960293c2108de94d36271f9071271666527d65b619a11d39722e9f339360d8d6723bcc177d1a7051f560462b6ba@52.28.31.54:30304"
    "enode://7a61132d60690b0763291cb24ee555fe61c59ff328bb980f1a231fb769db31f1991774efc2b8e0028dd9ba2e2987200150af6de778663c184f70988cded6fd45@51.8.68.84:30304"
    "enode://e88b1e7677cc5ee92f4f03bafb277d735f4c18012c980676354f955104ddb5093f89aa1f2737ff9e0ec36c5775fd40f62c305ff90d756a57876690cc9292f389@185.194.216.114:30304"
    "enode://5101c41298219f6e57b2ffe7985db250334e833f6527fee6c3d440105e1a648a3ed5d5a683525be0b4e8f509fe217c07ee59bc41842c4cb4c538667c437929de@84.46.245.138:30304"
    "enode://0ca47097218fbe40ee28f142ee0fd134b30b186b0d23d499e4256ad0c2c292a4c605fc2cf555a46fdd93bbcc489dce18e2aa5b98806efd2ef8f15d3308cb1d2b@207.180.246.235:30304"
    "enode://d160f111f6ce54ad171f09787080c74eb151da39fbe2f34cdd52a328a40ba58d33e8a36f166134c1015c4fe6b961921b99151f4c790da6f308714988e0dcf217@51.21.4.232:30304"
    "enode://4043e50067990d79b88f047bd289c0ad66f6e6b86f905c31daabef69ebdbf662d09de5a1e3eca938c2ee5d5a62bfc92d3505fa6c41b3132adc46ac7c4d8c4db7@5.161.49.240:30304"
)

# Use eval to expand the path
geth_path=$(eval echo $geth_path)

# Check if the geth binary exists
if [ ! -f "$geth_path" ]; then
    echo "Error: geth executable not found at $geth_path"
    exit 1
fi

# Loop through each enode and add it as a peer
for enode in "${enodes[@]}"; do
    echo "Adding peer: $enode"
    $geth_path --exec "admin.addPeer(\"$enode\")" attach $rpc_url
done

echo "All peers have been added."
