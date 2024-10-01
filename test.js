const { ethers } = require("ethers");

// Set up a provider connected to the Binance Smart Chain
const provider = new ethers.JsonRpcProvider("https://bsc-dataseed.binance.org/");

// Function to extract the amount of USDC transferred from a transaction hash
async function extractUsdcAmount(txHash) {
    try {
        // Fetch the transaction details
        const tx = await provider.getTransaction(txHash);

        if (!tx) {
            console.log("Transaction not found. Please check the transaction hash.");
            return;
        }

        console.log("Transaction details:", tx); // Log transaction details for debugging

        // Check if the transaction input is for a USDC transfer (ERC20 transfer function)
        const amountHex = tx.data.slice(-64); // Extract last 64 characters (32 bytes)

        // Ensure amountHex is valid and has no leading zeros
        const trimmedHex = '0x' + amountHex; // Trim leading zeros
        const amountWei = BigInt(trimmedHex); // Convert hex to BigNumber

        // USDC has 6 decimals
        const decimals = 18;

        // Convert to a string representing the amount in USDC
        const amountUsdc = ethers.formatUnits(amountWei, decimals); 

        console.log(`Amount transferred: ${amountUsdc} USDC`);
    } catch (error) {
        console.error("Error fetching transaction:", error);
    }
}

// Given transaction hash
const txHash = "0x508be8a176c85ec5387d396b41297434de032c5feb6d8e6b265818884b68eec8";

// Execute the function
extractUsdcAmount(txHash);
