# Bellaris — Extensão de Agenda

Painel lateral (Chrome Side Panel) que fica aberto ao lado de qualquer site. A
atendente/SDR faz login com a conta Bellaris, vê a **agenda do dia** e **cria
agendamentos** — sem trocar de aba, sem depender de nenhum CRM.

## Como funciona

- **Login**: `supabase-js` client-side (anon key), sessão em `chrome.storage.local`.
  O JWT já traz `role/tenant_id/branch_id` em `app_metadata`.
- **Dados**: chama a API REST do Bellaris em `/api/ext/*` com `Authorization: Bearer <token>`.
  Toda a regra de agendamento (conflito de sala/profissional, preço/duração,
  notificações) roda no servidor, reusando o núcleo do app (`lib/appointments/core.ts`).
- Nada é gravado localmente além da sessão; a fonte de verdade é o Bellaris.

## Rodar em desenvolvimento

1. `cp .env.example .env` e preencha:
   - `VITE_SUPABASE_URL` / `VITE_SUPABASE_ANON_KEY` — mesmos `NEXT_PUBLIC_*` do app web.
   - `VITE_API_BASE` — `http://localhost:3000` (app web rodando) ou a URL de produção.
2. Na raiz do monorepo: `pnpm install`.
3. `pnpm --filter @estetica-os/extension dev` (Vite + HMR).
4. No Chrome: `chrome://extensions` → ativar **Modo do desenvolvedor** →
   **Carregar sem compactação** → apontar para `apps/extension/dist`.
5. Clique no ícone da extensão para abrir o painel lateral e faça login com uma
   conta de filial (RECEPTIONIST / BRANCH_ADMIN).

## Build de produção

`pnpm --filter @estetica-os/extension build` → gera `apps/extension/dist`, que pode
ser carregado sem compactação ou empacotado (.zip) para a Chrome Web Store.

## Notas

- As chamadas cruzam origem (extensão → Bellaris); o CORS está liberado para
  `chrome-extension://` em `apps/web/lib/ext/http.ts`. A segurança real é o Bearer JWT.
- Requer conta com filial (`branch_id` no JWT). NETWORK_ADMIN sem filial recebe 400.
