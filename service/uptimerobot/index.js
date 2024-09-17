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
    const validatorResult = await client.query(
      'SELECT is_uptimerobot_active FROM validator WHERE address = $1',
      [address]
    );

    if (validatorResult.rows.length === 0 || !validatorResult.rows[0].is_uptimerobot_active) {
      return res.status(403).json({
        status: 'error',
        message: 'Access denied: Signer is not active or not found in the validator table'
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
          message: `Signer did not validate a block in the last ${threshold / 60} minutes`
        });
      }
      return res.status(200).json({ status: 'ok', last_validated_timestamp: lastTimestamp });
    } else {
      return res.status(404).json({
        status: 'error',
        message: 'Signer address not found in the block table'
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
