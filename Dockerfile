FROM node:24-slim AS base
WORKDIR /app

# Install dependencies
COPY package.json package-lock.json turbo.json tsconfig.base.json ./
COPY packages/core/package.json packages/core/
COPY packages/server/package.json packages/server/
RUN npm ci --ignore-scripts && \
    npm rebuild better-sqlite3

# Build
COPY packages/core/ packages/core/
COPY packages/server/ packages/server/
COPY settings/ settings/
RUN npx turbo build --filter=@airflux/core --filter=@airflux/server

# Production
FROM node:24-slim
WORKDIR /app
ENV NODE_ENV=production

# Install Claude CLI + Codex CLI (Linux)
RUN npm install -g @anthropic-ai/claude-code @openai/codex --ignore-scripts 2>/dev/null || true
# Symlink claude to expected path used by claude-cli-provider
RUN mkdir -p /root/.local/bin && \
    ln -sf $(which claude 2>/dev/null || echo /usr/local/bin/claude) /root/.local/bin/claude 2>/dev/null || true

COPY --from=base /app/node_modules ./node_modules
COPY --from=base /app/packages/core/dist ./packages/core/dist
COPY --from=base /app/packages/core/package.json ./packages/core/
COPY --from=base /app/packages/server/dist ./packages/server/dist
COPY --from=base /app/packages/server/package.json ./packages/server/
COPY --from=base /app/settings ./settings
COPY --from=base /app/package.json ./

RUN mkdir -p data

# Entrypoint: codex auto-auth with OPENAI_API_KEY if set, then start server
COPY scripts/docker-entrypoint.sh /usr/local/bin/docker-entrypoint.sh
RUN chmod +x /usr/local/bin/docker-entrypoint.sh

EXPOSE 3000
CMD ["/usr/local/bin/docker-entrypoint.sh"]
