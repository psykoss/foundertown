# Build from the repo root: docker build -f server/Dockerfile -t founder-town-server .
FROM node:22-slim
RUN corepack enable
WORKDIR /app
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY shared ./shared
COPY server ./server
# The room validates movement against the same map the client renders.
COPY client/public/assets/maps/town.tmj ./client/public/assets/maps/town.tmj
RUN pnpm install --frozen-lockfile --filter @ft/server...
ENV NODE_ENV=production PORT=2567
EXPOSE 2567
CMD ["pnpm", "--filter", "@ft/server", "start"]
