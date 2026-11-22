// Allow a user if their ID is in ALLOWED_USER_IDS, or they have any role in ALLOWED_ROLE_IDS (optional).
const allowedUsers = new Set(JSON.parse(process.env.ALLOWED_USER_IDS || '[]'));
const allowedRoles = new Set(JSON.parse(process.env.ALLOWED_ROLE_IDS || '[]'));

function isAllowed(interaction) {
    if (allowedUsers.has(interaction.user.id)) return true;
    if (allowedRoles.size === 0) return false;

    const roles = interaction.member?.roles;
    if (!roles) return false; // DM, no member
    // GuildMember (cached) has roles.cache; raw API member has a roles array of IDs
    const roleIds = Array.isArray(roles) ? roles : [...roles.cache.keys()];
    return roleIds.some(id => allowedRoles.has(id));
}

module.exports = { isAllowed };
