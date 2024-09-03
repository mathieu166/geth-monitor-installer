require('dotenv').config();
const express = require('express');
const { Client } = require('pg');
const { ethers } = require('ethers');

const app = express();
const PORT = 3003;

app.use(express.json());

const client = new Client({
	user: process.env.DB_USER,
	host: process.env.DB_HOST,
	database: process.env.DB_NAME,
	password: process.env.DB_PASSWORD,
	port: parseInt(process.env.DB_PORT, 10),
});

client.connect();

app.post('/', async (req, res) => {
	try {
		const { key, timestamp, address, peer_count } = req.body;

		if (!key || !timestamp || !address || !peer_count) {
			return res.status(400).json({ error: 'Missing required fields' });
		}

		// Concatenate the address and timestamp
		const message = ethers.utils.defaultAbiCoder.encode(['string', 'uint256'], [address, timestamp]);

		// Recover the signer address from the signature
		const signerAddress = ethers.utils.verifyMessage(ethers.utils.arrayify(ethers.utils.keccak256(message)), key);

		// Verify that the signerAddress matches the provided address
		if (signerAddress.toLowerCase() !== address.toLowerCase()) {
			return res.status(401).json({ error: 'Invalid signature' });
		}

		// Insert the check-in data into the validator_checkin table
		await client.query(
			'INSERT INTO validator_checkin (address, timestamp, peer_count) VALUES ($1, $2, $3)',
			[address, timestamp, peer_count]
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
