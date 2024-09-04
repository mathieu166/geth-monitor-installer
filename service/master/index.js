require('dotenv').config();
const express = require('express');
const { Client } = require('pg');
const {verifyMessage} = require('ethers');

const app = express();
const PORT = 3003;

// Middleware to parse JSON bodies
app.use(express.json());

// PostgreSQL connection configuration
const client = new Client({
  user: process.env.DB_USER,
  host: process.env.DB_HOST,
  database: process.env.DB_NAME,
  password: process.env.DB_PASSWORD,
  port: parseInt(process.env.DB_PORT, 10),
});

// Connect to PostgreSQL
client.connect();

// Function to verify the message
const isMessageValid = async ({ message, address, signature }) => {
  try {
    const signerAddr = await verifyMessage(message, signature);
    return signerAddr.toLowerCase() === address.toLowerCase();
  } catch (err) {
    console.error('Verification error:', err);
    return false;
  }
};

// Endpoint to handle the POST request from agent.sh
app.post('/', async (req, res) => {
  try {
    const { key: signature, timestamp, address, peer_count } = req.body;

    if (!signature || !timestamp || !address || !peer_count) {
      return res.status(400).json({ error: 'Missing required fields' });
    }

    // Concatenate the address and timestamp to form the message
    const message = `${address}${timestamp}`;

    // Verify the signature
    const isValid = await isMessageValid({ message, address, signature });

    if (!isValid) {
      return res.status(401).json({ error: 'Invalid signature' });
    }

    // Insert the check-in data into the validator_checkin table
    await client.query(
      'INSERT INTO validator_checkin (address, timestamp, peer_count) VALUES ($1, $2, $3)',
      [address.toLowerCase(), timestamp, peer_count]
    );

    res.status(200).json({ status: 'ok' });
  } catch (err) {
    console.error('Error processing check-in:', err);
    res.status(500).json({ error: 'Server error' });
  }
});

// Start the server
app.listen(PORT, () => {
  console.log(`Server is running on http://localhost:${PORT}`);
});
