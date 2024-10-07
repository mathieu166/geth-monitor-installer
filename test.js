require("dotenv").config();
const { Client, GatewayIntentBits } = require('discord.js');

// Create a new client instance
const client = new Client({ intents: [GatewayIntentBits.Guilds] });

// Replace with your bot token
const BOT_TOKEN = process.env.DISCORD_TOKEN;

// Replace with your Discord User ID
const USER_ID = '';

client.once('ready', () => {
    console.log(`Logged in as ${client.user.tag}!`);

    // Fetch the user by ID and send a message
    client.users.fetch(USER_ID).then(user => {
        user.send('Hello! This is a test message from your bot.')
            .then(() => console.log('Message sent successfully!'))
            .catch(console.error);
    }).catch(console.error);
});

// Log in to Discord with your bot's token
client.login(BOT_TOKEN);
