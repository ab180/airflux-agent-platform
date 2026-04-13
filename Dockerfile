FROM node:24-slim AS base
WORKDIR /app

# Install dependencies
COPY package.json package-lock.json turbo.json tsconfig.base.json ./
COPY packages/core/package.json packages/core/
COPY packages/server/package.json packages/server/
RUN npm ci --ignore-scripts

# Build
COPY packages/core/ packages/core/
COPY packages/server/ packages/server/
COPY settings/ settings/
RUN npx turbo build --filter=@airflux/core --filter=@airflux/server

# Production
FROM node:24-slim
WORKDIR /app
ENV NODE_ENV=production
COPY --from=base /app/node_modules ./node_modules
COPY --from=base /app/packages/core/dist ./packages/core/dist
COPY --from=base /app/packages/core/package.json ./packages/core/
COPY --from=base /app/packages/server/dist ./packages/server/dist
COPY --from=base /app/packages/server/package.json ./packages/server/
COPY --from=base /app/settings ./settings
COPY --from=base /app/package.json ./

RUN mkdir -p data
EXPOSE 3000
CMD ["node", "packages/server/dist/index.js"]
