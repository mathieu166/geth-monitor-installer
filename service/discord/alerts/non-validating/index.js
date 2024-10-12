require("dotenv").config();
const { Pool } = require("pg");
const { REST } = require("@discordjs/rest");
const { Routes } = require("discord-api-types/v9");

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

async function sendDiscordMessage(userId, blockNumber, lastBlockTimestamp, minutesSinceLastBlock) {
    try {
      // First, open a DM channel with the user
      const dmChannel = await rest.post(Routes.userChannels(), {
        body: { recipient_id: userId },
      });
      
      // Send an embedded message
      const embedMessage = {
        title: "⚠️ Validator Node Alert",
        description: "Your node has not validated a block in over 45 minutes. Please check your node.",
        color: 0xff0000, // Red color for the alert
        fields: [
          { name: "Last Block Number", value: `#${blockNumber}`, inline: true },
          { name: "Time Since Last Block", value: `${minutesSinceLastBlock} minutes`, inline: true },
          { name: "Last Block Timestamp", value: new Date(lastBlockTimestamp * 1000).toISOString(), inline: false },
        ],
        image: {
          url: "https://example.com/your-status-image.png", // Replace with your image URL
        },
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
  // Infinite loop to run the process continuously
  while (true) {
    const client = await pool.connect();
    try {
      const now = Math.floor(Date.now() / 1000); // current time in seconds (epoch)

      // Fetch validators with alerts enabled
      const result = await pool.query(
        `
            WITH access_check AS (
                -- Check the max access_expiry for each validator and filter early on
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
            const { discord_userid, last_block_timestamp, block_number } = row;

            // Calculate the time since the last block in minutes
            const minutesSinceLastBlock = Math.floor((now - last_block_timestamp) / 60);

            // Check if the last block is older than 45 minutes
            if (now - last_block_timestamp > THRESHOLD_TIME) {
              await sendDiscordMessage(discord_userid, block_number, last_block_timestamp, minutesSinceLastBlock);
            }
        } catch (e) {
            console.error(`Error processing validator ${row.address}: ${e.message}`);
            await new Promise((resolve) => setTimeout(resolve, 2000)); // Pause for 2 seconds before retrying
        }
      }

      // Sleep for a while before checking again (e.g., 5 minutes)
      await new Promise((resolve) => setTimeout(resolve, 5 * 60 * 1000));
    } catch (err) {
      console.error("Error in main loop:", err);
    } finally {
      await client.release();
    }
  }
})();
