# O site — bellarisos.com

> Área nova (2026-10-17). O índice está no §9 do `CLAUDE.md`. As regras gerais
> continuam lá; as de design, em `design.md` (e a skill `/lumiere-design`).

A página de quem AINDA NÃO conhece o BellarisOS: a dona da clínica que chegou
por um link, por uma busca ou por indicação. O trabalho dela é um só — levar ao
**teste grátis de 14 dias** (o `/register` da clínica: conta criada pela
própria clínica, tudo liberado, sem cartão).

## Decisões do Heitor (2026-10-16)

- **Mora em bellarisos.com**, num app próprio (`apps/site`), não no `/` da
  clínica. O `/` de app.bellarisos.com só decide a porta: com sessão, o
  portal; sem sessão, o login (é o que o app Android abre).
- **A chamada é o teste grátis.**
- **Os preços aparecem, e são os do sistema** (`platform_plans`), não escritos
  na página.
- **O produto aparece em telas REAIS**, fotografadas de uma clínica fictícia.

## Como é feito

- **`apps/site`**: Next 16.3.4 standalone, o Dockerfile de sempre com
  `BELLARIS_APP=site`. Sem sessão, sem Supabase Auth, sem SDK da Meta — e com
  CSP própria e curta (`lib/csp.ts`): nada carrega de fora além das fontes do
  Google. Os cabeçalhos de segurança são os do suporte, menos o `noindex` e o
  `no-store`: aqui o buscador é bem-vindo.
- **A página renderiza a cada pedido** (`connection()`): os links da clínica
  (`CLINICA_URL`) e os planos vêm do ambiente e do banco, e o build do Docker
  não tem variável nenhuma.
- **Os planos**: `lerPlanos()` (`lib/planos.ts`) chama `planos_do_site()`
  (migration `20261017000001`) com a chave PÚBLICA — `security definer`, só os
  ativos, sem id, sem as cotas —, com cache de dados de 1 h. Se o banco falhar,
  o último valor bom do processo; se nunca houve, a seção diz que os planos
  aparecem em instantes, nunca R$ 0.
  - O cartão (`cartaoDoPlano`) traduz limites e adicionais em frases; o
    destaque em rosé é o plano com o Copilot incluído — o que ele tem a mais,
    sem inventar "o mais vendido".
  - O comparativo é o MESMO do sistema (`comparativoDosPlanos`, que subiu
    para `packages/nucleo/src/lib/planos/comparativo.ts`).
- **A escala do site**: a paleta, a fonte, os raios e as sombras são os do
  núcleo; o que é só do site são os TAMANHOS (`--site-h1`, `--site-lead`…), em
  `app/site.css`, como token. Moldura de tela flutua: `--shadow-overlay`.
- **As telas**: `lib/telas.ts` é o catálogo (arquivo, tamanho, texto
  alternativo). Quem as fotografa é `apps/web/e2e-capturas/telas-do-site.spec.ts`
  (`playwright.capturas.config.ts`, contra o build da clínica): monta a
  "Clínica Aurora" numa rede `[e2e]` própria — agenda do dia, conversas, um
  pacote, o financeiro do mês, injetáveis, automação, termos, o portal da
  Mariana — e apaga tudo no fim. Nos destaques, a foto sai sem o menu lateral.
- **SEO**: metadata com canonical (`SITE_URL`), `robots.ts`, `sitemap.ts`,
  `opengraph-image` (gerada, com as cores dos tokens escritas — o ImageResponse
  não lê CSS), ícones a partir do logo do app, JSON-LD `SoftwareApplication`
  com uma oferta por plano ativo. `www` → domínio sem `www` (308) em `proxy.ts`.
- **O teste**: `apps/web/e2e-site/site.spec.ts` (`playwright.site.config.ts`)
  e o vitest de `apps/site/tests/`.

## O texto

- **Nada inventado**: sem depoimento, cliente, logo de parceiro ou número de
  uso enquanto não existirem de verdade. Cada promessa é uma funcionalidade
  conferida no DEVLOG e no código.
- **O que depende de terceiro fica de fora até valer em produção**: Instagram e
  Messenger no inbox esperam a análise do app na Meta.
- Funcionalidade nova que muda o que a clínica ganha → a página muda junto
  (texto e, se for o caso, uma tela no catálogo e na câmera).

## O que nunca fazer aqui

```
❌ Escrever preço na página (é planos_do_site; o sistema é a fonte)
❌ Mostrar R$ 0 quando o banco não respondeu (é o último valor bom, ou o aviso)
❌ Dar ao serviço Site a service role ou qualquer segredo (só a chave pública)
❌ Abrir platform_plans para anon em vez de passar pela função (a cota e o id não são vitrine)
❌ Script, pixel ou fonte de fora sem mexer na CSP do site — e sem o Heitor pedir
❌ Depoimento, cliente, logo ou número de uso inventado
❌ Prometer funcionalidade que ainda depende de aprovação de terceiro
❌ Foto de tela com dado de cliente real (é a Clínica Aurora, da câmera)
❌ Tamanho de fonte à mão no site (é token em app/site.css)
❌ Spec do site ou da câmera dentro de e2e/ (a completa não sobe o site)
```
