// commands/start.js
const { SlashCommandBuilder } = require('discord.js');
const fs = require('node:fs');
const path = require('node:path');
const { MessageFlags } = require('discord.js');
function loadAliases() {
    const p = path.join(__dirname, '..', 'aliases.json');
    if (!fs.existsSync(p)) return {};
    return JSON.parse(fs.readFileSync(p, 'utf8'));
}
const allowed = new Set(JSON.parse(process.env.ALLOWED_USER_IDS ?? '[]'));
module.exports = {
    data: new SlashCommandBuilder()
        .setName('log')
        .setDescription('Trạng thái server')
        .addStringOption(opt =>
            opt.setName('name').setDescription('server name').setRequired(true)
        ),

    async execute(interaction) {
        if (!allowed.has(interaction.user.id)) {
            return interaction.reply({
                content: 'Bạn không có quyền dùng lệnh này.',
                flags: MessageFlags.Ephemeral,
            });
        }
        await interaction.deferReply({ flags: MessageFlags.Ephemeral });

        const alias = interaction.options.getString('name', true);
        const aliases = loadAliases();

        const uuid = aliases[alias];
        if (!uuid) {
            return interaction.editReply(
                `Nhập khùng điên cái gì vậy?`
            );
        }

        const apiKey = process.env.API_KEY;
        const apiBase = process.env.API_BASE || 'http://localhost:23333';
        const daemonId = process.env.DAEMON_ID;
        const size = 1024
        if (!apiKey || !daemonId) {
            return interaction.editReply('Missing env vars: API_KEY or DAEMON_ID.');
        }

        const qs = new URLSearchParams({ apikey: apiKey, uuid, daemonId, size });
        const url = `${apiBase}/api/protected_instance/outputlog?${qs.toString()}`;

        try {
            const res = await fetch(url, { method: 'GET' });
            const payload = await res.json();
            const onlyData = payload.data;
            if (!res.ok) {
                return interaction.editReply(
                    `Xem log server "${alias}" thất bại`
                );
            }
            interaction.editReply("Done")
            return interaction.channel.send(
                `Log server ${alias} :\n "${onlyData}"`
            );
        } catch (e) {
            return interaction.editReply(`Request failed`);
        }
    },
};
