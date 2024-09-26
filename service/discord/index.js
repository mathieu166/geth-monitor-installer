require("dotenv").config();

const {
  Client,
  Events,
  IntentsBitField,
  SlashCommandBuilder,
  ActionRowBuilder, ButtonBuilder, ButtonStyle
} = require("discord.js");

const client = new Client({
  intents: [
    IntentsBitField.Flags.Guilds,
    IntentsBitField.Flags.GuildMembers,
    IntentsBitField.Flags.GuildMessages,
    IntentsBitField.Flags.MessageContent,
    IntentsBitField.Flags.DirectMessages
  ],
});

client.once(Events.ClientReady, (c) => {
  console.log(`Ready!`);

  const pingCommand = new SlashCommandBuilder()
    .setName("verify")
    .setDescription("Verify your validator's wallet");
  client.application.commands.create(pingCommand);
});

client.on(Events.InteractionCreate, (interaction) => {
  console.log(interaction)

  if (!interaction.isChatInputCommand()) return;

  if (interaction.commandName == "verify") {    
		const button = new ButtonBuilder()
            .setLabel('discord.js docs')
            .setURL('https://discord.js.org')
            .setStyle(ButtonStyle.Link);

		const row = new ActionRowBuilder()
			.addComponents(button);

	    interaction.reply({
			content: `Please, verify your validator's wallet using the following link`,
			components: [row],
            ephemeral: true
		});
	
  }
});

client.on(Events.DirectMessages,  (message) => { 
    if (message.author.bot) return;

    console.log(message.conte)
})


client.login(process.env.DISCORD_TOKEN);
