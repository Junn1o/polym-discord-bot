FROM oven/bun:1

# Thư mục làm việc
WORKDIR /app

# Copy file package + lockfile trước để cache install
COPY package.json bun.lock ./

# Cài dependency (production only, đúng theo lockfile)
RUN bun install --frozen-lockfile --production

# Copy source (.env, node_modules, .git bị loại bởi .dockerignore)
COPY . .

# Docker CLI để reset mật khẩu NetBird qua `docker exec` (cần mount docker.sock)
COPY --from=docker:27-cli /usr/local/bin/docker /usr/local/bin/docker

# Thư mục dữ liệu (lưu chủ sở hữu tài khoản NetBird)
RUN mkdir -p /app/data && chown bun:bun /app/data

# Biến môi trường (có thể override bằng .env / compose)
ENV NODE_ENV=production

# Chạy bằng user không phải root
USER bun

# Lệnh chạy bot
CMD ["bun", "index.js"]
