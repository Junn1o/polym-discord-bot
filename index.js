// index.js
require('dotenv').config();
const fs = require('node:fs');
const path = require('node:path');
const { Client, Collection, Events, GatewayIntentBits } = require('discord.js');
const { startDashboard, handleDashboardInteraction, markDashboardOffline } = require('./utils/dashboard');
const { handleNetbirdInteraction } = require('./utils/netbirdDashboard');

const client = new Client({ intents: [GatewayIntentBits.Guilds] });

client.commands = new Collection();

const commandsPath = path.join(__dirname, 'commands');
const commandFiles = fs.readdirSync(commandsPath).filter(f => f.endsWith('.js'));

for (const file of commandFiles) {
    const filePath = path.join(commandsPath, file);
    const command = require(filePath);
    client.commands.set(command.data.name, command);
}

client.once(Events.ClientReady, c => {
    console.log(`Logged in as ${c.user.tag}`);
    startDashboard(c).catch(err => console.error('Dashboard init failed:', err));
});

client.on(Events.InteractionCreate, async interaction => {
    if (interaction.isAutocomplete()) {
        const command = interaction.client.commands.get(interaction.commandName);
        if (!command?.autocomplete) return;
        try {
            await command.autocomplete(interaction);
        } catch (err) {
            console.error(err);
        }
        return;
    }

    if (interaction.isButton() || interaction.isStringSelectMenu() || interaction.isModalSubmit()) {
        try {
            if (await handleNetbirdInteraction(interaction)) return;
            await handleDashboardInteraction(interaction);
        } catch (err) {
            console.error(err);
        }
        return;
    }

    if (!interaction.isChatInputCommand()) return;

    const command = interaction.client.commands.get(interaction.commandName);
    if (!command) return;

    try {
        await command.execute(interaction);
    } catch (err) {
        console.error(err);
        if (interaction.deferred || interaction.replied) {
            await interaction.editReply('Command failed.');
        } else {
            await interaction.reply({ content: 'Command failed.', ephemeral: true });
        }
    }
});

let stopping = false;

async function shutdown(signal) {
    if (stopping) return;
    stopping = true;
    console.log(`Received ${signal}, marking dashboard offline.`);
    // Docker kills the container 10s after SIGTERM, so give up well before that.
    await Promise.race([markDashboardOffline(), new Promise(resolve => setTimeout(resolve, 8_000))]);
    await client.destroy();
    process.exit(0);
}

process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('SIGINT', () => shutdown('SIGINT'));

client.login(process.env.DISCORD_TOKEN);
