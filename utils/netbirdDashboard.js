// utils/netbirdDashboard.js
const {
    ActionRowBuilder,
    ButtonBuilder,
    ButtonStyle,
    MessageFlags,
    ModalBuilder,
    TextInputBuilder,
    TextInputStyle,
} = require('discord.js');
const { isAllowed } = require('./auth');
const netbird = require('./netbird');

const PREFIX = 'netbird';
const PROTECTED_ROLES = new Set(['admin', 'owner']);
function isNetbirdEnabled() {
    return Boolean(process.env.NETBIRD_API_URL && process.env.NETBIRD_TOKEN);
}

function buildNetbirdButtons() {
    if (!isNetbirdEnabled()) return [];
    return [
        new ButtonBuilder().setCustomId(`${PREFIX}:register`).setLabel('NetBird Register').setStyle(ButtonStyle.Success),
        new ButtonBuilder().setCustomId(`${PREFIX}:reset`).setLabel('NetBird Reset password').setStyle(ButtonStyle.Danger),
    ];
}

function emailInput() {
    return new TextInputBuilder()
        .setCustomId('email')
        .setLabel('Email')
        .setStyle(TextInputStyle.Short)
        .setMaxLength(254)
        .setRequired(true);
}

function buildRegisterModal() {
    return new ModalBuilder()
        .setCustomId(`${PREFIX}:register-submit`)
        .setTitle('Đăng ký NetBird')
        .addComponents(
            new ActionRowBuilder().addComponents(emailInput()),
            new ActionRowBuilder().addComponents(
                new TextInputBuilder()
                    .setCustomId('name')
                    .setLabel('Tên hiển thị')
                    .setStyle(TextInputStyle.Short)
                    .setMaxLength(100)
                    .setRequired(true)
            )
        );
}

function buildResetModal() {
    return new ModalBuilder()
        .setCustomId(`${PREFIX}:reset-submit`)
        .setTitle('Reset mật khẩu NetBird')
        .addComponents(new ActionRowBuilder().addComponents(emailInput()));
}

function credentialsMessage(email, password) {
    return `Email: \`${email}\`\nMật khẩu: ||\`${password}\`||\nMật khẩu chỉ hiện một lần, hãy lưu lại ngay.`;
}

async function handleRegister(interaction) {
    const email = interaction.fields.getTextInputValue('email').trim().toLowerCase();
    const name = interaction.fields.getTextInputValue('name').trim();
    if (!netbird.isValidEmail(email)) return interaction.editReply('Email không hợp lệ.');

    let user;
    try {
        user = await netbird.createUser(email, name);
    } catch (err) {
        console.error('NetBird register failed:', err);
        return interaction.editReply(`Đăng ký thất bại: ${err.message}`);
    }
    netbird.setOwner(email, interaction.user.id);

    let password = user?.password;
    if (!password) {
        password = netbird.generatePassword();
        try {
            await netbird.resetPassword(email, password);
        } catch (err) {
            console.error('NetBird set initial password failed:', err);
            return interaction.editReply('Đã tạo tài khoản nhưng không đặt được mật khẩu. Hãy dùng Reset password.');
        }
    }
    return interaction.editReply(`Đăng ký thành công.\n${credentialsMessage(email, password)}`);
}

async function handleReset(interaction) {
    const email = interaction.fields.getTextInputValue('email').trim().toLowerCase();
    if (!netbird.isValidEmail(email)) return interaction.editReply('Email không hợp lệ.');

    if (netbird.getOwner(email) !== interaction.user.id && !isAllowed(interaction)) {
        return interaction.editReply('Bạn chỉ có thể reset tài khoản do chính bạn đăng ký qua bot.');
    }

    let user;
    try {
        user = await netbird.findUserByEmail(email);
    } catch (err) {
        console.error('NetBird lookup failed:', err);
        return interaction.editReply('Không kiểm tra được tài khoản, thử lại sau.');
    }
    if (!user) return interaction.editReply('Không tìm thấy tài khoản với email này.');
    if (PROTECTED_ROLES.has(user.role)) {
        return interaction.editReply('Không thể reset mật khẩu tài khoản admin/owner qua bot.');
    }

    const password = netbird.generatePassword();
    try {
        await netbird.resetPassword(email, password);
    } catch (err) {
        console.error('NetBird reset failed:', err);
        return interaction.editReply('Reset mật khẩu thất bại. Kiểm tra lại email hoặc liên hệ admin.');
    }
    return interaction.editReply(`Reset thành công.\n${credentialsMessage(email, password)}`);
}

async function handleNetbirdInteraction(interaction) {
    if (!interaction.customId?.startsWith(`${PREFIX}:`)) return false;
    const action = interaction.customId.slice(PREFIX.length + 1);

    if (interaction.isButton()) {
        if (action === 'register') await interaction.showModal(buildRegisterModal());
        else if (action === 'reset') await interaction.showModal(buildResetModal());
        return true;
    }

    if (interaction.isModalSubmit()) {
        await interaction.deferReply({ flags: MessageFlags.Ephemeral });
        try {
            if (action === 'register-submit') await handleRegister(interaction);
            else if (action === 'reset-submit') await handleReset(interaction);
        } catch (err) {
            console.error('NetBird interaction failed:', err);
            await interaction.editReply('Có lỗi xảy ra, thử lại sau.').catch(() => {});
        }
        return true;
    }
    return false;
}

module.exports = { buildNetbirdButtons, handleNetbirdInteraction };
