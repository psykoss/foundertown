# Build from the repo root: docker build -f server/Dockerfile -t founder-town-server .
FROM node:22-slim
RUN corepack enable
WORKDIR /app
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY shared ./shared
COPY server ./server
# The rooms validate movement against the same maps the client renders (town.tmj, office.tmj).
COPY client/public/assets/maps ./client/public/assets/maps
RUN pnpm install --frozen-lockfile --filter @ft/server...
ENV NODE_ENV=production PORT=2567
EXPOSE 2567
CMD ["pnpm", "--filter", "@ft/server", "start"]
