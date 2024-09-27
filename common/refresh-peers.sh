#!/bin/bash

echo "Adding peers to Geth..."

# Define the path to the geth executable and expand ~ to full path
geth_path=~/vitruveo-protocol/build/bin/geth

# Define the RPC URL
rpc_url="http://localhost:8545"

# Array of enodes to add, ensuring no duplicates
enodes=(
    "enode://b8ba4c7cd18c09a023677d2c9207502dfb470beda3a2838288427e6ea1fa3576c914f20e3d8421b7a8700667418204eabfc3f5c26b8f9a1e51139181715f577b@51.20.139.90:30304"
    "enode://59a90290564a6b471cf870c5056660f02fed2960293c2108de94d36271f9071271666527d65b619a11d39722e9f339360d8d6723bcc177d1a7051f560462b6ba@52.28.31.54:30304"
    "enode://7a61132d60690b0763291cb24ee555fe61c59ff328bb980f1a231fb769db31f1991774efc2b8e0028dd9ba2e2987200150af6de778663c184f70988cded6fd45@51.8.68.84:30304"
    "enode://e88b1e7677cc5ee92f4f03bafb277d735f4c18012c980676354f955104ddb5093f89aa1f2737ff9e0ec36c5775fd40f62c305ff90d756a57876690cc9292f389@185.194.216.114:30304"
    "enode://5101c41298219f6e57b2ffe7985db250334e833f6527fee6c3d440105e1a648a3ed5d5a683525be0b4e8f509fe217c07ee59bc41842c4cb4c538667c437929de@84.46.245.138:30304"
    "enode://0ca47097218fbe40ee28f142ee0fd134b30b186b0d23d499e4256ad0c2c292a4c605fc2cf555a46fdd93bbcc489dce18e2aa5b98806efd2ef8f15d3308cb1d2b@207.180.246.235:30304"
    "enode://d160f111f6ce54ad171f09787080c74eb151da39fbe2f34cdd52a328a40ba58d33e8a36f166134c1015c4fe6b961921b99151f4c790da6f308714988e0dcf217@51.21.4.232:30304"
    "enode://4043e50067990d79b88f047bd289c0ad66f6e6b86f905c31daabef69ebdbf662d09de5a1e3eca938c2ee5d5a62bfc92d3505fa6c41b3132adc46ac7c4d8c4db7@5.161.49.240:30304"
    "enode://40577f8a72da747190fb77f0c95b8e74028d18fc6820bb19b4263a3d88abcc5dfaa964a17ac7bfeac6875f52026813b96c33c11aedcd0752e4ca065c40656b20@20.14.81.230:30304"
    "enode://4493d5b4cf975307c351f91e7c7421d57803501291ed059ffb9455e5130633a77064b788c7310cabb44754707572d80e1d0daa64e4cf7d64f6317e94f9e2312a@66.94.107.71:30304"
    "enode://3ae1de1c774e9a9ab8def2408fca14d1d204b09c3d7fb531aa24853a457108c104c93f0f5e9e766551e530dc3f356b18379f9bdb83d4d884b565da4f110d0d26@154.12.251.248:30304"
    "enode://89f90565d81f7b61ca0da7a98870cd6c7f47a4e83c1c638f789f3bb1591b432747d2bd529ccd49d9a53d443af970401df1ca2bba46faffd00e1cad4286cca1fc@3.97.97.43:30304"
    "enode://f0d4d022b462631d281efae8865c730b5b62b393060ee5d622af75f31d45cdacb29fe443500a3884f16ed0bd633f030059d1814b4ff93b32b7859c673098fde0@35.155.236.183:30304"
    "enode://17daeeba74a06f67f054296a2ef51b2b20d527e083ff1e308b9a7449071a2a5086c2bbfbd5b42fb5de5350ca0ded76bcc1b7feeba43f5e727e93604d81d6f7f6@34.205.248.193:30304"
    "enode://dbfee9a0b1d8a928b89e647201341a3532e41583f6c968b7ed24b288ca50da7f74edf4e07b5412cea68791a5077a7631d02b867dbc18241989f7587159589cb4@34.207.51.166:30304"
    "enode://a3568ff6f252be0e01372171e4786a4481a4f7be375b49ccf43b91a93d2b45494b424a58f70b282ab589534717259f9c7fcf45d037e7d6d3cb16d3643f891d4b@3.230.81.5:30304"
)

# Use eval to expand the path
geth_path=$(eval echo "$geth_path")

# Check if the geth binary exists
if [ ! -f "$geth_path" ]; then
    echo "Error: geth executable not found at $geth_path"
    exit 1
fi

# Loop through each enode and check if the port is open before adding it as a peer
for enode in "${enodes[@]}"; do
    # Extract the IP and port from the enode string
    ip=$(echo $enode | grep -oP '(?<=@)[^:]*')
    port=$(echo $enode | grep -oP '\d+$')

    # Check if the port is open
    echo "Checking port $port on $ip..."
    if nc -z -v -w 2 "$ip" "$port" 2>&1 | grep -q 'succeeded'; then
        echo "Port $port on $ip is open. Adding peer: $enode"
        $geth_path --exec "admin.addPeer(\"$enode\")" attach "$rpc_url"
    else
        echo "Port $port on $ip is closed. Skipping peer: $enode"
    fi
done

echo "Peer addition process completed."
