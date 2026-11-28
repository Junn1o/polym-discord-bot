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
const { buildNetbirdButtons, isNetbirdEnabled } = require('./netbirdDashboard');
const { getPeerIp, getContainerStatus } = require('./netbird');
const { scheduleReplyDelete } = require('./autoDelete');
const { recordCommand, getHistory } = require('./history');

const PREFIX = 'dashboard';
const ACTIONS = [
    { command: 'start', label: 'Start', style: ButtonStyle.Success },
    { command: 'stop', label: 'Stop', style: ButtonStyle.Secondary },
    { command: 'restart', label: 'Restart', style: ButtonStyle.Primary },
    { command: 'forcestop', label: 'Force stop', style: ButtonStyle.Danger },
];

let refreshDashboard = null;
let dashboardTargets = [];
let dashboardTimer = null;
let shuttingDown = false;

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

function getPort(inst) {
    const allocated = inst.info?.allocatedPorts?.find(p => p.protocol === 'tcp') ?? inst.info?.allocatedPorts?.[0];
    if (allocated?.host) return allocated.host;
    return inst.config?.pingConfig?.port || null;
}

// NetBird IP of the host is static: fetch once, then reuse. Retries on later refreshes only if it failed.
let peerIp = null;
let peerIpWarned = false;

async function fetchPeerIp() {
    if (peerIp) return peerIp;

    const peerId = process.env.NETBIRD_SERVER_PEER;
    if (!peerId || !process.env.NETBIRD_API_URL || !process.env.NETBIRD_TOKEN) {
        if (!peerIpWarned) console.error('Dashboard: missing NETBIRD_SERVER_PEER, NETBIRD_API_URL or NETBIRD_TOKEN, hiding NetBird IP.');
        peerIpWarned = true;
        return null;
    }
    try {
        peerIp = await getPeerIp(peerId);
        console.log(`Dashboard: NetBird IP of peer ${peerId} is ${peerIp}`);
    } catch (err) {
        console.error('Dashboard: fetch NetBird peer IP failed:', err.message);
    }
    return peerIp;
}

const VPN_STATUS_LABEL = {
    running: '🟢 Running',
    restarting: '🟡 Restarting',
    paused: '🟠 Paused',
    created: '🔴 Stopped',
    exited: '🔴 Stopped',
    dead: '🔴 Dead',
};

async function fetchVpnStatus() {
    try {
        const { status, health } = await getContainerStatus();
        if (status === 'running' && health === 'unhealthy') return '🟠 Unhealthy';
        if (status === 'running' && health === 'starting') return '🟡 Starting';
        return VPN_STATUS_LABEL[status] ?? `❔ ${status}`;
    } catch (err) {
        console.error('Dashboard: inspect NetBird container failed:', err.message);
        return '⚠️ Không lấy được trạng thái';
    }
}

async function buildEmbed() {
    const aliases = loadAliases();
    const embed = new EmbedBuilder().setTitle('Server Dashboard').setColor(0x2b8a3e).setTimestamp();

    const [peerIp, vpnStatus] = await Promise.all([fetchPeerIp(), isNetbirdEnabled() ? fetchVpnStatus() : null]);
    const entries = await Promise.all(
        Object.entries(aliases).map(async ([alias, uuid]) => {
            try {
                const inst = await fetchInstance(uuid);
                const status = STATUS_LABEL[inst.status] ?? `❔ ${inst.status}`;
                const info = inst.info ?? {};
                const players = info.currentPlayers >= 0 ? `${info.currentPlayers}/${info.maxPlayers}` : '-';
                const version = info.version || '-';
                const port = getPort(inst) ?? '-';
                const address = peerIp ? `Address: \`${peerIp}:${port}\`` : `Port: ${port}`;
                return {
                    name: alias,
                    value: `${status}\nVersion: ${version}\nPlayers: ${players}\n${address}`,
                    inline: true,
                };
            } catch {
                return { name: alias, value: '⚠️ Không lấy được trạng thái', inline: true };
            }
        })
    );

    const description = [];
    if (vpnStatus) description.push(`**VPN Status:** ${vpnStatus}`);
    if (entries.length === 0) description.push('Chưa có server trong aliases.json.');
    if (description.length > 0) embed.setDescription(description.join('\n'));
    if (entries.length > 0) embed.addFields(entries.slice(0, 25));
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
            new ButtonBuilder().setCustomId(`${PREFIX}:history`).setLabel('History').setStyle(ButtonStyle.Secondary),
            ...buildNetbirdButtons()
        )
    );
    return rows;
}

