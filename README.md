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
