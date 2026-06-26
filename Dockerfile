FROM node:22-slim AS builder
WORKDIR /repo

RUN npm install -g pnpm@11.8.0

# Copy monorepo manifests first (layer cache for deps)
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY packages/db/package.json packages/db/
COPY packages/types/package.json packages/types/
COPY packages/validators/package.json packages/validators/
COPY packages/utils/package.json packages/utils/
COPY apps/web/package.json apps/web/

RUN pnpm install --frozen-lockfile

# Copy source
COPY packages/ packages/
COPY apps/web/ apps/web/

RUN pnpm --filter=web build

FROM node:22-slim AS runner
WORKDIR /app

ENV NODE_ENV=production
ENV PORT=3000
ENV HOSTNAME=0.0.0.0

COPY --from=builder /repo/apps/web/.next/standalone ./
COPY --from=builder /repo/apps/web/.next/static .next/static
COPY --from=builder /repo/apps/web/public public

EXPOSE 3000
CMD ["node", "server.js"]
