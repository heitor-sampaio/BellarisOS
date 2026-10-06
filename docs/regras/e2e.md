# E2E: a completa em duas metades e o apoio

> Regras do BellarisOS para esta área, tiradas do `CLAUDE.md` em 2026-10-06
> para ele caber no contexto (o índice está no §9 de lá). As regras gerais —
> rede e RLS, permissões, `gravar`/`ler`/`tentar`, portais — continuam no
> `CLAUDE.md` e valem aqui. Os números de seção são os de sempre.

## 15. E2E — a completa e o apoio

Os comandos e o "Qual E2E rodar" (só o que é novo em cada etapa; a completa,
só quando o Heitor pede) continuam no §15 do `CLAUDE.md`.

- **A completa roda em duas metades** (`e2e/grupos.ts`, 2026-09-30): os
  ISOLADOS em paralelo (3 workers) e os COMPARTILHADOS, um por vez — no CI
  as duas JUNTAS, contra um servidor só (`E2E_SERVIDOR_PRONTO`); no
  `test:e2e:completa` local, em sequência (a máquina não aguenta quatro
  navegadores e o servidor). Isolado é o spec que cria a própria rede
  (`criarOutraRede`), não lê a rede real (`tenantId()`, `filiaisAtivas()`…),
  não usa a sessão padrão (o `page` do fixture é o admin da rede real) e não
  chama cron — `tests/e2e-grupos.test.ts` confere a lista. Juntas é seguro
  porque a varredura de sobras só leva `[e2e]` com mais de uma hora; e cada
  metade grava a sessão do admin no seu arquivo (`e2e/.auth/admin-<grupo>.json`).
  Spec que precisa da sessão do admin lê `test.info().project.use.storageState`,
  nunca um caminho fixo. ⚠️ As duas metades emitem o link do MESMO admin juntas:
  o link novo invalida o da outra, e o `global-setup` tenta de novo (era o que
  derrubava a metade inteira antes do primeiro teste).
  Spec novo com rede própria entra na lista; migrar um compartilhado
  para rede própria é o que encurta a suíte.
- Contra o build, `chamarAcao` lê os manifestos de `.next/server`
  (`E2E_BUILD`, ligado por `playwright.build.config.ts`).

**Os três apps no E2E (2026-10-06).** Contra o build sobem TRÊS servidores,
cada um no seu host — cookie não separa porta, só host, e a sessão da clínica
e a da plataforma não podem se encostar:

| App | Endereço | Variável no teste |
|---|---|---|
| clínica (`apps/web`) | `http://127.0.0.1:3100` | `E2E_BASE_URL` |
| sistema | `http://127.0.0.2:3101` | `E2E_SISTEMA_URL` |
| suporte | `http://127.0.0.3:3102` | `E2E_SUPORTE_URL` |

- `scripts/servir-build.mjs <porta> <app> <host>`; o `playwright.build.config.ts`
  sobe os três (e passa `CLINICA_URL`, `SISTEMA_URL`, `SUPORTE_URL`,
  `INTERNO_SECRET`); o workflow e o `test:e2e:completa` buildam os três.
- **Specs da plataforma só rodam contra o build** (`plataformaNoAr()`, em
  `e2e/apoio/plataforma.ts`); no `next dev` se pulam.
- `criarAtendente` grava a sessão no host da CASA (ADMIN → sistema,
  SUPORTE → suporte), montando os cookies com o próprio `@supabase/ssr`
  (`gravarSessaoNoHost`, sem endpoint). `estadoNo(host)` abre uma SEGUNDA
  sessão para o outro host — a mesma nos dois giraria o refresh token num e
  derrubaria o outro.
- `chamarAcao` aceita rota absoluta: no host do sistema ou do suporte, lê os
  manifestos de `apps/<app>/.next`.
- O "entrar como" abre a conta numa ABA NOVA (`entrarComo` devolve `page`, a
  clínica, e `painel`, o suporte); `sessaoDoNavegador` lê só os cookies da
  clínica. `pedirEntrada` faz o POST do painel sem a tela e devolve o código.

