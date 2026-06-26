FROM node:22-slim AS builder
WORKDIR /repo

RUN apt-get update -y && apt-get install -y openssl && rm -rf /var/lib/apt/lists/*

RUN npm install -g pnpm@11.8.0

COPY . .

RUN pnpm install --frozen-lockfile

RUN pnpm --filter=web build

FROM node:22-slim AS runner
WORKDIR /app

RUN apt-get update -y && apt-get install -y openssl && rm -rf /var/lib/apt/lists/*

ENV NODE_ENV=production
ENV PORT=3000
ENV HOSTNAME=0.0.0.0

COPY --from=builder /repo/apps/web/.next/standalone ./
COPY --from=builder /repo/apps/web/.next/static .next/static
COPY --from=builder /repo/apps/web/public public

EXPOSE 3000
CMD ["node", "server.js"]
