require('dotenv').config();
const axios = require('axios');

// Get RPC URL from environment variables
const RPC_URL = process.env.RPC_URL;

// Fetch block info by block number
const fetchBlockInfo = async (blockNumber) => {
  try {
    console.log(`fetching block number: 0x${blockNumber.toString(16)} - ${blockNumber}`)
    const response = await axios.post(RPC_URL, {
      id: 1,
      jsonrpc: "2.0",
      method: "eth_getBlockByNumber",
      params: [`0x${blockNumber.toString(16)}`, true] // Set to `true` to include transactions
    });
    
    const block = response.data.result;
    if (block) {
      console.log(block)
      // Convert specified hex values to integers
      return {
        ...block,
        gasLimit: parseInt(block.gasLimit, 16),
        gasUsed: parseInt(block.gasUsed, 16),
        number: parseInt(block.number, 16),
        transactions: block.transactions.map(tx => ({
          ...tx,
          blockNumber: parseInt(tx.blockNumber, 16),
          gasPrice: parseInt(tx.gasPrice, 16),
          gas: parseInt(tx.gas, 16),
        }))
      };
    }
    return null;
  } catch (err) {
    console.error('Error fetching block info:', err);
    throw err;
  }
};

// Main function to get block details
const main = async () => {
  const blockNumber = process.argv[2]; // Get block number from command line arguments

  if (!blockNumber) {
    console.error('Please provide a block number as an argument.');
    process.exit(1);
  }

  try {
    const blockInfo = await fetchBlockInfo(parseInt(blockNumber, 10));
    
    // if (!blockInfo) {
    //   console.log(`Block ${blockNumber} not found.`);
    // } else {
    //   console.log('Block Details:');
    //   console.log(JSON.stringify(blockInfo, null, 2));
    // }
  } catch (error) {
    console.error('Failed to fetch block information:', error.message);
  }
};

// Execute main function
main();
