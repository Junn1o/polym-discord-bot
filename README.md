# utility-bot

A Discord bot for managing Minecraft servers on [MCSManager](https://docs.mcsmanager.com/) and self-service accounts on a self-hosted [NetBird](https://docs.netbird.io/) instance.

## Features

- **Slash commands**: `/start`, `/stop`, `/restart`, `/forcestop`, `/status` for MCSManager instances.
- **Server Dashboard**: an auto-refreshing message showing, for each server, its status, Minecraft version, player count and NetBird address (`IP:port`), with buttons to control the servers.
- **NetBird accounts**: **NetBird Register** and **NetBird Reset password** buttons on the same dashboard.

See https://docs.mcsmanager.com/apis/get_apikey.html for how to get an MCSManager API key.

## Installation

```bash
bun install
```

## Running

```bash
bun deploy-commands.js
bun index.js
```

Or with Docker:

```bash
docker compose up -d --build
docker compose run --rm bot bun deploy-commands.js
```

## Configuration

Copy `env.example` to `.env` and fill in the values. Array values are JSON strings, e.g. `["123", "456"]`.

| Variable | Description |
| --- | --- |
| `DISCORD_TOKEN` | Discord bot token |
| `CLIENT_ID` | Discord application (client) ID |
| `GUILD_IDS` | Discord server IDs to register commands in |
| `API_KEY` | MCSManager API key |
| `API_BASE` | MCSManager panel URL |
| `DAEMON_ID` | MCSManager daemon ID |
| `ALLOWED_USER_IDS` | Discord user IDs allowed to control servers (bot admins) |
| `ALLOWED_ROLE_IDS` | Discord role IDs allowed to control servers (bot admins) |
| `DASHBOARD_CHANNEL_IDS` | Channels to post the Server Dashboard in (one per guild) |
| `DASHBOARD_INTERVAL_MS` | Dashboard refresh interval, default `60000` |
| `NETBIRD_API_URL` | NetBird management URL, e.g. `https://netbird.example.com` |
| `NETBIRD_TOKEN` | NetBird Personal Access Token (of an admin user) |
| `NETBIRD_AUTO_GROUPS` | NetBird group IDs auto-assigned to new users, may be `[]` |
| `NETBIRD_SERVER_PEER` | NetBird peer ID of the host running the MCSManager daemon |
| `NETBIRD_CONTAINER` | NetBird server container name, default `netbird-server` |
| `NETBIRD_CONFIG` | Config path inside that container, default `/etc/netbird/config.yaml` |
| `DOCKER_GID` | GID of `/var/run/docker.sock` on the host, default `999` |

Server aliases are read from `aliases.json` (see `aliases.json.example`).

## Server Dashboard

The dashboard is posted in each channel from `DASHBOARD_CHANNEL_IDS` and refreshed every `DASHBOARD_INTERVAL_MS`. It only starts when `API_KEY` and `DAEMON_ID` are set.

- **Version** comes from the MCSManager instance info (`-` when the server is offline).
- **Port** is the first TCP port in `allocatedPorts` (Docker instances), falling back to `pingConfig.port`.
- **NetBird IP** is fetched once at startup via `GET /api/peers/{NETBIRD_SERVER_PEER}` and then cached, since a peer's NetBird IP is static. If the first request fails, it is retried on the next refresh. Restart the bot if the peer's IP changes. Without it, only the port is shown.
- Server control buttons are restricted to bot admins (`ALLOWED_USER_IDS` / `ALLOWED_ROLE_IDS`).

## NetBird accounts

The **NetBird Register** and **NetBird Reset password** buttons appear on the Server Dashboard when `NETBIRD_API_URL` and `NETBIRD_TOKEN` are set. They can be used by anyone in the server. Passwords are sent only to the user who clicked (ephemeral message) and are shown once.

- **Register** creates a user with `POST /api/users`. NetBird generates the password (embedded IdP). If none is returned, the bot generates one and sets it through the admin CLI.
- **Reset password**: the NetBird REST API cannot reset another user's password, so the bot runs
  `docker exec <NETBIRD_CONTAINER> netbird-server admin user change-password` with a newly generated password.
- Users can only reset accounts they registered through the bot (tracked in `data/netbird-owners.json`). Bot admins can reset any account.
- Accounts with the NetBird role `admin` or `owner` can never be reset through the bot, not even by bot admins.

### Requirements for password reset

- The bot must run on the same host as the NetBird server container.
- `docker-compose.yml` mounts `/var/run/docker.sock` and adds the bot to the `DOCKER_GID` group. This gives the bot root-equivalent access to the host, so keep the bot token and host secure.

---

This project was created using `bun init` in bun v1.3.4. [Bun](https://bun.com) is a fast all-in-one JavaScript runtime.
