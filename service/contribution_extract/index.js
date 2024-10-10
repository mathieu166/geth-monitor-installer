require('dotenv').config();
const { Pool } = require('pg');
const ethers = require('ethers');

const pool = new Pool({
    user: process.env.DB_USER,
    host: process.env.DB_HOST,
    database: process.env.DB_NAME,
    password: process.env.DB_PASSWORD,
    port: parseInt(process.env.DB_PORT, 10),
});

// Configuration for chains and USDC addresses
const {chains, recipients} = require('./specs');

const DEFAULT_ACCESS_EXPIRY = 1730419200; // Nov 1st
const ALLOWED_RECIPIENTS = recipients;

async function checkPendingTransactions() {
    const client = await pool.connect(); // Get a client from the pool
    try {
        // Start a transaction
        await client.query('BEGIN');

        // Step 1: Select all pending transactions with FOR UPDATE to lock the rows
        const res = await client.query('SELECT * FROM validator_tx WHERE is_pending = true and is_valid = false FOR UPDATE');
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
                    const recipient = extractRecipientAddress(data);

                    // Step 3: Check if the "to" address is the USDC address for the chain
                    if (to.toLowerCase() === chain.usdcAddress.toLowerCase() && ALLOWED_RECIPIENTS.includes(recipient.toLowerCase())) {
                        // Extract the amount of USDC from the transaction input
                        const amount = extractUsdcAmount(data, chain.decimals);

                        // Step 4: Check if the "from" address is in the verified wallets
                        const verifiedRes = await client.query(
                            'SELECT * FROM validator_verified_wallet WHERE address = $1 AND discord_username = $2',
                            [from.toLowerCase(), discord_username]
                        );

                        if (verifiedRes.rows.length > 0) {
                            // Step 5: Get the transaction date from the block timestamp
                            const txDate = await getTransactionDate(chain.rpcUrl, blockNumber);

                            // Step 6: Transaction is valid
                            await markTransactionAsValid(client, txhash, discord_username, chain.name, amount, txDate, from);
                        } else {
                            // Transaction is not valid
                            await markTransactionAsInvalid(client, txhash, "Unverified Fund Source");
                        }
                    } else {
                        if(to.toLowerCase() !== chain.usdcAddress.toLowerCase()){
                            await markTransactionAsInvalid(client, txhash, "Invalid Token");
                        } else if(!ALLOWED_RECIPIENTS.includes(recipient.toLowerCase())){
                            await markTransactionAsInvalid(client, txhash, "Invalid Recipient");
                        } else {
                            await markTransactionAsInvalid(client, txhash, "Transaction Invalid");
                        }
                    }
                    break; // Exit after processing the transaction
                }
            }

            // If no transaction details were found for any chain, mark it as invalid
            if (!txDetailsFound) {
                await markTransactionAsInvalid(client, txhash, "Transaction Not Found");
            }
        }

        // Commit the transaction
        await client.query('COMMIT');
    } catch (error) {
        console.error('Error while checking pending transactions:', error);
        await client.query('ROLLBACK'); // Rollback the transaction on error
    } finally {
        client.release(); // Release the client back to the pool
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
        const provider = new ethers.JsonRpcProvider(rpcUrl);
        const block = await provider.getBlock(blockNumber);
        return block.timestamp; // Return the block timestamp
    } catch (error) {
        console.error(`Error fetching block ${blockNumber} from ${rpcUrl}:`, error);
        return null;
    }
}

function extractUsdcAmount(inputData, decimal) {
    const amountHex = inputData.slice(-64);
    const amountWei = BigInt(`0x${amountHex}`); // Use BigInt for large numbers
    const amountUsdc = ethers.formatUnits(amountWei, decimal); // Convert to USDC units
    return amountUsdc;
}

function extractRecipientAddress(inputData) {
    const recipientHex = inputData.slice(34, 74); // Extract 40 hex characters (20 bytes) for the address
    return `0x${recipientHex}`; // Return the address with "0x" prefix
}

async function markTransactionAsValid(client, txhash, discord_username, chain, amount, txDate, from) {
    const {accessExpiry, additionalDays} = await calculateAccessExpiry(client, discord_username, amount);
    await client.query(
        `INSERT INTO validator_contribution (txdate, address, "chain", txhash, amount, access_expiry, discord_username, additional_days)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
        [txDate, from, chain, txhash, amount, accessExpiry, discord_username, additionalDays]
    );

    // Mark the transaction as valid and not pending
    await client.query(
        'UPDATE validator_tx SET is_pending = false, is_valid = true WHERE txhash = $1 AND discord_username = $2',
        [txhash, discord_username]
    );

    console.log(`Transaction ${txhash} is valid and recorded.`);
}

async function markTransactionAsInvalid(client, txhash, reason) {
    await client.query(
        'UPDATE validator_tx SET is_pending = false, is_valid = false, reason=$2 WHERE txhash = $1',
        [txhash, reason]
    );
    console.log(`Transaction ${txhash} is marked as invalid.`);
}

async function calculateAccessExpiry(client, discord_username, amount) {
    const res = await client.query(
        `SELECT 
            GREATEST(COALESCE(MAX(access_expiry), $2), EXTRACT(EPOCH FROM NOW())) AS last_access_expiry
         FROM validator_contribution 
         WHERE discord_username = $1`,
        [discord_username, DEFAULT_ACCESS_EXPIRY]
    );

    let lastAccessExpiry = res.rows[0].last_access_expiry;
    const additionalDays = Math.floor((amount / 5.0) * 28); // 28 days for every 5 USDC

    return { accessExpiry : parseInt(lastAccessExpiry) + (additionalDays * 24 * 60 * 60), additionalDays }; // Convert days to seconds
}

// Main loop
(async function main() {
    while (true) {
        await checkPendingTransactions();
        await new Promise(resolve => setTimeout(resolve, 10000));
    }
})();
