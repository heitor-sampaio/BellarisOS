FROM node:22-slim AS builder
WORKDIR /repo

# TZ antes do apt-get e DEBIAN_FRONTEND=noninteractive: o tzdata pergunta a
# região na instalação e trava o build sem essas duas variáveis.
ENV DEBIAN_FRONTEND=noninteractive
ENV TZ=America/Sao_Paulo

RUN apt-get update -y && apt-get install -y openssl tzdata && rm -rf /var/lib/apt/lists/*

RUN npm install -g pnpm@11.8.0

COPY . .

RUN pnpm install --frozen-lockfile

RUN pnpm --filter=web build

FROM node:22-slim AS runner
WORKDIR /app

# tzdata + TZ: sem isso o container roda em UTC e toda janela de "hoje" / "este
# mês" dos indicadores começa às 21h do dia anterior em horário de Brasília.
ENV DEBIAN_FRONTEND=noninteractive
ENV TZ=America/Sao_Paulo

RUN apt-get update -y && apt-get install -y openssl tzdata && rm -rf /var/lib/apt/lists/*

ENV NODE_ENV=production
ENV PORT=3000
ENV HOSTNAME=0.0.0.0

COPY --from=builder /repo/apps/web/.next/standalone ./
COPY --from=builder /repo/apps/web/.next/static ./apps/web/.next/static
COPY --from=builder /repo/apps/web/public ./apps/web/public

# Disparador dos jobs agendados. Vive na mesma imagem porque o serviço de cron
# do Railway compartilha este Dockerfile: o railway.toml da raiz fixa o
# dockerfilePath, e config-as-code por serviço foi depreciada pelo Railway.
# O serviço de cron sobrescreve o CMD com `node /app/cron.mjs`.
COPY scripts/cron.mjs /app/cron.mjs

EXPOSE 3000
CMD ["node", "apps/web/server.js"]
