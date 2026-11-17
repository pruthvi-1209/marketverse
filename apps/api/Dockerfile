# syntax=docker/dockerfile:1

# Build stage: install workspaces, build contracts and API, keep production deps.
FROM node:22-bookworm-slim AS build
WORKDIR /app
ENV CI=1

COPY package.json yarn.lock .yarnrc.yml ./
COPY apps/api/package.json apps/api/package.json
COPY packages/contracts/package.json packages/contracts/package.json
RUN corepack enable && yarn install --immutable

COPY tsconfig.base.json ./
COPY packages/contracts ./packages/contracts
COPY apps/api ./apps/api

RUN yarn workspace @marketverse/contracts build \
 && yarn workspace @marketverse/api build \
 && mkdir -p apps/api/dist/database/migrations \
 && cp apps/api/src/database/migrations/*.sql apps/api/dist/database/migrations/ \
 && yarn workspaces focus @marketverse/api --production

# Runtime stage.
FROM node:22-bookworm-slim AS runtime
WORKDIR /app
ENV NODE_ENV=production

COPY --from=build --chown=node:node /app/node_modules ./node_modules
COPY --from=build --chown=node:node /app/packages/contracts/package.json ./packages/contracts/package.json
COPY --from=build --chown=node:node /app/packages/contracts/dist ./packages/contracts/dist
COPY --from=build --chown=node:node /app/apps/api/package.json ./apps/api/package.json
COPY --from=build --chown=node:node /app/apps/api/dist ./apps/api/dist

USER node
EXPOSE 4000
CMD ["node", "apps/api/dist/server.js"]
