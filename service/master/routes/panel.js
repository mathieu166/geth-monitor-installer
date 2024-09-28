const express = require("express");
const { v4: uuidv4 } = require("uuid");
const { verifyMessage } = require("ethers");
const router = express.Router(); // Create a router instance

const crypto = require("crypto");

const ENCRYPTION_KEY = process.env.ENCRYPTION_KEY; // Key from environment variable
const IV_LENGTH = 16; // For AES, this is always 16 bytes

// Decrypt password function
function decryptPassword(text) {
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

module.exports = (client) => {
  // Create session route
  router.post("/create_session", async (req, res) => {
    try {
      const { discord_username } = req.body;

      if (!discord_username) {
        return res.status(400).json({ error: "discord_username is required" });
      }

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

        return res.status(200).json({ session_key: existingSessionKey });
      }

      // Step 3: If no active session exists, create a new session
      const newSessionKey = uuidv4().replace(/-/g, "");

      await client.query(
        `INSERT INTO validator_panel_session (discord_username, session_key, session_timeout)
         VALUES ($1, $2, EXTRACT(EPOCH FROM NOW() + INTERVAL '30 minutes'))`,
        [discord_username, newSessionKey]
      );

      // Step 4: Return the new session_key
      res.status(201).json({ session_key: newSessionKey });
    } catch (err) {
      console.error("Error creating session:", err);
      res.status(500).json({ error: "Server error", details: err.message });
    }
  });

  // Confirm Ownership Of Wallet
  router.post("/confirmOwnership", async (req, res) => {
    try {
      const { signedMessage, message, sessionKey, discordUsername, address } =
        req.body;

      // Step 1: Validate input
      if (
        !signedMessage ||
        !message ||
        !sessionKey ||
        !discordUsername ||
        !address
      ) {
        return res.status(400).json({ error: "Missing required fields" });
      }

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
        return res.status(403).json({ error: "Invalid or expired session" });
      }

      // Refresh session timeout
      await refreshSessionTimeout(client, discordUsername, sessionKey);

      // Step 3: Verify ownership (signature check)
      const isValid = await isMessageValid({
        message,
        address,
        signature: signedMessage,
      });

      if (!isValid) {
        return res.status(400).json({ error: "Message verification failed" });
      }

      // Step 4: Check if the address is already in the `validator` table
      const addressExists = await client.query(
        "SELECT COUNT(*) FROM validator WHERE address = $1",
        [address.toLowerCase()]
      );

      if (parseInt(addressExists.rows[0].count) > 0) {
        await client.query(
          "UPDATE validator SET discord_username = $1 WHERE address = $2",
          [discordUsername, address.toLowerCase()]
        );
      }

      // Step 7: Return success message
      return res
        .status(200)
        .json({ success: true, message: "Ownership confirmed" });
    } catch (err) {
      console.error("Error confirming ownership:", err);
      res
        .status(500)
        .json({ error: "Internal server error", details: err.message });
    }
  });

  // Get verified wallets route
  router.get("/getVerifiedWallets", async (req, res) => {
    try {
      const { discord_username, session_key } = req.query;

      if (!discord_username || !session_key) {
        return res
          .status(400)
          .json({ error: "discord_username and session_key are required" });
      }

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

      // Refresh session timeout
      await refreshSessionTimeout(client, discord_username, sessionKey);

      // Step 2: Fetch addresses and encrypted passwords tied to the discord_username
      const addressResult = await client.query(
        `SELECT address, encrypted_password 
         FROM validator 
         WHERE discord_username = $1`,
        [discord_username]
      );

      // Step 3: Decrypt the passwords and map to the addresses
      const wallets = addressResult.rows.map((row) => ({
        address: row.address,
        password: decryptPassword(row.encrypted_password),
      }));

      // Step 4: Return the addresses and decrypted passwords
      res.status(200).json({ wallets });
    } catch (err) {
      console.error("Error fetching verified wallets:", err);
      res.status(500).json({ error: "Server error", details: err.message });
    }
  });

  router.get("/verifyWallet", async (req, res) => {
    const { address, discord_username, session_key } = req.query;

    if (!discord_username || !session_key) {
      return res
        .status(400)
        .json({ error: "discord_username and session_key are required" });
    }

    if (!address) {
      return res.status(400).json({ error: "Address is required" });
    }

    try {
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

      // Refresh session timeout
      await refreshSessionTimeout(client, discord_username, sessionKey);


      const query = "SELECT COUNT(*) FROM validator WHERE address = $1";
      const result = await client.query(query, [address.toLowerCase()]);

      const found = parseInt(result.rows[0].count) > 0;

      res.json({ found });
    } catch (error) {
      console.error("Error verifying wallet:", error);
      res.status(500).json({ error: "Internal server error" });
    }
  });
  return router;
};