**Sessão no E2E (2026-10-06)** — os cookies são httpOnly e, no build, Secure.
- O arquivo de sessão de cada pessoa nasce de um `request.newContext` VAZIO
  (`storageState: { cookies: [], origins: [] }`). Herdando a sessão padrão do
  config, levava os cookies do admin junto, e o servidor lia o do admin.
- Contra o build (http em 127.0.0.1) o servidor sobe com
  `COOKIE_DE_SESSAO_SEM_SECURE=1`: o Playwright não manda cookie Secure por
  http nos pedidos fora do navegador (`page.request`, `chamarAcao`), que
  chegavam como anônimos (401, ou `{}` numa action).

**Apoio do E2E** (`apps/web/e2e/apoio/`). O E2E roda contra o banco da
produção (decisão do Heitor, 2026-09-27), isolado pelo prefixo `[e2e]`:
- `sessao.ts` — `criarMembro` (cargo com a matriz que o teste descrever, de
  rede ou de unidade), `membroComEscopoProprio` (o SDR) e `clienteComSessao`
  (cliente final no portal). Todos devolvem `estado` (cookies), `accessToken`
  (para falar com o PostgREST como a pessoa) e `destino` do login.
- `limpeza.ts` — `apagarClientes` / `apagarAgendamentos` na ordem das FKs, e
  `varrerSobras`, que o `global-setup` roda antes de cada rodada e que imprime o
  que não conseguiu apagar. Nunca toca `automations`. Só leva o que tem mais
  de UMA HORA (`E2E_IDADE_DA_SOBRA_MIN`): o mais novo pode ser de uma rodada
  em curso ao lado. Por isso uma rodada local durante o CI não derruba mais o
  CI (derrubava até 2026-09-30).
- `acao.ts` — `capturarAcao` / `reenviarAcao`: pega uma server action feita
  pela tela e a reenvia trocando o id. É o teste de "o endpoint recusa", que a
  tela sozinha não prova.
- `outra-rede.ts` — `criarOutraRede`: uma SEGUNDA rede `[e2e]` inteira (unidade,
  profissional, procedimento, e sob pedido cliente e produto), alvo dos
  testes de "uma rede não grava na outra". Com ela no banco, `tenantId()` e
  `filiaisAtivas()` filtram a rede de verdade — antes pegavam "a primeira".
- `uazapi-falsa.ts` — `subirUazapiFalsa`: uma uazapi em `127.0.0.1` que
  registra cada chamada e responde como a de verdade (ou 500, com
  `modo = 'erro'`). Caixa `[e2e]` com `config.baseUrl` apontando para ela faz o
  envio rodar INTEIRO — sucesso incluído — sem mensagem chegar a ninguém.
  `https://e2e.invalido` só serve para quando o teste não envia nada.
- `graph-falsa.ts` — `subirGraphFalsa`: a Graph API da Meta em
  `127.0.0.1` (envio oficial, API de Conversões, e com `responder` os GET de
  contas, pixels e campanhas), pela costura `config.graphBase` gravada direto
  no banco.
- Teste que mexe em configuração da REDE (integração, perfil) roda numa rede
  `[e2e]`: `criarOutraRede` + `criarMembro(…, { tenant })`. Assim a rede
  real nem é lida (`e2e/anuncios-integracao.spec.ts`).
- `acao-direta.ts` — `chamarAcao`: chama uma server action pelo id do
  manifesto do `next dev`, como a pessoa logada, sem montar a tela. Só
  argumentos JSON (FormData, por `acao.ts`). Toda recusa testada assim tem o
  admin como CONTROLE: argumento errado também "não muda nada".
  A action só existe nas rotas cujas PÁGINAS a usam; em outra, o Next responde
  200 com "Server action not found" — e `chamarAcao` lança, para a recusa não
  "passar" sem ter chegado à action.
- Limpeza que apaga no teste **olha o erro** (`expect(falhas).toEqual([])`):
  foi um `delete` calado que acumulou 78 clientes `[e2e]` na produção.
- Upload com arquivo não se reenvia (o Playwright não expõe o corpo
  multipart): o ataque se faz NA PÁGINA — `FormData.append` ou o input
  escondido adulterados antes de enviar (`e2e/prontuario.spec.ts`).
