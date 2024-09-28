
const axios = require('axios');

const MASTER_BASE_URL = process.env.MASTER_BASE_URL;
const PANEL_URL = process.env.PANEL_URL;

const {
	SlashCommandBuilder,
	ActionRowBuilder, ButtonBuilder, ButtonStyle
  } = require("discord.js");

module.exports = {
	data: new SlashCommandBuilder()
		.setName('openpanel')
		.setDescription('Open Validator Panel'),
	async execute(interaction) {
		try {
            // Get the discord username
            const discordUsername = interaction.user.username;
      
            // Step 1: Create or get a session key from master /create_session using axios
            const sessionResponse = await axios.post(`${MASTER_BASE_URL}/panel/create_session`, {
              discord_username: discordUsername,
            });
      
            // If the request failed, handle the error
            if (sessionResponse.status !== 200) {
              throw new Error('Failed to create session');
            }
      
            const sessionKey = sessionResponse.data.session_key;
      
            // Step 2: Build the panel URL with session_key and discord_username
            const panelUrl = `${PANEL_URL}?key=${sessionKey}&discorduser=${discordUsername}`;
      
            // Step 3: Create the button with the panel URL
            const button = new ButtonBuilder()
              .setLabel('Open Validator Panel')
              .setURL(panelUrl) // Set the dynamic URL here
              .setStyle(ButtonStyle.Link);
      
            const row = new ActionRowBuilder().addComponents(button);
      
            // Reply with the button link
            await interaction.reply({
              // content: `Open your Validator Panel:`,
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