function buildHistoryEmbed() {
    const history = getHistory();
    const embed = new EmbedBuilder().setTitle('Lịch sử dùng lệnh').setColor(0x1971c2);
    if (history.length === 0) return embed.setDescription('Chưa có lệnh nào từ lúc bot khởi động.');

    const lines = history.map(h => {
        const time = `<t:${Math.floor(h.at / 1000)}:f>`;
        const target = h.alias ? ` \`${h.alias}\`` : '';
        const via = h.source === 'dashboard' ? ' (dashboard)' : '';
        return `${time} <@${h.userId}> **/${h.command}**${target}${via}`;
    });
    return embed.setDescription(lines.join('\n')).setFooter({ text: `${history.length} lệnh gần nhất` });
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
        scheduleReplyDelete(interaction);
        return true;
    }

    const [, action, ...rest] = interaction.customId.split(':');
    const alias = rest.join(':');

    if (action === 'refresh') {
        await interaction.deferUpdate();
        await refreshDashboard?.();
        return true;
    }

    if (action === 'history') {
        await interaction.reply({
            embeds: [buildHistoryEmbed()],
            flags: MessageFlags.Ephemeral,
            allowedMentions: { parse: [] },
        });
        scheduleReplyDelete(interaction);
        return true;
    }

    if (action === 'select' && interaction.isStringSelectMenu()) {
        const selected = interaction.values[0];
        await interaction.reply({
            content: `Server **${selected}**`,
            components: [buildActionRow(selected)],
            flags: MessageFlags.Ephemeral,
        });
        scheduleReplyDelete(interaction);
        return true;
    }

    const command = ACTIONS.some(a => a.command === action) && interaction.client.commands.get(action);
    if (!command || !interaction.isButton()) return false;

    // Reuse the slash command handler by faking the `name` option.
    const proxy = Object.create(interaction, {
        options: { value: { getString: () => alias } },
    });

    recordCommand(interaction, action, alias, 'dashboard');
    try {
        await command.execute(proxy);
    } catch (err) {
        console.error(err);
        const reply = proxy.deferred || proxy.replied ? proxy.editReply.bind(proxy) : proxy.reply.bind(proxy);
        await reply({ content: 'Command failed.', flags: MessageFlags.Ephemeral }).catch(() => {});
    }
    scheduleReplyDelete(proxy);
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
        if (shuttingDown) return;
        let payload;
        try {
            payload = { embeds: [await buildEmbed()], components: buildComponents() };
        } catch (err) {
            console.error('Dashboard build failed:', err);
            return;
        }
        if (shuttingDown) return;

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

    dashboardTargets = targets;
    refreshDashboard = update;
    await update();
    dashboardTimer = setInterval(update, interval);
}

async function markDashboardOffline() {
    shuttingDown = true;
    clearInterval(dashboardTimer);

    // Keep the title so findExistingMessage reuses this message on next start.
    const embed = new EmbedBuilder()
        .setTitle('Server Dashboard')
        .setColor(0x868e96)
        .setDescription('🔴 **PC đang tắt**\nTất cả server và VPN đều offline.')
        .setTimestamp();

    await Promise.all(
        dashboardTargets
            .filter(target => target.message)
            .map(target =>
                target.message.edit({ embeds: [embed], components: [] }).catch(err => {
                    console.error(`Dashboard offline update failed in channel ${target.channel.id}:`, err);
                })
            )
    );
}

module.exports = { startDashboard, handleDashboardInteraction, markDashboardOffline };
