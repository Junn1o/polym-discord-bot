// commands/start.js
const { SlashCommandBuilder } = require('discord.js');

const { loadAliases, autocompleteAliases } = require('../utils/aliases');
const { MessageFlags } = require('discord.js');
const { isAllowed } = require('../utils/auth');
module.exports = {
    autocomplete: autocompleteAliases,
    data: new SlashCommandBuilder()
        .setName('forcestop')
        .setDescription('Dừng server biện pháp mạnh')
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

        const alias = interaction.options.getString('name', true); // string option access [web:37]
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

        const qs = new URLSearchParams({ apikey: apiKey, uuid, daemonId});
        const url = `${apiBase}/api/protected_instance/kill?${qs.toString()}`;

        try {
            const res = await fetch(url, { method: 'GET' });

            if (!res.ok) {
                return interaction.editReply(
                    `Có lỗi khi dừng server"${alias}"`
                );
            }

            return interaction.editReply(
                `Đã dừng server "${alias}"`
            );
        } catch (e) {
            return interaction.editReply(`Request failed`);
        }
    },
};
