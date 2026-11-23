// utils/netbird.js
const crypto = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');
const { spawn } = require('node:child_process');

const OWNERS_PATH = path.join(__dirname, '..', 'data', 'netbird-owners.json');
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function isValidEmail(email) {
    return EMAIL_RE.test(email) && email.length <= 254;
}

async function netbirdRequest(method, endpoint, body) {
    const base = (process.env.NETBIRD_API_URL || '').replace(/\/+$/, '');
    const res = await fetch(`${base}${endpoint}`, {
        method,
        headers: {
            Accept: 'application/json',
            'Content-Type': 'application/json',
            Authorization: `Token ${process.env.NETBIRD_TOKEN}`,
        },
        body: body ? JSON.stringify(body) : undefined,
    });
    const data = await res.json().catch(() => null);
    if (!res.ok) throw new Error(data?.message || `HTTP ${res.status}`);
    return data;
}

async function createUser(email, name) {
    return netbirdRequest('POST', '/api/users', {
        email,
        name,
        role: 'user',
        auto_groups: JSON.parse(process.env.NETBIRD_AUTO_GROUPS || '[]'),
        is_service_user: false,
    });
}

// Meets NetBird embedded IdP rules: >= 8 chars, uppercase, digit, special char.
function generatePassword(length = 16) {
    const sets = ['ABCDEFGHJKLMNPQRSTUVWXYZ', 'abcdefghijkmnopqrstuvwxyz', '23456789', '!@#$%^&*-_=+?'];
    const all = sets.join('');
    const chars = sets.map(s => s[crypto.randomInt(s.length)]);
    while (chars.length < length) chars.push(all[crypto.randomInt(all.length)]);
    for (let i = chars.length - 1; i > 0; i--) {
        const j = crypto.randomInt(i + 1);
        [chars[i], chars[j]] = [chars[j], chars[i]];
    }
    return chars.join('');
}

// No admin password reset exists in the NetBird REST API, so call the server's admin CLI.
function resetPassword(email, password) {
    const container = process.env.NETBIRD_CONTAINER || 'netbird-server';
    const config = process.env.NETBIRD_CONFIG || '/etc/netbird/config.yaml';
    const args = [
        'exec', '-i', container,
        '/go/bin/netbird-server', '--config', config,
        'admin', 'user', 'change-password', '--email', email, '--password-file', '-',
    ];

    return new Promise((resolve, reject) => {
        const proc = spawn('docker', args, { timeout: 20_000 });
        let output = '';
        proc.stdout.on('data', d => (output += d));
        proc.stderr.on('data', d => (output += d));
        proc.on('error', reject);
        proc.on('close', code => (code === 0 ? resolve() : reject(new Error(output.trim() || `exit ${code}`))));
        proc.stdin.end(`${password}\n`);
    });
}

function loadOwners() {
    if (!fs.existsSync(OWNERS_PATH)) return {};
    return JSON.parse(fs.readFileSync(OWNERS_PATH, 'utf8'));
}

function setOwner(email, discordId) {
    const owners = loadOwners();
    owners[email] = discordId;
    fs.mkdirSync(path.dirname(OWNERS_PATH), { recursive: true });
    fs.writeFileSync(OWNERS_PATH, JSON.stringify(owners, null, 2));
}

function getOwner(email) {
    return loadOwners()[email];
}

module.exports = { isValidEmail, createUser, generatePassword, resetPassword, setOwner, getOwner };
