FROM node:22-slim
RUN corepack enable && apt-get update && apt-get install -y --no-install-recommends python3 make g++ && rm -rf /var/lib/apt/lists/*
WORKDIR /app
COPY . .
RUN pnpm install --frozen-lockfile
ENV NODE_ENV=production DB_PATH=/data/backpack.db
EXPOSE 8787
CMD ["pnpm", "--filter", "@backpack/server", "start"]
