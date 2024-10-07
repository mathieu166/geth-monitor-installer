const express = require("express");
const { v4: uuidv4 } = require("uuid");
const { verifyMessage } = require("ethers");
const router = express.Router(); // Create a router instance

const crypto = require("crypto");
const contributionSpecs  = require("../../contribution_extract/specs");


const ENCRYPTION_KEY = process.env.ENCRYPTION_KEY; // Key from environment variable
const IV_LENGTH = 16; // For AES, this is always 16 bytes

// Decrypt password function
function decryptText(text) {
  const [iv, encryptedText] = text.split(":");
  const decipher = crypto.createDecipheriv(
    "aes-256-cbc",
    Buffer.from(ENCRYPTION_KEY),
    Buffer.from(iv, "hex")
  );
  let decrypted = decipher.update(Buffer.from(encryptedText, "hex"));
  decrypted = Buffer.concat([decrypted, decipher.final()]);
  return decrypted.toString();
}

// Function to verify the message
const isMessageValid = async ({ message, address, signature }) => {
  try {
    const signerAddr = await verifyMessage(message, signature);
    return signerAddr.toLowerCase() === address.toLowerCase();
  } catch (err) {
    console.error("Verification error:", err);
    return false;
  }
};

const refreshSessionTimeout = async (client, discordUsername, sessionKey) => {
  await client.query(
    `UPDATE validator_panel_session 
         SET session_timeout = EXTRACT(EPOCH FROM NOW() + INTERVAL '30 minutes') 
         WHERE discord_username = $1 AND session_key = $2`,
    [discordUsername, sessionKey]
  );
};

