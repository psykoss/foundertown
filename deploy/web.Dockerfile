# Website (thefoundertown.com): landing page at /, game client at /app/ + its routes. Build from the repo root:
#   docker build -f deploy/web.Dockerfile --build-arg VITE_SERVER_URL=https://api.thefoundertown.com ... .
# The VITE_ values are baked into the bundles at build time (Railway passes service variables as build args).
FROM node:22-slim AS build
RUN corepack enable
WORKDIR /app
COPY . .
ARG VITE_SUPABASE_URL
ARG VITE_SUPABASE_PUBLISHABLE_KEY
ARG VITE_SERVER_URL
ARG VITE_ICE_SERVERS
RUN pnpm install --frozen-lockfile --filter client... --filter landing...
RUN pnpm --filter client build && pnpm --filter landing build

FROM caddy:2-alpine
COPY deploy/Caddyfile /etc/caddy/Caddyfile
COPY --from=build /app/landing/dist /srv
COPY --from=build /app/client/dist /srv/app
CMD ["caddy", "run", "--config", "/etc/caddy/Caddyfile", "--adapter", "caddyfile"]
