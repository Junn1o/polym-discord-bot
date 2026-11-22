// commands/restart.js
const { SlashCommandBuilder } = require('discord.js');

const { loadAliases, autocompleteAliases } = require('../utils/aliases');
const { MessageFlags } = require('discord.js');
const { isAllowed } = require('../utils/auth');
module.exports = {
    autocomplete: autocompleteAliases,
    data: new SlashCommandBuilder()
        .setName('restart')
        .setDescription('Khởi động lại server')
        .addStringOption(opt =>
            opt.setName('name').setDescription('server name').setRequired(true).setAutocomplete(true)
        ),

    async execute(interaction) {
        if (!isAllowed(interaction)) {
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

        if (!apiKey || !daemonId) {
            return interaction.editReply('Missing env vars: API_KEY or DAEMON_ID.');
        }

        const qs = new URLSearchParams({ apikey: apiKey, uuid, daemonId });
        const url = `${apiBase}/api/protected_instance/restart?${qs.toString()}`;

        try {
            const res = await fetch(url, { method: 'GET' });
            if (res.status == 500) {
                return interaction.editReply(
                    `Server "${alias}" chưa mở hoặc lỗi, thử /start ${alias} đi`
                );
            }
            if (!res.ok) {
                return interaction.editReply(
                    `Khởi động lại server "${alias}" thất bại`
                );
            }

            return interaction.editReply(
                `Đang khởi động lại server "${alias}"`
            );
        } catch (e) {
            return interaction.editReply(`Request failed`);
        }
    },
};
