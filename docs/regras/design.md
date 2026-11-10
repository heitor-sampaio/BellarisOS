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
  - **Filtro que abre uma lista** (unidade, tags, situação, responsável…) é o
    `<PickerCompacto>`, e duas coisas nele NÃO são escolha da tela (decisão
    do Heitor, 2026-10-14, depois de a barra de clientes misturar bolinha e
    quadrado): o marcador é **sempre quadrado**, no único e no múltiplo (a
    prop que escolhia saiu), e o painel **flutua por cima de tudo, inteiro na
    tela**: vai num portal (no `body`, ou no `<dialog>` aberto), em posição
    fixa medida do gatilho — para o lado e para cima/baixo que cabem —, e foca
    a busca sem rolar (`preventScroll`). Dentro da coluna, ele era cortado e a
    coluna vizinha era desenhada por cima. Em teste, as opções se acham em
    `[data-painel-picker]`, não dentro da linha do gatilho.
    Painel escrito à mão para a mesma função é o defeito de volta.
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
  - **No celular, a folha cabe na tela** (A1 da 10ª simulação, 2026-11-10):
    abaixo de 640 px o modal é uma folha presa no fim da tela (`92dvh`), e o
    cartão do `.modal-flex` tinha `100dvh − 48 px` — os últimos ~20 px do corpo
    (o botão do fim) ficavam abaixo da tela, onde nenhuma rolagem chega. O
    cartão tem a altura da folha e sobe a barra de navegação do Android. O que
    APARECE no fim de um formulário longo depois de um clique (a pergunta antes
    de gravar) rola até ficar à vista e leva o foco (`PerguntaDaVenda`).
    Prova: `e2e/vendas-pergunta-no-celular.spec.ts`.
- **A ação que fecha o trabalho de uma tela longa fica à vista no celular**
  (D1 da 10ª): a barra presa no rodapé, com o `safe-area`, abaixo da topbar e
  do Copilot na ordem das camadas, e um espaço no fim da página — como a
  `.sessao-acao-principal` do atendimento. Linha de ações que não quebra é o
  defeito de volta.
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
- **A saudação da topbar segue a hora de Brasília** (`saudacao`, `lib/saudacao.ts`):
  "Bom dia" das 05:00 às 11:59, "Boa tarde" até as 17:59, "Boa noite" até as
  23:59 e, de madrugada (00:00–04:59), "Olá" — A55 da 7ª simulação
  (2026-11-05): "Boa noite" às 04h30 numa clínica 24 h. Prova:
  `tests/saudacao-e-iniciais.test.ts`. **E não dá erro de hidratação** (D18 da
  9ª simulação, 2026-11-07): o servidor e o navegador calculavam cada um, e na
  virada das faixas (ou com o relógio do aparelho adiantado) o React #418
  aparecia ("Boa noite" virando "Olá"). O layout passa a do servidor
  (`saudacaoInicial`), a hidratação a usa e o navegador troca pela dele em
  seguida e a cada minuto (`useSyncExternalStore` na topbar). Texto que depende
  da HORA num componente de cliente segue o mesmo caminho. Prova:
  `e2e/atendimento-atritos-da-9.spec.ts` ("D18", o navegador 12 h à frente).
