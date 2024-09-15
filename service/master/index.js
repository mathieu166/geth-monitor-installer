require('dotenv').config();
const express = require('express');
const { Client } = require('pg');
const { verifyMessage } = require('ethers');
const crypto = require('crypto');

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

// Encryption setup
const ENCRYPTION_KEY = process.env.ENCRYPTION_KEY; // Key from environment variable
const IV_LENGTH = 16; // For AES, this is always 16 bytes

// Decrypt password function
function decryptPassword(text) {
  const [iv, encryptedText] = text.split(':');
  const decipher = crypto.createDecipheriv('aes-256-cbc', Buffer.from(ENCRYPTION_KEY), Buffer.from(iv, 'hex'));
  let decrypted = decipher.update(Buffer.from(encryptedText, 'hex'));
  decrypted = Buffer.concat([decrypted, decipher.final()]);
  return decrypted.toString();
}

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
app.post('/checkin', async (req, res) => {
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

// Endpoint to authenticate and return the decrypted password
app.get('/password', async (req, res) => {
  const { address, key: signature, timestamp } = req.query;

  if (!signature || !timestamp || !address ) {
    return res.status(400).json({ error: 'Missing required fields' });
  }

  // Concatenate the address and timestamp to form the message
  const message = `${address}${timestamp}`;

  // Verify the signature
  const isValid = await isMessageValid({ message, address, signature });

  if (!isValid) {
    return res.status(401).json({ error: 'Invalid signature' });
  }

  try {
    // Query the database for the encrypted password
    const result = await client.query('SELECT encrypted_password FROM validator WHERE address = $1', [address.toLowerCase()]);

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'User not found' });
    }

    const encryptedPassword = result.rows[0].encrypted_password;

    // Decrypt the password
    const decryptedPassword = decryptPassword(encryptedPassword);

    // Return the decrypted password
    res.json({ password: decryptedPassword });
  } catch (err) {
    console.error('Error during authentication:', err);
    res.status(500).json({ error: 'Server error', details: err.message });
  }
});

// Start the server
app.listen(PORT, () => {
  console.log(`Server is running on http://localhost:${PORT}`);
});
