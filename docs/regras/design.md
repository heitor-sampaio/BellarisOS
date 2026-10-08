# Design system — "Rosé Vivo"

> Regras do BellarisOS para esta área, tiradas do `CLAUDE.md` em 2026-10-06
> para ele caber no contexto (o índice está no §9 de lá). As regras gerais —
> rede e RLS, permissões, `gravar`/`ler`/`tentar`, portais — continuam no
> `CLAUDE.md` e valem aqui. Os números de seção são os de sempre.

## 13. Design System — BellarisOS ("Rosé Vivo")

> **OBRIGATÓRIO:** Antes de construir qualquer componente visual, invoque a skill `/lumiere-design`.
> Ela contém tokens, componentes primitivos e guidelines completos da linguagem visual do projeto.
> Nunca introduza cores, tipografia ou sombras fora do que está definido nos tokens da skill.

A linguagem visual é **"Rosé Vivo"**: fundo off-white neutro (`#f8f8f8`), cards brancos com borda (sem sombra), cantos arredondados contidos (card 12px, campo 10px) e rosé saturado (`#c34d6b`) como único acento de marca. O fundo era nude rosado até 2026-09-24 — o rosa ali competia com o acento; o calor ficou nas bordas e divisórias, que seguem nude.

Princípios inegociáveis:
- **Hierarquia por preenchimento** — o elemento mais importante de um grupo é preenchido em `--brand` (rosé). Todo o resto fica branco com borda. Vale em toda tela que mostra um grupo de números: seis KPIs iguais não têm hierarquia nenhuma, e o olho não sabe onde pousar.
- **Nada de cor, sombra, raio ou tamanho de fonte escrito à mão** — todo valor vem de `var(--token)`. A paleta fechou em 2026-09-24 com `--danger`, `--info`, a escala categórica `--cat-1…6`, `--shadow-overlay`, `--shadow-popover` e `--gradient-brand`: antes faltava como pintar um erro, e a falta produziu 143 tons inventados e 587 usos da paleta do Tailwind. Cor de marca de terceiro (Facebook, Instagram, WhatsApp, Google) é a única exceção.
- **Tipografia única** — Hanken Grotesk em todo o sistema. Títulos e números em `800` com tracking negativo; overlines em `700` uppercase.
- **Ícones** — Lucide, linha, `currentColor`. O `✦` é motivo de marca, não ícone funcional.
- **Sombras apenas em elementos de marca** — botão primário, KPI hero, nav ativo. Superfícies neutras usam borda, nunca sombra. O que **flutua** sobre a página é a exceção e tem token: `--shadow-overlay` (modal, drawer) e `--shadow-popover` (dropdown, tooltip).
- **Sem gradientes de fundo** — único gradiente permitido é o card "Pacote ativo" (`--brand` → `--brand-deep`).
- **Seletor: a forma vem da FUNÇÃO**, não do gosto de quem escreve a tela.
  - escolha exclusiva, 2 a 5 opções curtas e **fixas** → `<SegSelect>` (vira
    dropdown sozinho no celular);
  - opções vindas de **dados**, ou mais de 5, ou longas → `.filtro-select`;
  - **liga/desliga** de um filtro só → `.filtro-toggle` + `aria-pressed`;
  - filtro que **acumula** (tag, marcador) → `.chip-filtro` + `aria-pressed`.
    Se é exclusivo, não é chip: a pílula solta promete que dá para marcar duas.
  - **Seletor de texto não leva ícone** — o rótulo já diz, e o ícone repetido
    cinco vezes na mesma barra vira ruído. O toggle pode levar: ali o ícone é
    o assunto que se liga.
  - Lista mestre-detalhe — tela com a lista de um lado e o detalhe do item
    escolhido do outro, como o Inbox e Clientes — e passo de wizard **não são
    seletores** e seguem as próprias regras.
- **Seletor tem UMA altura: `--altura-controle` (34px).** Vale para
  `<SegSelect>`, `.filtro-select`, `.filtro-toggle` e o campo de busca de uma
  barra de filtros, para que a barra feche numa linha só. O `<SegSelect>` tinha
  uma variante `compacto` que cada tela escolhia, e era por isso que o seletor
  de período do dashboard era mais alto que o de unidade da agenda. **A tela não
  escolhe tamanho de seletor** — se precisar de outro, o problema é a tela.
