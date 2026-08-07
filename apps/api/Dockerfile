# Node 22, not 20: @supabase/supabase-js >= 2.112 reaches for a native
# WebSocket at createClient() time and throws "Node.js detected but native
# WebSocket not found" on Node 20, so the API crash-loops on boot.
FROM node:22-alpine AS builder

# Pinned deliberately. `corepack enable` resolves pnpm's `latest` dist-tag,
# which is now pnpm 11 — that requires the `node:sqlite` builtin and crashes on
# Node 20. This version also matches pnpm-lock.yaml's lockfileVersion 9.0.
ARG PNPM_VERSION=9.15.9

WORKDIR /app

RUN npm install -g "pnpm@${PNPM_VERSION}"

COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY packages/contracts/package.json ./packages/contracts/
COPY apps/api/package.json ./apps/api/

COPY packages/contracts ./packages/contracts
COPY apps/api ./apps/api

RUN pnpm install --frozen-lockfile
RUN pnpm --filter @app-relay/contracts build
RUN pnpm --filter api build

FROM node:22-alpine AS runner

WORKDIR /app
ENV NODE_ENV=production
ENV PORT=3000

COPY --from=builder /app ./

EXPOSE 3000

CMD ["node", "apps/api/dist/server.js"]
