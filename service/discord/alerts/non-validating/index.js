require("dotenv").config();
const { Pool } = require("pg");
const { REST } = require("@discordjs/rest");
const { Routes } = require("discord-api-types/v9");
const fs = require("fs");
const path = require("path");

// Set up PostgreSQL connection
const pool = new Pool({
  user: process.env.DB_USER,
  host: process.env.DB_HOST,
  database: process.env.DB_NAME,
  password: process.env.DB_PASSWORD,
  port: parseInt(process.env.DB_PORT, 10),
});

// Discord API setup
const rest = new REST({ version: "9" }).setToken(process.env.DISCORD_TOKEN);

const THRESHOLD_TIME = 45 * 60; // 45 minutes in seconds
const ALERTED_FILE_PATH = path.join(require("os").homedir(), "alerted-nodes.txt");

// Helper function to load alerted nodes from file
function loadAlertedNodes() {
  if (fs.existsSync(ALERTED_FILE_PATH)) {
    const data = fs.readFileSync(ALERTED_FILE_PATH, "utf8");
    return new Set(data.split("\n").filter((line) => line.trim() !== ""));
  }
  return new Set();
}

// Helper function to save alerted nodes to file
function saveAlertedNodes(alertedSet) {
  fs.writeFileSync(ALERTED_FILE_PATH, Array.from(alertedSet).join("\n"), "utf8");
}

// Load alerted nodes into memory from the file
const alertedSet = loadAlertedNodes();

async function sendDiscordMessage(userId, title, description, color, fields) {
  try {
    // First, open a DM channel with the user
    const dmChannel = await rest.post(Routes.userChannels(), {
      body: { recipient_id: userId },
    });

    // Send an embedded message
    const embedMessage = {
      title,
      description,
      color,
      fields,
      footer: {
        text: "Please ensure your node is running smoothly to continue validating.",
      },
    };

    await rest.post(Routes.channelMessages(dmChannel.id), {
      body: { embeds: [embedMessage] },
    });

    console.log(`Message sent to user ${userId} via DM`);
  } catch (error) {
    console.error("Error sending message:", error);
  }
}

// Main loop
(async function main() {
  while (true) {
    const client = await pool.connect();
    try {
      const now = Math.floor(Date.now() / 1000); // current time in seconds (epoch)

      // Fetch validators with alerts enabled
      const result = await pool.query(
        `
            WITH access_check AS (
                SELECT v.address, COALESCE(MAX(vc.access_expiry), 1730419200) AS max_access_expiry
                FROM validator v
                LEFT JOIN validator_contribution vc ON vc.discord_username = v.discord_username
                WHERE v.is_discord_non_validation_alert = true
                GROUP BY v.address
                HAVING COALESCE(MAX(vc.access_expiry), 1730419200) > EXTRACT(epoch FROM NOW())
            )
            SELECT DISTINCT ON (v.address) v.address, v.discord_userid, b.timestamp AS last_block_timestamp, b.block_number
            FROM validator v
            JOIN access_check ac ON v.address = ac.address
            JOIN block b ON b.signer_address = v.address
            ORDER BY v.address, b.timestamp DESC;
        `
      );

      for (const row of result.rows) {
        try {
          const { discord_userid, last_block_timestamp, block_number, address } = row;
          const minutesSinceLastBlock = Math.floor((now - last_block_timestamp) / 60);

          if (now - last_block_timestamp > THRESHOLD_TIME) {
            // Send alert if not already alerted
            if (!alertedSet.has(address)) {
              await sendDiscordMessage(
                discord_userid,
                "⚠️ Validator Node Alert",
                "Your node has not validated a block in over 45 minutes. Please check your node.",
                0xff0000, // Red color for alert
                [
                  { name: "Last Block Number", value: `#${block_number}`, inline: true },
                  { name: "Time Since Last Block", value: `${minutesSinceLastBlock} minutes`, inline: true },
                  { name: "Last Block Timestamp", value: new Date(last_block_timestamp * 1000).toISOString(), inline: false }
                ]
              );
              // Add to alerted set and save to file
              alertedSet.add(address);
              saveAlertedNodes(alertedSet);
            }
          } else {
            // Node is back on track, send recovery message if it was alerted
            if (alertedSet.has(address)) {
              await sendDiscordMessage(
                discord_userid,
                "✅ Validator Node Back on Track",
                "Your node is now validating blocks again. Everything is back on track.",
                0x00ff00, // Green color for recovery
                [
                  { name: "Last Block Number", value: `#${block_number}`, inline: true },
                  { name: "Time Since Last Block", value: `${minutesSinceLastBlock} minutes`, inline: true },
                  { name: "Last Block Timestamp", value: new Date(last_block_timestamp * 1000).toISOString(), inline: false }
                ]
              );
              // Remove from alerted set and update the file
              alertedSet.delete(address);
              saveAlertedNodes(alertedSet);
            }
          }
        } catch (e) {
          console.error(`Error processing validator ${row.address}: ${e.message}`);
          await new Promise((resolve) => setTimeout(resolve, 2000)); // Pause for 2 seconds before retrying
        }
      }

      // Sleep for a while before checking again (e.g., 5 minutes)
      await new Promise((resolve) => setTimeout(resolve, 60 * 1000));
    } catch (err) {
      console.error("Error in main loop:", err);
    } finally {
      await client.release();
    }
  }
})();