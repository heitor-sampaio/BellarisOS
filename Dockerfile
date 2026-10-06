# UMA imagem para os três apps (2026-10-06): a clínica (web), o sistema e o
# suporte. O railway.toml da raiz fixa este Dockerfile para todos os serviços
# (config-as-code por serviço foi depreciada pelo Railway), então cada serviço
# escolhe o seu app pela variável BELLARIS_APP — o Railway a passa como build
# arg por estar declarada aqui. Sem ela, a clínica, como sempre foi.
ARG BELLARIS_APP=web

FROM node:22-slim AS builder
ARG BELLARIS_APP
WORKDIR /repo

# TZ antes do apt-get e DEBIAN_FRONTEND=noninteractive: o tzdata pergunta a
# região na instalação e trava o build sem essas duas variáveis.
ENV DEBIAN_FRONTEND=noninteractive
ENV TZ=America/Sao_Paulo

RUN apt-get update -y && apt-get install -y openssl tzdata && rm -rf /var/lib/apt/lists/*

RUN npm install -g pnpm@11.8.0

COPY . .

RUN pnpm install --frozen-lockfile

RUN pnpm --filter=${BELLARIS_APP} build

FROM node:22-slim AS runner
ARG BELLARIS_APP
WORKDIR /app

# tzdata + TZ: sem isso o container roda em UTC e toda janela de "hoje" / "este
# mês" dos indicadores começa às 21h do dia anterior em horário de Brasília.
ENV DEBIAN_FRONTEND=noninteractive
ENV TZ=America/Sao_Paulo

RUN apt-get update -y && apt-get install -y openssl tzdata && rm -rf /var/lib/apt/lists/*

ENV NODE_ENV=production
ENV PORT=3000
ENV HOSTNAME=0.0.0.0

ENV BELLARIS_APP=${BELLARIS_APP}

COPY --from=builder /repo/apps/${BELLARIS_APP}/.next/standalone ./
COPY --from=builder /repo/apps/${BELLARIS_APP}/.next/static ./apps/${BELLARIS_APP}/.next/static
# Os três apps têm public/ (no sistema e no suporte, vazio: .gitkeep).
COPY --from=builder /repo/apps/${BELLARIS_APP}/public ./apps/${BELLARIS_APP}/public

# Disparador dos jobs agendados. Vive na mesma imagem porque o serviço de cron
# do Railway compartilha este Dockerfile: o railway.toml da raiz fixa o
# dockerfilePath, e config-as-code por serviço foi depreciada pelo Railway.
# O serviço de cron sobrescreve o CMD com `node /app/cron.mjs`.
COPY scripts/cron.mjs /app/cron.mjs

EXPOSE 3000
# Forma de shell (a variável do app é resolvida ao subir), com exec: o node
# vira o processo 1 e recebe o SIGTERM do Railway.
CMD exec node apps/${BELLARIS_APP}/server.js
