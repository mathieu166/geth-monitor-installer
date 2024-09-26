require('dotenv').config();
const {REST, Routes, ApplicationCommandOptionType} = require('discord.js');

const commands = [
    {
        name: 'add',
        description: 'add two numbers!',
        options: [
            {
                name: 'first-number',
                description: 'the first number',
                type: ApplicationCommandOptionType.Number,
                require: true
            },
            {
                name: 'second-number',
                description: 'the second number',
                type: ApplicationCommandOptionType.Number,
                require: true
            }
        ]
    }
];

const rest = new REST({version: '10'}).setToken(process.env.DISCORD_TOKEN);

(async() =>{
    try{
        console.log('Started refreshing application (/) commands.');

        await rest.put(
            Routes.applicationGuildCommands(process.env.DISCORD_CLIENT_ID, process.env.DISCORD_GUILD_ID),
            {body: commands}
        
        )

        console.log('Done registering')
    }catch(e){
        console.log(`Errorss: ${e}`)
    }
})();