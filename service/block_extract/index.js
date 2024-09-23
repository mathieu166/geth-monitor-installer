require('dotenv').config();
const axios = require('axios');
const { Client } = require('pg');

const client = new Client({
	user: process.env.DB_USER,
	host: process.env.DB_HOST,
	database: process.env.DB_NAME,
	password: process.env.DB_PASSWORD,
	port: parseInt(process.env.DB_PORT, 10),
});

const RPC_URL = process.env.RPC_URL;
const DEFAULT_START_BLOCK = parseInt(process.env.DEFAULT_START_BLOCK, 10) || 4834000; // Default block if not found in the database

// Connect to PostgreSQL
client.connect();

// Get the maximum block number from the database
const getMaxBlockNumber = async () => {
	try {
		const result = await client.query('SELECT MAX(block_number) AS maxBlockNumber FROM block');
		return result.rows[0].maxblocknumber || DEFAULT_START_BLOCK; // Use default if no max block number is found
	} catch (err) {
		console.error('Error getting max block number:', err);
		throw err;
	}
};

// Update the block in the database
const updateBlock = async (blockNumber, timestamp, hash, signerAddress, transactionCount, transactions, feeEarned) => {
	try {
		await client.query(`
      INSERT INTO block (block_number, timestamp, hash, signer_address, transaction_count, transactions, fee_earned)
      VALUES ($1, $2, $3, $4, $5, $6, $7)
      ON CONFLICT(block_number) DO UPDATE SET
        timestamp = EXCLUDED.timestamp,
        hash = EXCLUDED.hash,
        signer_address = EXCLUDED.signer_address,
        transaction_count = EXCLUDED.transaction_count,
        transactions = EXCLUDED.transactions,
        fee_earned = EXCLUDED.fee_earned
    `, [blockNumber, timestamp, hash, signerAddress.toLowerCase(), transactionCount, JSON.stringify(transactions), feeEarned]);
	} catch (err) {
		console.error('Error updating block:', err);
		throw err;
	}
};

// Fetch the current block number
const fetchBlockNumber = async () => {
	try {
		const response = await axios.post(RPC_URL, {
			id: 1,
			jsonrpc: "2.0",
			method: "eth_blockNumber",
			params: []
		});
		return parseInt(response.data.result, 16);
	} catch (err) {
		console.error('Error fetching block number:', err);
		throw err;
	}
};

// Fetch block info by block number
const fetchBlockInfo = async (blockNumber) => {
	try {
		const response = await axios.post(RPC_URL, {
			id: 1,
			jsonrpc: "2.0",
			method: "eth_getBlockByNumber",
			params: [`0x${blockNumber.toString(16)}`, true] // Set to `true` to include transactions
		});
		return response.data.result;
	} catch (err) {
		console.error('Error fetching block info:', err);
		throw err;
	}
};

// Fetch the current gas price
const fetchGasPrice = async () => {
	try {
		const response = await axios.post(RPC_URL, {
			id: 1,
			jsonrpc: "2.0",
			method: "eth_gasPrice",
			params: []
		});
		return parseInt(response.data.result, 16);
	} catch (err) {
		console.error('Error fetching gas price:', err);
		throw err;
	}
};

// Fetch the signer for a block hash
const fetchSigner = async (blockHash) => {
	try {
		const response = await axios.post(RPC_URL, {
			id: 1,
			jsonrpc: "2.0",
			method: "clique_getSigner",
			params: [blockHash]
		});
		return response.data.result;
	} catch (err) {
		console.error('Error fetching signer:', err);
		throw err;
	}
};

// Main processing loop
const processBlocks = async () => {
	let gasPrice;
	while (true) {
		try {
			if (!gasPrice) {
				gasPrice = await fetchGasPrice();
			}

			const currentBlockNumber = parseInt(await fetchBlockNumber(), 10);
			const latestBlockProcessed = parseInt(await getMaxBlockNumber(), 10);

			if (isNaN(currentBlockNumber) || isNaN(latestBlockProcessed)) {
				throw new Error('Failed to parse block numbers');
			}

			const maxBlockToProcess = currentBlockNumber - 20;

			if (maxBlockToProcess <= latestBlockProcessed) {
				console.log("No new blocks to process or all blocks are too close to the latest block");
				await new Promise(resolve => setTimeout(resolve, 10000));
				continue;
			}

			// Process blocks
			for (let blockNumber = latestBlockProcessed + 1; blockNumber <= maxBlockToProcess; blockNumber++) {
				const blockInfo = await fetchBlockInfo(blockNumber);
				
				if (!blockInfo) {
					throw new Error(`Error fetching block: ${blockNumber}`);
				}

				const blockHash = blockInfo.hash;
				const timestamp = parseInt(blockInfo.timestamp, 16);
				const transactionCount = blockInfo.transactions.length;
				const transactions = blockInfo.transactions?.map(tx => tx.hash) || []; // Extract transaction hashes

				// Calculate fee earned
				const gasUsed = parseInt(blockInfo.gasUsed, 16);
				const feeEarned = gasUsed * gasPrice;

				if (blockHash) {
					const signerAddress = await fetchSigner(blockHash);
					if (signerAddress) {
						await updateBlock(blockNumber, timestamp, blockHash, signerAddress, transactionCount, transactions, feeEarned);
					}
				} else {
					throw new Error(`Error fetching signer for block: ${blockNumber}`);
				}

				await new Promise(resolve => setTimeout(resolve, 1000 / 100));
			}
		} catch (error) {
			console.error(`Error processing blocks: ${error.message}`);
			await new Promise(resolve => setTimeout(resolve, 5000));
		}
	}
};

// Start processing blocks
processBlocks();
