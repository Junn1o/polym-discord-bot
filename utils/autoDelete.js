// utils/autoDelete.js
// Interaction tokens expire after 15 minutes, after which the reply can no longer be deleted.
const MAX_DELAY_MS = 14 * 60_000;

function scheduleReplyDelete(interaction) {
    const raw = process.env.EPHEMERAL_DELETE_MS;
    const delay = Math.min(raw === undefined || raw === '' ? 30_000 : Number(raw), MAX_DELAY_MS);
    if (!(delay > 0) || !(interaction.deferred || interaction.replied)) return;
    setTimeout(() => interaction.deleteReply().catch(() => {}), delay).unref?.();
}

module.exports = { scheduleReplyDelete };
