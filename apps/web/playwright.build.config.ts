import { defineConfig } from '@playwright/test'
import base from './playwright.config'
import { ISOLADOS } from './e2e/grupos'

/**
 * A suíte inteira contra o BUILD de produção (`next build` + o servidor
 * standalone, como no Docker — ver `scripts/servir-build.mjs`), na
 * porta 3100 — o `next dev` da 3000 pode continuar aberto ao lado.
 *
 * É a regressão completa (local, por `pnpm test:e2e:completa`, e no GitHub
 * Actions). Contra o `next dev`, boa parte do tempo era compilar cada tela na
 * primeira visita, e o processo inchava até derrubar a máquina.
 *
 * `apoio/acao-direta.ts` lê os manifestos das actions do build (`.next/server`)
 * quando `E2E_BUILD` está ligado — no dev eles moram em `.next/dev/server`.
 */
process.env.E2E_BUILD = '1'
// A Graph da Meta que o cadastro incorporado chama (lib/whatsapp/cadastro-
// incorporado.ts) é lida do ambiente quando o servidor SOBE — não há como o
// teste apontá-la depois. Porta fixa da Graph falsa de
// e2e/whatsapp-cadastro-incorporado.spec.ts; em produção a variável não existe.
process.env.META_GRAPH_BASE_TESTE ??= 'http://127.0.0.1:3199'
// O Asaas falso (e2e/apoio/asaas-falso.ts, porta fixa) e as credenciais de
// TESTE da cobrança: o servidor as lê ao subir. Em produção não existem assim.
process.env.ASAAS_BASE_URL_TESTE ??= 'http://127.0.0.1:3198'
process.env.ASAAS_API_KEY ??= '$aact_hmlg_e2e-falsa'
process.env.ASAAS_WEBHOOK_TOKEN ??= 'e2e-token-do-webhook-do-asaas-0123456789abcdef'
// A uazapi FALSA (e2e/apoio/uazapi-falsa.ts, porta fixa) no lugar da real, À
// FORÇA — não `??=`: o `.env.local` traz a conta de verdade, e cada instância
// criada nela é cobrada. É o que a conexão gerenciada usa para criar instâncias.
process.env.UAZAPI_BASE_URL = 'http://127.0.0.1:3197'
process.env.UAZAPI_ADMIN_TOKEN = 'e2e-admintoken-da-uazapi-falsa'
// O primeiro admin da plataforma por variável (e2e/plataforma-primeiro-admin.spec.ts).
process.env.PLATAFORMA_ADMIN_EMAIL ??= 'e2e-plataforma-primeiro-admin@bellaris.invalid'
// O cookie da sessão sem Secure: o servidor do build roda em http://127.0.0.1, e
// o Playwright não manda cookie Secure por http nos pedidos feitos fora do
// navegador (page.request, chamarAcao). Produção nunca define isto.
process.env.COOKIE_DE_SESSAO_SEM_SECURE ??= '1'
const PORTA = process.env.E2E_PORTA ?? '3100'
// 127.0.0.1, igual ao HOSTNAME do servidor (ver scripts/servir-build.mjs).
process.env.E2E_BASE_URL = `http://127.0.0.1:${PORTA}`

// A plataforma em DOIS apps, cada um no SEU host (cookie não separa porta, só
// host): o sistema em 127.0.0.2 e o suporte em 127.0.0.3 — loopback no Linux e
// no Windows. Os três servidores recebem os três endereços (CLINICA_URL,
// SISTEMA_URL, SUPORTE_URL), como em produção, e o segredo da conversa entre
// eles (INTERNO_SECRET).
process.env.E2E_SISTEMA_URL = 'http://127.0.0.2:3101'
process.env.E2E_SUPORTE_URL = 'http://127.0.0.3:3102'
process.env.CLINICA_URL = process.env.E2E_BASE_URL
process.env.SISTEMA_URL = process.env.E2E_SISTEMA_URL
process.env.SUPORTE_URL = process.env.E2E_SUPORTE_URL
process.env.INTERNO_SECRET ??= 'e2e-segredo-interno-entre-os-apps-0123456789'

/**
 * `E2E_GRUPO` escolhe a metade da suíte (`e2e/grupos.ts`): `isolados` roda em
 * paralelo (`E2E_WORKERS`, 3 por padrão — um arquivo por worker, os testes de
 * cada arquivo em ordem), `compartilhados` um por vez. Sem grupo, a suíte
 * inteira um por vez, como antes. `scripts/e2e-completa.mjs` roda os dois em
 * sequência.
 */
const grupo = process.env.E2E_GRUPO
const isolados = ISOLADOS.map(f => `**/${f}`)

export default defineConfig({
  ...base,
  // 300 s nas duas metades: juntas, abrir a sessão dos membros pode esperar o
  // limite do Auth (e2e/apoio/sessao.ts), e a espera come o tempo do beforeAll.
  ...(grupo === 'isolados' ? { testMatch: isolados, workers: Number(process.env.E2E_WORKERS ?? 3), timeout: 300_000 } : {}),
  ...(grupo === 'compartilhados' ? { testIgnore: isolados, workers: 1, timeout: 300_000 } : {}),
  // Cada metade na sua pasta: o Playwright limpa a pasta ao começar, e a
  // segunda metade apagaria as evidências das falhas da primeira.
  ...(grupo ? { outputDir: `test-results/${grupo}` } : {}),
  use: { ...base.use, baseURL: process.env.E2E_BASE_URL },
  // No CI as duas metades rodam juntas contra UM servidor de cada app, que o
  // workflow sobe antes (`E2E_SERVIDOR_PRONTO`); cada uma subir o seu
  // disputaria a porta.
  webServer: [
    { app: 'web',     porta: PORTA,  host: '127.0.0.1', url: process.env.E2E_BASE_URL },
    { app: 'sistema', porta: '3101', host: '127.0.0.2', url: `${process.env.E2E_SISTEMA_URL}/api/health` },
    { app: 'suporte', porta: '3102', host: '127.0.0.3', url: `${process.env.E2E_SUPORTE_URL}/api/health` },
  ].map(a => ({
    command: `node scripts/servir-build.mjs ${a.porta} ${a.app} ${a.host}`,
    cwd: __dirname,
    url: a.url,
    reuseExistingServer: !process.env.CI || process.env.E2E_SERVIDOR_PRONTO === '1',
    timeout: 120_000,
  })),
})
