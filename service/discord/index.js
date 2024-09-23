require('dotenv').config();

const { Client, Events, SlashCommandBuilder } = require('discord.js');

const client = new Client({intents: []});

client.once(Events.ClientReady, c=>{
    console.log('Ready!');  

    const pingCommand = new SlashCommandBuilder()
        .setName("ping")
        .setDescription("Replies with Pong!")
    client.application.commands.create(pingCommand)
})

client.on(Events.InteractionCreate, interaction => {
    if (!interaction.isChatInputCommand()) return;
    if (interaction.commandName == 'ping'){
        interaction.reply('Pong!')
    }
})

client.login(process.env.DISCORD_TOKEN)

