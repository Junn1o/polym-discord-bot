# utility-bot
Description:
This mod is usage for mcsmanager with start, stop, restart, forcestop and log function. Please refer to: https://docs.mcsmanager.com/apis/get_apikey.html for more details!

To install dependencies:

```bash
bun install
```

To run:

```bash
bun deploy-commands
bun index.js
```

or using with docker:
```
docker compose up -d --build
docker compose run --rm bot bun deploy-commands.js
```
This project was created using `bun init` in bun v1.3.4. [Bun](https://bun.com) is a fast all-in-one JavaScript runtime.

## NetBird dashboard

Nút **NetBird Register** / **NetBird Reset password** nằm chung trong tin nhắn Server Dashboard (kênh `DASHBOARD_CHANNEL_IDS`), chỉ hiện khi đã đặt `NETBIRD_API_URL` và `NETBIRD_TOKEN`.

- Register: `POST /api/users` bằng Personal Access Token (`NETBIRD_TOKEN`), mật khẩu gửi riêng (ephemeral) cho người bấm.
- Reset password: REST API của NetBird không hỗ trợ admin reset mật khẩu, nên bot chạy
  `docker exec <NETBIRD_CONTAINER> netbird-server admin user change-password`. Bot cần chạy cùng host với NetBird
  và mount `/var/run/docker.sock` (đã cấu hình trong `docker-compose.yml`, `DOCKER_GID` = GID của docker.sock).
- Người dùng chỉ reset được email do chính họ đăng ký qua bot; người trong `ALLOWED_USER_IDS`/`ALLOWED_ROLE_IDS` reset được mọi email.