- **A clínica de UMA unidade não fala "rede"** (F8 da 5ª simulação,
  2026-11-02, levando o D-19 de `docs/regras/indicadores.md` a toda tela). A
  régua é a mesma, `redeTemUmaUnidade`; o texto passa por
  `lib/unidades/vocabulario.ts`: "rede" vira "clínica" ("da rede" → "da
  clínica", "Rede inteira" → "Clínica toda") e o cargo de sistema "Admin da
  rede" se chama **"Admin"** — só o rótulo; a chave `NETWORK_ADMIN` é a mesma.
  Com a segunda unidade, o texto volta como foi escrito.
  - No servidor: `vocabulario(await redeTemUmaUnidade(ctx.tenantId!))(texto)`.
    No navegador: `useFala()` ou `<Fala>{texto}</Fala>`
    (`components/shared/uma-unidade.tsx`); os layouts dos dois portais põem a
    régua no `UmaUnidadeProvider`.
  - **"Filial" não existe mais na tela**: a palavra é "unidade", com uma ou
    com dez — também nos quadros que só aparecem com duas ou mais ("Ranking
    de unidades", "Por unidade", "Aproveitamento por unidade", "ESTOQUE POR
    UNIDADE", "Todas as unidades"; r2-cfg-01, revisão do Heitor de 2026-11-03).
  - **A recusa que nasce no servidor e a dica (`title`) também falam assim**
    (r2-cfg-02, revisão do Heitor de 2026-11-03: "Só quem é Admin da rede…" e
    "Nunca ocorreu nesta rede" escapavam). A recusa passa por `falaDaRede(ctx.tenantId,
    texto)` (`lib/unidades/uma-so.ts`) — as de mexer na Admin
    (`recusaDeMexerNaAdmin`, a comissão da Admin, a Equipe) e as de abrangência
    ("vale para a rede inteira: quem muda é quem administra a rede", nas
    comissões, taxas, pacotes, fidelidade, documentos e planos); a dica, por
    `fala()`. Na clínica de uma unidade: "Só quem é Admin altera uma Admin.".
    Ficaram como estão as recusas de id que não é da rede ("…não encontrada
    nesta rede"), que a tela não oferece. Prova: `e2e/rede-de-uma-unidade.spec.ts`
    (as dicas de cada tela, a recusa da Admin e, com duas unidades, nenhum
    "filial").
  - **Select de unidade obrigatório com UMA opção vem preenchido** (Estoque,
    Equipe, lançamento); a pergunta que não tem o que perguntar some (crédito
    para cliente, "Disponível nas unidades" e o preço por unidade do
    procedimento, a unidade do checkout).
  - **A clínica de uma opção só** (A2 da 10ª simulação, 2026-11-10; CLAUDE.md
    §1): com UMA profissional, UMA sala livre, UMA unidade, ela vem
    escolhida — a regra é UMA, `unicaOpcao`/`aUnica` (`lib/uma-opcao.ts`;
    `unidadeInicial` passa por ela): o Agendar (unidade, profissional, sala —
    a sugestão do procedimento ligado a salas vem antes), o checkout do plano
    (a profissional), a importação e o Novo cliente (a unidade, que vira
    texto: a pergunta some) e o agendar do app (o passo "Tem preferência de
    profissional?" não existe com uma só: o procedimento leva à data, "Com
    X", e o Voltar volta ao procedimento). Com duas ou mais, nenhuma (A14 da
    8ª). Os próximos passos do setup terminam pela outra unidade, não começam
    (`lib/setup/proximos-passos.ts`). "Quem vendeu" fica fora: nasce sempre
    vazio (r2-ven-12, `comissoes.md`). Prova:
    `e2e/agenda-clinica-de-uma-opcao.spec.ts`, `tests/setup-proximos-passos.test.ts`.
  - Texto novo com "rede" na clínica passa pela fala. Prova:
    `e2e/rede-de-uma-unidade.spec.ts` percorre as telas dos dois portais e os
    modais e não acha "rede"/"filial"; com a segunda unidade, o vocabulário
    volta (o controle). `tests/vocabulario-da-clinica.test.ts`.

### Formulários (2026-10-21)

- **O rótulo é LIGADO ao campo**: envolvendo-o (`<label>texto + campo</label>`) ou
  com `htmlFor`/`id`. Rótulo solto não chega ao leitor de tela nem ao clique.
  Grupo de botões/opções não vai dentro de `<label>` (o clique apertaria o
  primeiro): `role="group"` com `aria-label`/`aria-labelledby`.
- **O rótulo do campo é `.field-label`** (A39 da 6ª simulação, 2026-11-04):
  `--text-xs-sz`, bold, `--text-muted`, em bloco — a classe era usada nos
  formulários e não existia no CSS, e "Bandeira (opcional)" saía maior que os
  rótulos em volta. Rótulo novo usa a classe, não um tamanho escrito à mão.
- **A validação do navegador fala português** (`ValidacaoEmPortugues`, no
  layout raiz): o navegador escreve na língua DELE.
- **Telefone com máscara enquanto se digita**: `maskPhoneDigitando`
  (@estetica-os/utils); para mostrar, `maskPhone`.
- **O exemplo do campo não é de uma cidade** (A21 da 5ª simulação, uma
  clínica de SC e outra do RS liam "(11) 99999-9999" e "SP"): telefone
  "(00) 00000-0000", CEP "00000-000", UF "UF", cidade "Nome da cidade".
- **Dinheiro no campo é texto com centavos** ("380,00"), nunca
  `type="number"` (A11: o insumo de R$ 380 aparecia "380").
- Aviso de "deu certo" é o `toast` do sonner (abaixo) — não um componente novo.
- No celular (< 640px), a linha da ficha (`.anamnesis-row`) vira UMA coluna.

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
