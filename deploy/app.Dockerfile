FROM node:24-alpine AS build
WORKDIR /app
RUN npm install --global pnpm@10.33.0

COPY package.json pnpm-lock.yaml pnpm-workspace.yaml tsconfig.base.json ./
COPY apps/server/package.json apps/server/
COPY apps/gateway/package.json apps/gateway/
COPY apps/web/package.json apps/web/
COPY packages/contracts/package.json packages/contracts/
RUN pnpm install --frozen-lockfile

COPY . .
RUN pnpm --filter @offee/web build

# Reinstall with only the runtime dependencies of the server and the gateway, so the image
# carries no build tooling.
RUN rm -rf node_modules apps/*/node_modules packages/*/node_modules \
  && pnpm install --prod --frozen-lockfile --filter @offee/server... --filter @offee/gateway...

FROM node:24-alpine
WORKDIR /app
ENV NODE_ENV=production \
    OFFEE_DATA_DIR=/data \
    OFFEE_CONFIG_DIR=/app/config \
    OFFEE_WEB_DIST=/app/apps/web/dist \
    OFFEE_GATEWAY_DESTINATIONS=/app/config/gateway-destinations.json

COPY --from=build /app/package.json ./
COPY --from=build /app/node_modules ./node_modules
COPY --from=build /app/config ./config
COPY --from=build /app/packages/contracts ./packages/contracts
COPY --from=build /app/apps/server ./apps/server
COPY --from=build /app/apps/gateway ./apps/gateway
COPY --from=build /app/apps/web/dist ./apps/web/dist

# 1000 is the image's `node` user.
RUN mkdir -p /data /run/offee && chown 1000:1000 /data /run/offee
USER 1000:1000
EXPOSE 8470
CMD ["node", "--disable-warning=ExperimentalWarning", "apps/server/src/main.ts"]