module.exports = (pool) => {
  router.post("/create_session", async (req, res) => {
    const { discord_username } = req.body;

    if (!discord_username) {
      return res.status(400).json({ error: "discord_username is required" });
    }

    const client = await pool.connect(); // Get a client from the pool
    try {
      // Start a transaction
      await client.query("BEGIN");

      // Step 1: Check if there's an active session (not timed out)
      const result = await client.query(
        `SELECT session_key 
         FROM validator_panel_session 
         WHERE discord_username = $1 
         AND session_timeout > EXTRACT(EPOCH FROM NOW())`,
        [discord_username]
      );

      if (result.rows.length > 0) {
        // Step 2: If active session exists, update the session_timeout to +30 minutes and return the same session_key
        const existingSessionKey = result.rows[0].session_key;

        await client.query(
          `UPDATE validator_panel_session 
           SET session_timeout = EXTRACT(EPOCH FROM NOW() + INTERVAL '30 minutes') 
           WHERE session_key = $1`,
          [existingSessionKey]
        );

        // Commit the transaction
        await client.query("COMMIT");

        return res.status(200).json({ session_key: existingSessionKey });
      }

      // Step 3: If no active session exists, create a new session
      const newSessionKey = uuidv4().replace(/-/g, "");

      await client.query(
        `INSERT INTO validator_panel_session (discord_username, session_key, session_timeout)
         VALUES ($1, $2, EXTRACT(EPOCH FROM NOW() + INTERVAL '30 minutes'))`,
        [discord_username, newSessionKey]
      );

      // Commit the transaction
      await client.query("COMMIT");

      // Step 4: Return the new session_key
      res.status(200).json({ session_key: newSessionKey });
    } catch (err) {
      await client.query("ROLLBACK"); // Rollback the transaction on error
      console.error("Error creating session:", err);
      res.status(500).json({ error: "Server error", details: err.message });
    } finally {
      client.release(); // Release the client back to the pool
    }
  });

  router.post("/confirmOwnership", async (req, res) => {
    const {
      signedMessage,
      message,
      sessionKey: k,
      discordUsername,
      discordUserId,
      address,
    } = req.body;

    // Step 1: Validate input
    if (!signedMessage || !message || !k || !discordUsername || !address) {
      return res.status(400).json({ error: "Missing required fields" });
    }

    const client = await pool.connect(); // Get a client from the pool
    try {
      // Start a transaction
      await client.query("BEGIN");

      const sessionKey = decryptText(k);

      // Step 2: Validate session
      const sessionResult = await client.query(
        `SELECT session_key 
         FROM validator_panel_session 
         WHERE discord_username = $1 
         AND session_key = $2 
         AND session_timeout > EXTRACT(EPOCH FROM NOW())`,
        [discordUsername, sessionKey]
      );

      if (sessionResult.rows.length === 0) {
        await client.query("ROLLBACK");
        return res.status(403).json({ error: "Invalid or expired session" });
      }

      // Step 3: Verify ownership (signature check)
      const isValid = await isMessageValid({
        message,
        address,
        signature: signedMessage,
      });

      if (!isValid) {
        await client.query("ROLLBACK");
        return res.status(400).json({ error: "Message verification failed" });
      }

      // Refresh session timeout
      await refreshSessionTimeout(client, discordUsername, sessionKey);

      // Step 4: Check if the address is already in the `validator` table
      const addressExists = await client.query(
        "SELECT COUNT(*) FROM validator WHERE address = $1",
        [address.toLowerCase()]
      );

      if (parseInt(addressExists.rows[0].count) > 0) {
        // Update discord_username in the validator table
        await client.query(
          "UPDATE validator SET discord_username = $1, discord_userid = $2 WHERE address = $3",
          [discordUsername, discordUserId, address.toLowerCase()]
        );
      } else {
        // Step 5: Address not found in validator table, check in validator_verified_wallet
        const existingWallet = await client.query(
          "SELECT discord_username FROM validator_verified_wallet WHERE address = $1",
          [address.toLowerCase()]
        );

        if (existingWallet.rows.length > 0) {
          // Delete existing record if found for a different discord username
          await client.query(
            "DELETE FROM validator_verified_wallet WHERE address = $1",
            [address.toLowerCase()]
          );
        }

        // Step 6: Insert new data into validator_verified_wallet
        await client.query(
          "INSERT INTO validator_verified_wallet (discord_username, address) VALUES ($1, $2)",
          [discordUsername, address.toLowerCase()]
        );
      }

      // Commit the transaction
      await client.query("COMMIT");

      // Step 7: Return success message
      return res
        .status(200)
        .json({ success: true, message: "Ownership confirmed" });
    } catch (err) {
      await client.query("ROLLBACK"); // Rollback the transaction on error

      console.error("Error confirming ownership:", err);
      res
        .status(500)
        .json({ error: "Internal server error", details: err.message });
    } finally {
      client.release(); // Release the client back to the pool
    }
  });

  router.post("/submitTransaction", async (req, res) => {
    const { session_key: k, discord_username, txhash } = req.body;

    // Step 1: Validate input
    if (!k || !discord_username || !txhash) {
      return res.status(400).json({ error: "Missing required fields" });
    }

    const client = await pool.connect(); // Get a client from the pool

    try {
      // Start a transaction
      await client.query("BEGIN");

      const session_key = decryptText(k);

      // Step 2: Validate session
      const sessionResult = await client.query(
        `SELECT session_key 
         FROM validator_panel_session 
         WHERE discord_username = $1 
         AND session_key = $2 
         AND session_timeout > EXTRACT(EPOCH FROM NOW())`,
        [discord_username, session_key]
      );

      if (sessionResult.rows.length === 0) {
        await client.query("ROLLBACK"); // Rollback the transaction on error

        return res.status(403).json({ error: "Invalid or expired session" });
      }

      // Refresh session timeout
      await refreshSessionTimeout(client, discord_username, session_key);

      // Step 3: Check if the txhash already exists for the discord_username
      const existingTx = await client.query(
        `SELECT is_valid 
         FROM validator_tx 
         WHERE txhash = $1 AND discord_username = $2
         FOR UPDATE
         `,
        [txhash, discord_username]
      );

      if (existingTx.rows.length > 0) {
        // Transaction hash already exists
        const { is_valid } = existingTx.rows[0];

        if (is_valid) {
          // Commit the transaction
          await client.query("COMMIT");

          // If transaction is valid, return an error
          return res
            .status(400)
            .json({ error: "Transaction already submitted!" });
        } else {
          // If not valid, set it as pending again for reprocessing
          await client.query(
            `UPDATE validator_tx 
             SET is_pending = true 
             WHERE txhash = $1 AND discord_username = $2 AND is_valid = false`,
            [txhash, discord_username]
          );

          // Commit the transaction
          await client.query("COMMIT");

          return res
            .status(200)
            .json({ message: "Transaction will be reprocessed" });
        }
      }

      // Step 4: Insert the new transaction into the validator_tx table
      await client.query(
        `INSERT INTO validator_tx (txhash, discord_username, is_pending) 
         VALUES ($1, $2, true)`,
        [txhash, discord_username]
      );

      // Commit the transaction
      await client.query("COMMIT");

      // Step 5: Return success response
      res.status(200).json({ message: "Transaction submitted successfully" });
    } catch (err) {
      await client.query("ROLLBACK"); // Rollback the transaction on error

      console.error("Error submitting transaction:", err);
      res
        .status(500)
        .json({ error: "Internal server error", details: err.message });
    } finally {
      client.release(); // Release the client back to the pool
    }
  });

  router.get("/getContributions", async (req, res) => {
    const { discord_username, session_key: k } = req.query;

    if (!discord_username || !k) {
      return res
        .status(400)
        .json({ error: "discord_username and session_key are required" });
    }

    const client = await pool.connect(); // Get a client from the pool

    try {
      // Start a transaction
      await client.query("BEGIN");

      const session_key = decryptText(k);

      // Step 1: Validate the session
      const sessionResult = await client.query(
        `SELECT session_key 
         FROM validator_panel_session 
         WHERE discord_username = $1 
         AND session_key = $2 
         AND session_timeout > EXTRACT(EPOCH FROM NOW())`,
        [discord_username, session_key]
      );

      if (sessionResult.rows.length === 0) {
        await client.query("ROLLBACK"); // Rollback the transaction on error

        return res.status(403).json({ error: "Invalid or expired session" });
      }

      // Refresh session timeout
      await refreshSessionTimeout(client, discord_username, session_key);

      const contributionsResults = await client.query(
        `SELECT txdate, address, "chain", txhash, amount, additional_days, access_expiry
        FROM validator_contribution
        WHERE discord_username= $1
        ORDER BY access_expiry DESC`,
        [discord_username]
      )

      const pendingResults = await client.query(
        `SELECT txhash, created_at, is_pending, is_valid, reason
        FROM validator_tx
        WHERE discord_username=$1
          AND (is_pending = true or is_valid = false)
         ORDER BY created_at DESC`,
        [discord_username]
      )

      await client.query("COMMIT");

      res.status(200).json({ contributions: contributionsResults.rows, pendingContributions: pendingResults.rows });
    } catch (err) {
      await client.query("ROLLBACK"); // Rollback the transaction on error

      console.error("Error fetching contributions:", err);
      res.status(500).json({ error: "Server error", details: err.message });
    } finally {
      client.release();
    }
  });

  router.get("/getContributionSpecs", async (req, res) => {
    const { discord_username, session_key: k } = req.query;

    if (!discord_username || !k) {
      return res
        .status(400)
        .json({ error: "discord_username and session_key are required" });
    }

    const client = await pool.connect(); // Get a client from the pool

    try {
      // Start a transaction
      const session_key = decryptText(k);

      // Step 1: Validate the session
      const sessionResult = await client.query(
        `SELECT session_key 
         FROM validator_panel_session 
         WHERE discord_username = $1 
         AND session_key = $2 
         AND session_timeout > EXTRACT(EPOCH FROM NOW())`,
        [discord_username, session_key]
      );

      if (sessionResult.rows.length === 0) {
        return res.status(403).json({ error: "Invalid or expired session" });
      }

      res.status(200).json(contributionSpecs);
    } catch (err) {
      console.error("Error fetching contribution specs:", err);
      res.status(500).json({ error: "Server error", details: err.message });
    } finally {
      client.release();
    }
  });

  router.get("/getVerifiedWallets", async (req, res) => {
    const { discord_username, session_key: k } = req.query;

    if (!discord_username || !k) {
      return res
        .status(400)
        .json({ error: "discord_username and session_key are required" });
    }

    const client = await pool.connect(); // Get a client from the pool

    try {
      // Start a transaction
      await client.query("BEGIN");

      const session_key = decryptText(k);

      // Step 1: Validate the session
      const sessionResult = await client.query(
        `SELECT session_key 
         FROM validator_panel_session 
         WHERE discord_username = $1 
         AND session_key = $2 
         AND session_timeout > EXTRACT(EPOCH FROM NOW())`,
        [discord_username, session_key]
      );

      if (sessionResult.rows.length === 0) {
        await client.query("ROLLBACK"); // Rollback the transaction on error

        return res.status(403).json({ error: "Invalid or expired session" });
      }

      // Refresh session timeout
      await refreshSessionTimeout(client, discord_username, session_key);

      // Step 2: Fetch addresses and encrypted passwords tied to the discord_username from the validator table
      const addressResult = await client.query(
        `SELECT address, encrypted_password 
         FROM validator 
         WHERE discord_username = $1`,
        [discord_username]
      );

      // Step 3: Fetch verified wallets from the validator_verified_wallet table
      const verifiedWalletsResult = await client.query(
        `SELECT discord_username, address 
         FROM validator_verified_wallet 
         WHERE discord_username = $1`,
        [discord_username]
      );

      // Step 4: Decrypt the passwords and map to the addresses for the validator table
      const validators = addressResult.rows.map((row) => ({
        address: row.address,
        password: decryptText(row.encrypted_password),
      }));

      // Step 5: Map verified wallets
      const wallets = verifiedWalletsResult.rows.map((row) => ({
        discord_username: row.discord_username,
        address: row.address,
      }));

      await client.query("COMMIT");

      // Step 6: Return the addresses and wallets
      res.status(200).json({ validators, wallets });
    } catch (err) {
      await client.query("ROLLBACK"); // Rollback the transaction on error

      console.error("Error fetching verified wallets:", err);
      res.status(500).json({ error: "Server error", details: err.message });
    } finally {
      client.release();
    }
  });

  router.get("/verifyWallet", async (req, res) => {
    const { address, discord_username, session_key: k } = req.query;

    if (!discord_username || !k) {
      return res
        .status(400)
        .json({ error: "discord_username and session_key are required" });
    }

    if (!address) {
      return res.status(400).json({ error: "Address is required" });
    }

    const client = await pool.connect(); // Get a client from the pool

    try {
      // Start a transaction
      await client.query("BEGIN");

      const session_key = decryptText(k);

      const sessionResult = await client.query(
        `SELECT session_key 
         FROM validator_panel_session 
         WHERE discord_username = $1 
         AND session_key = $2 
         AND session_timeout > EXTRACT(EPOCH FROM NOW())`,
        [discord_username, session_key]
      );

      if (sessionResult.rows.length === 0) {
        await client.query("ROLLBACK"); // Rollback the transaction on error

        return res.status(403).json({ error: "Invalid or expired session" });
      }

      // Refresh session timeout
      await refreshSessionTimeout(client, discord_username, session_key);

      const query = "SELECT COUNT(*) FROM validator WHERE address = $1";
      const result = await client.query(query, [address.toLowerCase()]);

      const found = parseInt(result.rows[0].count) > 0;

      await client.query("COMMIT");

      res.json({ found });
    } catch (error) {
      await client.query("ROLLBACK"); // Rollback the transaction on error

      console.error("Error verifying wallet:", error);
      res.status(500).json({ error: "Internal server error" });
    } finally {
      client.release();
    }
  });
  return router;
};
