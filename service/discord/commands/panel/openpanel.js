const axios = require('axios');
const crypto = require("crypto");
const {
	SlashCommandBuilder,
	ActionRowBuilder, 
	ButtonBuilder, 
	ButtonStyle,
	EmbedBuilder // Add EmbedBuilder for embed creation
} = require("discord.js");

const MASTER_BASE_URL = process.env.MASTER_BASE_URL;
const PANEL_URL = process.env.PANEL_URL;
const ENCRYPTION_KEY = process.env.ENCRYPTION_KEY; // Key from environment variable
const IV_LENGTH = 16; // For AES, this is always 16 bytes

function encryptText(text) {
	// Generate a random initialization vector (IV)
	const iv = crypto.randomBytes(IV_LENGTH);

	// Create a cipher using the encryption key and the IV
	const cipher = crypto.createCipheriv(
		"aes-256-cbc",
		Buffer.from(ENCRYPTION_KEY),
		iv
	);

	// Encrypt the text
	let encrypted = cipher.update(text);
	encrypted = Buffer.concat([encrypted, cipher.final()]);

	// Return the IV and the encrypted text, both encoded in hexadecimal
	return iv.toString("hex") + ":" + encrypted.toString("hex");
}

module.exports = {
	data: new SlashCommandBuilder()
		.setName('openpanel')
		.setDescription('Open Validator Panel'),
	async execute(interaction) {
		try {
			// Get the discord username
			const discordUsername = interaction.user.username;
			const discordUserId = interaction.user.id;
      
			// Step 1: Create or get a session key from master /create_session using axios
			const sessionResponse = await axios.post(`${MASTER_BASE_URL}/panel/create_session`, {
				discord_username: discordUsername,
			});
      
			// If the request failed, handle the error
			if (sessionResponse.status !== 200) {
				throw new Error('Failed to create session');
			}
      
			const sessionKey = encryptText(sessionResponse.data.session_key);
      
			// Step 2: Build the panel URL with session_key and discord_username
			const panelUrl = `${PANEL_URL}?key=${sessionKey}&discorduser=${discordUsername}&discordUserId=${discordUserId}&timestamp=${new Date().getTime()}`;
      
			// Step 3: Create the button with the panel URL
			const button = new ButtonBuilder()
				.setLabel('Open Validator Panel')
				.setURL(panelUrl) // Set the dynamic URL here
				.setStyle(ButtonStyle.Link);
      
			const row = new ActionRowBuilder().addComponents(button);
			
			// Step 4: Create an embed for a more visually appealing response
			const embed = new EmbedBuilder()
				.setColor(0x00FF00) // You can choose a different color
				.setTitle('Validator Panel Access')
				.setDescription('Click the button below to access your Validator Panel. **Please note that your session will timeout after 30 minutes of inactivity.**')
				.addFields({ name: 'Discord Username', value: discordUsername, inline: true })
				.addFields({ name: 'Discord User ID', value: discordUserId, inline: true })
				.setTimestamp()
				.setFooter({ text: 'Validator System', iconURL: 'https://example.com/icon.png' }); // Optional footer and icon
      
			// Reply with the embed and the button
			await interaction.reply({
				embeds: [embed],
				components: [row],
				ephemeral: true,
			});
		} catch (error) {
			console.error('Error creating session or sending interaction reply:', error.message);
			await interaction.reply({
				content: `There was an error generating the panel link. Please try again later.`,
				ephemeral: true,
			});
		}
	},
};