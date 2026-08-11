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

# Manifests first, source second: editing a .ts file then rebuilds from the
# install layer instead of re-resolving the whole dependency graph.
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY packages/contracts/package.json ./packages/contracts/
COPY apps/api/package.json ./apps/api/

RUN pnpm install --frozen-lockfile

COPY packages/contracts ./packages/contracts
COPY apps/api ./apps/api

RUN pnpm --filter @app-relay/contracts build && pnpm --filter api build

# Drop devDependencies (typescript, tsx, @types/*) from the tree the runner will
# copy. Re-running install with --prod prunes in place and leaves dist/ alone.
#
# Not `pnpm deploy`: in pnpm 9 it needs node-linker=hoisted to produce a working
# tree, and this project uses the default symlinked store.
RUN pnpm install --frozen-lockfile --prod --ignore-scripts

FROM node:22-alpine AS runner

WORKDIR /app
ENV NODE_ENV=production
ENV PORT=3000

# Non-root. /data/artifacts is created and chowned HERE on purpose: Docker seeds
# a new named volume with the ownership of the image path it mounts over, so the
# api-artifacts volume comes up writable by this user on a clean deploy.
#
# Mounting a volume that already exists from a root-era deployment does NOT get
# re-chowned — artifact writes would fail with EACCES. Fix on such a host with:
#   docker compose run --rm --user root api chown -R 10001:10001 /data/artifacts
RUN addgroup -S -g 10001 app \
    && adduser -S -u 10001 -G app app \
    && mkdir -p /data/artifacts \
    && chown -R app:app /data

# Only what the process needs at runtime: the pruned module tree, the two
# manifests Node resolves through, and the compiled output. No src/, no
# tsconfig, no pnpm binary.
COPY --from=builder --chown=app:app /app/node_modules ./node_modules
COPY --from=builder --chown=app:app /app/package.json ./package.json
COPY --from=builder --chown=app:app /app/packages/contracts/package.json ./packages/contracts/package.json
COPY --from=builder --chown=app:app /app/packages/contracts/node_modules ./packages/contracts/node_modules
COPY --from=builder --chown=app:app /app/packages/contracts/dist ./packages/contracts/dist
COPY --from=builder --chown=app:app /app/apps/api/package.json ./apps/api/package.json
COPY --from=builder --chown=app:app /app/apps/api/node_modules ./apps/api/node_modules
COPY --from=builder --chown=app:app /app/apps/api/dist ./apps/api/dist

USER app

EXPOSE 3000

CMD ["node", "apps/api/dist/server.js"]