- **A aparência do seletor mora no CSS, não no `style` inline.** Foi o inline
  que permitiu quatro desenhos da mesma coisa: `style` vence classe, então um
  padding esquecido ali desfaz a padronização inteira sem erro nenhum.
- Em **painel estreito** (o de filtros do inbox tem 288px) o segmentado
  quebraria em duas linhas e deixaria de ler como um controle só: ali a escolha
  exclusiva vira `.filtro-select` de largura cheia (`.painel-de-filtros`).
- **Barra de rolagem em área de CONTEÚDO é ruído** — some, a rolagem fica
  (`scrollbar-width: none` mais `::-webkit-scrollbar`). O que avisa
  que há mais é o conteúdo cortado na borda: o card pela metade no fim da
  coluna, a aba cortada na lateral. Vale para as colunas do funil
  (`.crm-coluna-cards`), a rolagem lateral do quadro e as barras de aba.
  A exceção é o modal (`.modal-body`), onde a barra é fina e rosé.
- **Sobreposição no celular começa EMBAIXO da topbar**, nunca em
  `inset: 0`: `top: calc(var(--topbar-h) + env(safe-area-inset-top, 0px))`.
  A topbar desenha por cima dos primeiros 68px do documento, e o que costuma
  ficar escondido ali é o cabeçalho da folha — que é onde mora o botão de
  fechar. Foi o que deixou o card do contato do inbox sem saída no celular.
  E a que vai até o FIM da tela sobe o rodapé com
  `env(safe-area-inset-bottom)`: no app Android a barra de navegação é
  transparente (com a faixa rosé por cima), e o campo e o botão do fim
  ficavam atrás dela — o Copilot, em 2026-10-08. Prova com a barra simulada
  pelo CDP (`Emulation.setSafeAreaInsetsOverride`): `e2e/copilot-celular.spec.ts`.
- **Modal é o `<dialog className="modal">` aberto por `showModal()`**, com
  `.modal-flex` + `.modal-container` + `.modal-body` quando tem cabeçalho
  fixo. Ele vai para a camada de cima do navegador, acima de qualquer
  `z-index`, e cabe na tela. Um `div` fixo com `z-index` fica atrás da
  topbar e sai da tela quando o conteúdo é longo: era o cadastro de cliente
  pelo inbox, até 2026-09-30.
  - **Modal novo é `<JanelaModal>`** (`components/shared/janela-modal.tsx`):
    abre sozinho, Esc e o fundo fecham (`fechaNoFundo={false}` em formulário
    longo, `travado` enquanto grava), e o corpo rola. Os 27 modais em `div`
    fixo passaram para ela em 2026-09-30. O que sobra de `position: fixed;
    inset: 0` é só o fundo invisível que fecha um menu — não é modal.
  - Imprimir de dentro da janela (o termo no checkout) solta a altura dela no
    `@media print` de `globals.css`.
- **Popover ancorado num gatilho que fica à direita vira o lado no celular.**
  `left: 0` de um gatilho encostado na borda direita nasce metade fora da
  tela, e o que fica de fora não tem rolagem que o alcance. O `<SegSelect>`
  já decide o lado sozinho (mede o gatilho); painel escrito à mão precisa de
  `left: auto; right: 0` e um teto de largura em `vw`.
- **Campo de busca tem fundo branco** (`.campo-busca`), diferente dos demais
  campos, que usam `--bg-app`. A busca vive numa barra de filtros sobre o fundo
  do app; com o mesmo tom do fundo ela sumia na superfície em vez de convidar
  a digitar. O critério do que é busca é o ÍCONE DE LUPA, não o placeholder.
- **Copy em pt-BR**, sentence case, moeda no formato `R$ 1.240`, percentuais com vírgula (`12,4%`).

### Bibliotecas de UI (integração com o design system)

#### Web
- Componentes: shadcn/ui + Tailwind — estilizar com os tokens da skill `/lumiere-design`
- Formulários: `react-hook-form` + schemas do `@estetica-os/validators`
- Toasts: `sonner`
- Tabelas: `@tanstack/react-table`
- Calendário: `@fullcalendar/react`
- Datas: `date-fns` com locale `pt-BR`
- Moeda: `formatBRL` de `@estetica-os/utils`

#### App
- É o web: as mesmas telas e bibliotecas. Plugins do Capacitor só para o que é
  nativo (push, preferências, barra de status).
