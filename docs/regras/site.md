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

## O posicionamento (decisão do Heitor, 2026-10-18)

"Não somos sistemas separados, somos literalmente um sistema operacional para
clínicas." O site diz isso em três lugares:

- **O hero e o título da página**: "O sistema operacional da clínica de
  estética" — ERP e CRM num sistema só, do comercial ao financeiro e ao
  marketing, e o app da cliente.
- **"Não são sistemas separados. É um sistema só."** (`#um-sistema`): o núcleo
  em rosé e as frentes em volta — Comercial (CRM), Atendimento, Financeiro
  (ERP), Marketing — e o App da cliente ligado a elas.
- **Um sistema no lugar de vários** (pedido do Heitor, 2026-10-19): o hero diz
  que ele substitui vários sistemas que não conversam entre si, e a seção
  `#troca` mostra a troca linha a linha — o que a equipe faz hoje à mão entre
  um sistema e outro × a funcionalidade que existe no lugar. Cada "depois" é
  uma funcionalidade conferida; nenhum concorrente citado.
- **Fácil de usar** (`#facil`, 2026-10-19): sustentado só pelo que o sistema
  tem — busca universal (Ctrl+K), menu recortado pelo cargo, Copilot, app
  Android, o `/setup` com a importação, a Ajuda com chamados. Nada de "em 5
  minutos" ou número de adoção.
- **O app da cliente é o diferencial**, com seção própria (`#app-da-cliente`,
  no menu do topo) e três telas do app em leque. O nome na página é sempre
  **"App da cliente"** (no sistema é o portal do cliente).
  - O app é UM só, para todos (o mesmo sistema, no navegador ou no app
    Android): quem decide o que se vê é o login. A cliente que entra vê só a
    visão dela — por isso "o app dela". Não é um aplicativo separado, nem um
    app da clínica na loja (esclarecimento do Heitor, 2026-10-19).
  - O texto diz só o que o portal FAZ: agendar sozinha (o que a clínica
    liberar), assinar com o dedo, pacotes/créditos/planos, pontos e
    recompensas, confirmar e avaliar, avisos no celular, LGPD. Ele NÃO cobra
    (o financeiro é consulta), NÃO cancela nem remarca, e leva o nome da
    unidade — não a logo da clínica.

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
  - **A calculadora** (`#calculadora`, 2026-10-19, pedido do Heitor):
    unidades, pessoas na equipe, números de WhatsApp e o que muda de plano
    para plano (`escolhasDaCalculadora` — hoje, o Copilot) → o plano de
    MENOR TOTAL por mês que cabe, contando os adicionais que o plano vende
    (número extra até o teto de 10, Copilot avulso); empate, menos
    adicionais. A conta é uma só (`lib/calculadora.ts`, pura) e lê os planos
    do sistema: preço ou plano novo entra sozinho. Cada plano que não cabe
    diz por quê. Nasce calculada (sem JS, a resposta já está lá).
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
  O app da cliente tem três fotos (início, agendar com os horários livres,
  pontos): a câmera marca procedimentos como `visible_on_client_app`, liga a
  fidelidade com recompensas e grava os pontos como GANHO (o extrato mostra
  "Ganho no pagamento", não "Ajuste da equipe").
- **SEO**: metadata com canonical (`SITE_URL`), `robots.ts`, `sitemap.ts`,
  `opengraph-image` (gerada, com as cores dos tokens escritas — o ImageResponse
  não lê CSS), ícones a partir do logo do app, JSON-LD `SoftwareApplication`
  com uma oferta por plano ativo. `www` → domínio sem `www` (308) em `proxy.ts`.
- **O teste**: `apps/web/e2e-site/site.spec.ts` (`playwright.site.config.ts`)
  e o vitest de `apps/site/tests/`.

## O movimento (2026-10-18)

