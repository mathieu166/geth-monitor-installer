require('dotenv').config();
const { Client } = require('pg');
const ethers = require('ethers');

const client = new Client({
    user: process.env.DB_USER,
    host: process.env.DB_HOST,
    database: process.env.DB_NAME,
    password: process.env.DB_PASSWORD,
    port: parseInt(process.env.DB_PORT, 10),
});

// Connect to PostgreSQL
client.connect();

// Configuration for chains and USDC addresses
const chains = [
    {
        name: 'polygon',
        usdcAddress: '0x2791Bca1f2de4661ED88A30C99A7a9449Aa84174',
        rpcUrl: 'https://polygon-rpc.com'
    },
    {
        name: 'bsc',
        usdcAddress: '0x8AC76a51cc950d9822D68b83fE1Ad97B32Cd580d',
        rpcUrl: 'https://bscrpc.com'
    },
    {
        name: 'vitruveo',
        usdcAddress: '0xbCfB3FCa16b12C7756CD6C24f1cC0AC0E38569CF',
        rpcUrl: 'https://rpc.vitruveo.xyz/'
    }
];

const DEFAULT_ACCESS_EXPIRY = 1730419200; //Nov 1st
const ALLOWED_RECIPIENTS = ['0x440a948af13fe3b4dd1b341e2aa834f81bf6ff51']

async function checkPendingTransactions() {
    try {
        // Step 1: Select all pending transactions
        const res = await client.query('SELECT * FROM validator_tx WHERE is_pending = true FOR UPDATE');
        const pendingTxs = res.rows;

        // Step 2: Process each pending transaction
        for (const tx of pendingTxs) {
            const { txhash, discord_username } = tx;
            let txDetailsFound = false; // Flag to track if transaction details were found

            for (const chain of chains) {
                const txDetails = await fetchTransactionDetails(chain.rpcUrl, txhash);

                if (txDetails) {
                    txDetailsFound = true;
                    const { from, to, blockNumber, data } = txDetails;
                    
                    const recipient = extractRecipientAddress(data)
                    

                    // Step 3: Check if the "to" address is the USDC address for the chain
                    if (to.toLowerCase() === chain.usdcAddress.toLowerCase() && ALLOWED_RECIPIENTS.includes(recipient.toLowerCase())) {
                        // Extract the amount of USDC from the transaction input
                        const amount = extractUsdcAmount(data);

                        // Step 4: Check if the "from" address is in the verified wallets
                        const verifiedRes = await client.query(
                            'SELECT * FROM validator_verified_wallet WHERE address = $1 AND discord_username = $2',
                            [from, discord_username]
                        );

                        if (verifiedRes.rows.length > 0) {
                            // Step 5: Get the transaction date from the block timestamp
                            const txDate = await getTransactionDate(chain.rpcUrl, blockNumber);

                            // Step 6: Transaction is valid
                            await markTransactionAsValid(txhash, discord_username, chain.name, amount, txDate);
                        } else {
                            // Transaction is not valid
                            await markTransactionAsInvalid(txhash);
                        }
                    } else {
                        // Transaction is not valid
                        await markTransactionAsInvalid(txhash);
                    }
                    break; // Exit after processing the transaction
                }
            }

            // If no transaction details were found for any chain, mark it as invalid
            if (!txDetailsFound) {
                await markTransactionAsInvalid(txhash);
            }
        }
    } catch (error) {
        console.error('Error while checking pending transactions:', error);
    }
}

async function fetchTransactionDetails(rpcUrl, txhash) {
    try {
        const provider = new ethers.JsonRpcProvider(rpcUrl);
        const tx = await provider.getTransaction(txhash);
        return tx ? { from: tx.from, to: tx.to, blockNumber: tx.blockNumber, data: tx.data } : null;
    } catch (error) {
        console.error(`Error fetching transaction ${txhash} from ${rpcUrl}:`, error);
        return null;
    }
}

async function getTransactionDate(rpcUrl, blockNumber) {
    try {
        const provider = new ethers.providers.JsonRpcProvider(rpcUrl);
        const block = await provider.getBlock(blockNumber);
        return block.timestamp; // Return the block timestamp
    } catch (error) {
        console.error(`Error fetching block ${blockNumber} from ${rpcUrl}:`, error);
        return null;
    }
}

function extractUsdcAmount(inputData) {
    const amountHex = inputData.slice(-64); 

    // Convert hex to decimal
    const amountWei = BigInt(`0x${amountHex}`); // Use BigInt for large numbers

    const amountUsdc = ethers.formatUnits(amountWei, 18); 

    return amountUsdc;
}

function extractRecipientAddress(inputData) {
    // The recipient address is usually located at the start of the input data
    const recipientHex = inputData.slice(34, 74); // Extract 40 hex characters (20 bytes) for the address
    return `0x${recipientHex}`; // Return the address with "0x" prefix
}


async function markTransactionAsValid(txhash, discord_username, chain, amount, txDate) {
    const accessExpiry = await calculateAccessExpiry(discord_username, amount);

    await client.query(
        `INSERT INTO validator_contribution (txdate, address, "chain", txhash, amount, access_expiry, discord_username)
         VALUES ($1, $2, $3, $4, $5, $6, $7)`,
        [txDate, discord_username, chain, txhash, amount, accessExpiry, discord_username]
    );

    // Mark the transaction as valid and not pending
    await client.query(
        'UPDATE validator_tx SET is_pending = false, is_valid = true WHERE txhash = $1 AND discord_username = $2',
        [txhash, discord_username]
    );

    console.log(`Transaction ${txhash} is valid and recorded.`);
}

async function markTransactionAsInvalid(txhash) {
    await client.query(
        'UPDATE validator_tx SET is_pending = false, is_valid = false WHERE txhash = $1',
        [txhash]
    );
    console.log(`Transaction ${txhash} is marked as invalid.`);
}

async function calculateAccessExpiry(discord_username, amount) {
    // Fetch both the current epoch time from the database and the last access_expiry
    const res = await client.query(
        `SELECT 
            GREATEST(COALESCE(MAX(access_expiry), $2), EXTRACT(EPOCH FROM NOW())) AS last_access_expiry
         FROM validator_contribution 
         WHERE discord_username = $1`,
        [discord_username, DEFAULT_ACCESS_EXPIRY]
    );

    // Get the last access expiry, which is either the highest of the last expiry or the current epoch time
    let lastAccessExpiry = res.rows[0].last_access_expiry;

    // Calculate additional days based on the USDC amount
    const additionalDays = Math.floor(amount / 5.0) * 28; // 28 days for every 5 USDC

    // Return the new access expiry by adding the additional days (converted to seconds)
    return lastAccessExpiry + additionalDays * 24 * 60 * 60; // Convert days to seconds
}


// Main loop
(async function main() {
    while (true) {
        await checkPendingTransactions();
        await new Promise(resolve => setTimeout(resolve, 5000));
    }
})();

