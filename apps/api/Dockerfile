FROM node:20-alpine AS builder

WORKDIR /app

RUN corepack enable

COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY packages/contracts/package.json ./packages/contracts/
COPY apps/api/package.json ./apps/api/

COPY packages/contracts ./packages/contracts
COPY apps/api ./apps/api

RUN pnpm install --frozen-lockfile
RUN pnpm --filter @app-relay/contracts build
RUN pnpm --filter api build

FROM node:20-alpine AS runner

WORKDIR /app
ENV NODE_ENV=production
ENV PORT=3000

COPY --from=builder /app ./

EXPOSE 3000

CMD ["node", "apps/api/dist/server.js"]
