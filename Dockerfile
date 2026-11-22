FROM oven/bun:1

# Thư mục làm việc
WORKDIR /app

# Copy file package + lockfile trước để cache install
COPY package.json bun.lock ./

# Cài dependency (production only, đúng theo lockfile)
RUN bun install --frozen-lockfile --production

# Copy source (.env, node_modules, .git bị loại bởi .dockerignore)
COPY . .

# Biến môi trường (có thể override bằng .env / compose)
ENV NODE_ENV=production

# Chạy bằng user không phải root
USER bun

# Lệnh chạy bot
CMD ["bun", "index.js"]
