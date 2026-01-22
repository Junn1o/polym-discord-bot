FROM oven/bun:latest

# Thư mục làm việc
WORKDIR /app

# Copy file package trước để cache install
COPY package*.json ./

# Cài dependency
RUN bun ci --only=production

# Copy source
COPY . .

# Biến môi trường (có thể override bằng .env / compose)
ENV NODE_ENV=production

# Lệnh chạy bot
CMD ["bun", "index.js"]
