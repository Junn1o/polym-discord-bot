// utils/aliases.js
const fs = require('node:fs');
const path = require('node:path');
const { isAllowed } = require('./auth');

function loadAliases() {
    const p = path.join(__dirname, '..', 'aliases.json');
    if (!fs.existsSync(p)) return {};
    return JSON.parse(fs.readFileSync(p, 'utf8'));
}

// Suggest server aliases for the `name` option, filtered by what the user typed.
// Unauthorized users get no suggestions so server names are not leaked.
async function autocompleteAliases(interaction) {
    if (!isAllowed(interaction)) return interaction.respond([]);

    const typed = interaction.options.getFocused().toLowerCase();
    const choices = Object.keys(loadAliases())
        .filter(name => name.toLowerCase().includes(typed))
        .slice(0, 25) // Discord limit
        .map(name => ({ name, value: name }));

    return interaction.respond(choices);
}

module.exports = { loadAliases, autocompleteAliases };