O Heitor pediu o site "mais atraente e dinâmico". O sistema proíbe animação de
entrada (o fade-up que prendia a opacidade, na skill `/lumiere-design`) e
gradiente de fundo; **o site é a exceção às duas**, só ele: é vitrine, não
ferramenta de uso o dia inteiro. O resto do design system vale igual (tokens,
fonte, raios, sombras de quem flutua).

- **A página nasce visível e parada.** Tudo que mexe vive sob a classe
  `site-movimento` no `<html>`, que o script do `<head>`
  (`lib/movimento.ts`, `SCRIPT_DO_MOVIMENTO`) liga antes de pintar — só para
  quem NÃO pediu menos movimento ao aparelho — e tira sozinho em 3,5 s se o
  JavaScript da página não marcar `data-movimento="vivo"`. Sem JS, com o
  script bloqueado ou com `prefers-reduced-motion`, a página é a de antes.
- **`data-revelar`** marca o que entra quando chega na tela (valor =
  direção: vazio, `esquerda`, `direita`, `zoom`; `--ordem` escalona). A
  entrada é ANIMAÇÃO, não transição: o que reage ao mouse usa a propriedade
  `translate`, que não briga com o `transform` da entrada.
- **As demonstrações** (`components/demos.tsx`: os avisos do hero, a conversa
  do WhatsApp, o Copilot) contam a mesma história das telas fotografadas da
  Clínica Aurora — Mariana Costa, Dra. Ana Lima, quinta às 10h. São
  `aria-hidden` (o texto alternativo das telas já diz o que mostram) e andam
  por `useSequencia` só enquanto estão na tela. Sem movimento, ficam paradas:
  as conversas no FIM (inteiras), os avisos no primeiro.
- **O destaque do título** ("num lugar só.") é a cor rosé, sem traço embaixo
  (cortava o "g" e parecia link). Com movimento, um brilho passa UMA vez
  pelas palavras quando o título entra, e elas terminam rosé sólido.
- O que é contínuo (a faixa, o brilho do hero, a vez dos passos, o celular
  flutuando) é `infinite` só sob a classe. Durações, curvas e tamanhos são
  token em `app/site.css` (`--site-mov-*`, `--site-curva*`, `--site-demo-*`).
- A prova é `e2e-site/movimento.spec.ts`: com movimento entra e anda; sem JS,
  com o script bloqueado e com movimento reduzido, nada fica invisível e
  nenhuma animação infinita roda.

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
❌ Indicar plano por outra conta que não lib/calculadora (o "mais adequado" é o menor total que cabe, com os adicionais)
❌ Mostrar R$ 0 quando o banco não respondeu (é o último valor bom, ou o aviso)
❌ Dar ao serviço Site a service role ou qualquer segredo (só a chave pública)
❌ Abrir platform_plans para anon em vez de passar pela função (a cota e o id não são vitrine)
❌ Script, pixel ou fonte de fora sem mexer na CSP do site — e sem o Heitor pedir
❌ Depoimento, cliente, logo ou número de uso inventado
❌ Prometer funcionalidade que ainda depende de aprovação de terceiro
❌ Foto de tela com dado de cliente real (é a Clínica Aurora, da câmera)
❌ Tamanho de fonte à mão no site (é token em app/site.css)
❌ Spec do site ou da câmera dentro de e2e/ (a completa não sobe o site)
❌ Esconder conteúdo (opacity 0) fora de .site-movimento — sem JS ou com o script bloqueado, ficaria invisível
❌ Animação infinita fora de .site-movimento (quem pede menos movimento a veria)
❌ Demonstração que conta o que as telas não mostram (é a história da Clínica Aurora, não promessa nova)
❌ Levar a exceção do movimento ou do gradiente de fundo para a clínica (lá vale a skill /lumiere-design)
❌ Prometer no app da cliente pagar, cancelar/remarcar ou a logo da clínica (o portal não faz)
❌ Chamar o app da cliente de "portal" na página (um nome por conceito: "App da cliente")
❌ Dizer que a cliente baixa um app à parte ou "o app da sua clínica" (é o mesmo app; o login abre a visão dela)
```
