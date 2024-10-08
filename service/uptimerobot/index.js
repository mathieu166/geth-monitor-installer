require('dotenv').config();
const express = require('express');
const { Client } = require('pg'); 

const app = express();
const PORT = 3002;

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

app.get('/', async (req, res) => {
  const address = req.query.address?.toLowerCase();
  const timeout = Math.max(parseInt(req.query.timeout || '45', 10), 30);
  const threshold = timeout * 60; 

  if (!address) {
    return res.status(400).json({ error: 'address is required' });
  }

  const currentTime = Math.floor(Date.now() / 1000);
  try {
    // Check if the signer is active in the validator table
    const checkAccess = await client.query(
      `SELECT COALESCE(MAX(vc.access_expiry), 1730419200) > EXTRACT (EPOCH FROM CURRENT_TIMESTAMP) access_granted
      FROM validator_contribution vc
      JOIN validator v ON vc.discord_username = v.discord_username
      WHERE v.address = $1`,
      [address]
    );

    if (!checkAccess.rows[0].access_granted) {
      return res.status(403).json({
        status: 'error',
        message: 'Access denied: Contribution Required. Request Access from matroxdev on Discord'
      });
    }

    // Check the timestamp validity in the block table
    const timestampResult = await client.query(
      'SELECT MAX(timestamp) AS lasttimestamp FROM block WHERE signer_address = $1',
      [address]
    );

    const row = timestampResult.rows[0];
    if (row && row.lasttimestamp) {
      const lastTimestamp = row.lasttimestamp;
      if (currentTime - lastTimestamp > threshold) {
        return res.status(400).json({
          status: 'error',
          message: `Validator did not validate a block in the last ${threshold / 60} minutes`
        });
      }
      return res.status(200).json({ status: 'ok', last_validated_timestamp: lastTimestamp });
    } else {
      return res.status(404).json({
        status: 'error',
        message: 'Validator address not found in the block table'
      });
    }
  } catch (err) {
    console.error('Database error:', err);
    return res.status(500).json({ error: 'Database error' });
  }
});

// Start the server
app.listen(PORT, () => {
  console.log(`Server is running on http://localhost:${PORT}`);
});
