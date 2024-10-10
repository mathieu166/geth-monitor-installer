module.exports = {
  chains: [
    {
      name: "polygon",
      chainId: "137", // Chain ID for Polygon mainnet
      usdcAddress: "0x3c499c542cEF5E3811e1192ce70d8cC03d5c3359",
      rpcUrl: "https://polygon-rpc.com",
      blockExplorerUrl: "https://polygonscan.com",
      nativeCurrency: {
        name: "Polygon",
        symbol: "MATIC",
        decimals: 18,
      },
      decimals: 6,
    },
    {
      name: "bsc",
      chainId: "56",
      usdcAddress: "0x8AC76a51cc950d9822D68b83fE1Ad97B32Cd580d",
      rpcUrl: "https://bsc-dataseed.binance.org/",
      blockExplorerUrl: "https://bscscan.com",
      nativeCurrency: {
        name: "Binance Coin",
        symbol: "BNB",
        decimals: 18,
      },
      decimals: 18,
    },
    {
      name: "vitruveo",
      chainId: "1490",
      usdcAddress: "0xbCfB3FCa16b12C7756CD6C24f1cC0AC0E38569CF",
      rpcUrl: "https://rpc.vitruveo.xyz/",
      blockExplorerUrl: "https://explorer.vitruveo.xyz/", // Example, replace with actual block explorer URL
      nativeCurrency: {
        name: "Vitruveo Coin",
        symbol: "VTRU",
        decimals: 18,
      },
      decimals: 6,
    },
  ],
  recipients: ["0x440a948af13fe3b4dd1b341e2aa834f81bf6ff51"],
};
