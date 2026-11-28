// utils/history.js
// In-memory only: history starts empty every time the bot starts.
const MAX_ENTRIES = 100;
const entries = [];

function recordCommand(interaction, command, alias, source) {
    entries.push({ at: Date.now(), userId: interaction.user.id, command, alias, source });
    if (entries.length > MAX_ENTRIES) entries.shift();
}

function getHistory(limit = 20) {
    return entries.slice(-limit).reverse();
}

module.exports = { recordCommand, getHistory };
