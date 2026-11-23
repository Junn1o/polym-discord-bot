// utils/dashboard.js
const {
    ActionRowBuilder,
    ButtonBuilder,
    ButtonStyle,
    EmbedBuilder,
    MessageFlags,
    StringSelectMenuBuilder,
} = require('discord.js');
const { loadAliases } = require('./aliases');
const { isAllowed } = require('./auth');
const { buildNetbirdButtons } = require('./netbirdDashboard');

const PREFIX = 'dashboard';
const ACTIONS = [
    { command: 'start', label: 'Start', style: ButtonStyle.Success },
    { command: 'stop', label: 'Stop', style: ButtonStyle.Secondary },
    { command: 'restart', label: 'Restart', style: ButtonStyle.Primary },
    { command: 'forcestop', label: 'Force stop', style: ButtonStyle.Danger },
];

let refreshDashboard = null;

const STATUS_LABEL = {
    '-1': '🟡 Busy',
    0: '🔴 Stopped',
    1: '🟠 Stopping',
    2: '🟡 Starting',
    3: '🟢 Running',
};

async function fetchInstance(uuid) {
    const apiBase = process.env.API_BASE || 'http://localhost:23333';
    const qs = new URLSearchParams({ apikey: process.env.API_KEY, uuid, daemonId: process.env.DAEMON_ID });
    const res = await fetch(`${apiBase}/api/instance?${qs.toString()}`, { method: 'GET' });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return (await res.json()).data;
}

async function buildEmbed() {
    const aliases = loadAliases();
    const embed = new EmbedBuilder().setTitle('Server Dashboard').setColor(0x2b8a3e).setTimestamp();

    const entries = await Promise.all(
        Object.entries(aliases).map(async ([alias, uuid]) => {
            try {
                const inst = await fetchInstance(uuid);
                const status = STATUS_LABEL[inst.status] ?? `❔ ${inst.status}`;
                const info = inst.info ?? {};
                const players = info.currentPlayers >= 0 ? `${info.currentPlayers}/${info.maxPlayers}` : '-';
                return { name: alias, value: `${status}\nPlayers: ${players}`, inline: true };
            } catch {
                return { name: alias, value: '⚠️ Không lấy được trạng thái', inline: true };
            }
        })
    );

    if (entries.length === 0) embed.setDescription('Chưa có server trong aliases.json.');
    else embed.addFields(entries.slice(0, 25));
    return embed;
}

function buildComponents() {
    const aliases = Object.keys(loadAliases()).slice(0, 25);
    const rows = [];

    if (aliases.length > 0) {
        rows.push(
            new ActionRowBuilder().addComponents(
                new StringSelectMenuBuilder()
                    .setCustomId(`${PREFIX}:select`)
                    .setPlaceholder('Chọn server để điều khiển')
                    .addOptions(aliases.map(name => ({ label: name, value: name })))
            )
        );
    }

    rows.push(
        new ActionRowBuilder().addComponents(
            new ButtonBuilder().setCustomId(`${PREFIX}:refresh`).setLabel('Refresh').setStyle(ButtonStyle.Secondary),
            ...buildNetbirdButtons()
        )
    );
    return rows;
}

function buildActionRow(alias) {
    return new ActionRowBuilder().addComponents(
        ACTIONS.map(a =>
            new ButtonBuilder().setCustomId(`${PREFIX}:${a.command}:${alias}`).setLabel(a.label).setStyle(a.style)
        )
    );
}

async function handleDashboardInteraction(interaction) {
    if (!interaction.customId?.startsWith(`${PREFIX}:`)) return false;

    if (!isAllowed(interaction)) {
        await interaction.reply({ content: 'Bạn không có quyền dùng lệnh này.', flags: MessageFlags.Ephemeral });
        return true;
    }

    const [, action, ...rest] = interaction.customId.split(':');
    const alias = rest.join(':');

    if (action === 'refresh') {
        await interaction.deferUpdate();
        await refreshDashboard?.();
        return true;
    }

    if (action === 'select' && interaction.isStringSelectMenu()) {
        const selected = interaction.values[0];
        await interaction.reply({
            content: `Server **${selected}**`,
            components: [buildActionRow(selected)],
            flags: MessageFlags.Ephemeral,
        });
        return true;
    }

    const command = ACTIONS.some(a => a.command === action) && interaction.client.commands.get(action);
    if (!command || !interaction.isButton()) return false;

    // Reuse the slash command handler by faking the `name` option.
    const proxy = Object.create(interaction, {
        options: { value: { getString: () => alias } },
    });

    try {
        await command.execute(proxy);
    } catch (err) {
        console.error(err);
        const reply = proxy.deferred || proxy.replied ? proxy.editReply.bind(proxy) : proxy.reply.bind(proxy);
        await reply({ content: 'Command failed.', flags: MessageFlags.Ephemeral }).catch(() => {});
    }
    await refreshDashboard?.();
    return true;
}

async function findExistingMessage(channel, botId) {
    const messages = await channel.messages.fetch({ limit: 20 });
    return messages.find(m => m.author.id === botId && m.embeds[0]?.title === 'Server Dashboard');
}

async function resolveChannels(client, channelIds) {
    const allowedGuilds = new Set(JSON.parse(process.env.GUILD_IDS || '[]'));
    const byGuild = new Map();

    for (const channelId of channelIds) {
        const channel = await client.channels.fetch(channelId).catch(() => null);
        if (!channel?.isTextBased() || !channel.guildId) {
            console.error(`Dashboard: channel ${channelId} not found or not a guild text channel.`);
            continue;
        }
        if (!allowedGuilds.has(channel.guildId)) {
            console.error(`Dashboard: guild ${channel.guildId} is not in GUILD_IDS.`);
            continue;
        }
        if (byGuild.has(channel.guildId)) {
            console.error(`Dashboard: guild ${channel.guildId} already has a dashboard channel, skipping ${channelId}.`);
            continue;
        }
        byGuild.set(channel.guildId, channel);
    }
    return [...byGuild.values()];
}

async function startDashboard(client) {
    const channelIds = JSON.parse(process.env.DASHBOARD_CHANNEL_IDS || '[]');
    if (channelIds.length === 0) return;

    if (!process.env.API_KEY || !process.env.DAEMON_ID) {
        console.error('Dashboard: missing env vars API_KEY or DAEMON_ID.');
        return;
    }

    const channels = await resolveChannels(client, channelIds);
    if (channels.length === 0) return;

    const targets = await Promise.all(
        channels.map(async channel => ({
            channel,
            message: await findExistingMessage(channel, client.user.id).catch(() => null),
        }))
    );
    const interval = Number(process.env.DASHBOARD_INTERVAL_MS) || 60_000;

    const update = async () => {
        let payload;
        try {
            payload = { embeds: [await buildEmbed()], components: buildComponents() };
        } catch (err) {
            console.error('Dashboard build failed:', err);
            return;
        }

        await Promise.all(
            targets.map(async target => {
                try {
                    if (target.message) {
                        // Message may have been deleted manually; fall back to posting a new one.
                        target.message = await target.message.edit(payload).catch(() => null);
                    }
                    if (!target.message) target.message = await target.channel.send(payload);
                } catch (err) {
                    console.error(`Dashboard update failed in channel ${target.channel.id}:`, err);
                }
            })
        );
    };

    refreshDashboard = update;
    await update();
    setInterval(update, interval);
}

module.exports = { startDashboard, handleDashboardInteraction };
