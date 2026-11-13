# Revisão do sistema, módulo por módulo

Aberta em 2026-11-13 pelo Heitor: "a gente vai ter que fazer uma revisão
completa desse sistema, tu inventou tanta coisa nessa merda que eu já perdi a
confiança que ainda é o sistema que eu desenhei" — "vamos ter que passar por
cada modulo do sistema, avaliar o que devia fazer e o que faz, e anotar se não
estiver anotado".

## Como funciona

Para cada módulo:

1. **O que devia fazer:** o Heitor diz, e se anota nas palavras dele.
2. **O que faz:** o Claude levanta pelo SISTEMA (telas, actions, banco), não
   pelas próprias anotações nem pelo DEVLOG.
3. **A diferença** vira item numerado do módulo (V1, A1…). O que não estava
   anotado em `docs/regras/` passa a estar.
4. O Heitor conduz e decide. O Claude não propõe regra, e nada se decide
   "pelos princípios".

Enquanto a revisão corre, nada é implementado: nenhuma frente, nenhum
workflow, nenhuma mudança de código. Cada módulo fechado vira um bloco do
**plano de adaptação** (mais abaixo), que só roda no fim, quando o Heitor
mandar.

**Estado:** ⬜ não começado · 🟡 em revisão · ✅ revisado

## Vocabulário (o primeiro item, 2026-11-13) ✅

O Heitor:
- "rede é o conjunto de unidades, unidade é uma unidade que pertence a rede"
- "Clinica é a mesma coisa que rede e não deve existir no sistema."
- "Filial sai de vez."

Anotado no CLAUDE.md, §1, em "Vocabulário".

| # | Diferença | Estado |
|---|---|---|
| V0 | Nome de cargo usado como cargo fixo ("a gerente", "a recepção"), nas regras e no CLAUDE.md — o Heitor, 13/11: "o que define quem gerencia é permissão, ponto" (anotado no CLAUDE.md §1) | aberto |
| V1 | "Clínica" aparece nas telas (inclusive no portal e no app da cliente: "Crédito na clínica", "Telefone da clínica"), na política de privacidade, nas regras (`docs/regras/`) e no CLAUDE.md | aberto |
| V2 | "Filial" aparece no CLAUDE.md ("Portal Web Filial"), nas regras e em nomes internos do código (`filial`, `trocarFilial…`). Nas telas, a palavra é "unidade" | aberto |

## Os módulos

A lista é a do próprio sistema: os 18 módulos da tela de Cargos e as
superfícies em volta. A ordem é do Heitor.

| Módulo | No sistema | Estado |
|---|---|---|
| Agenda | `agenda` | ✅ |
| Clientes (ficha, tags, LGPD) | `clients` | ✅ |
| Fidelidade | `loyalty` | ✅ |
| Prontuário | `medical_records` | ✅ |
| Documentos (termos e contratos) | `documents` | 🟡 |
| CRM (inbox, oportunidades, funis) | `crm` | ⬜ |
| Procedimentos | `procedures` | ✅ |
| Pacotes | `procedures` (pacotes) | ✅ |
| Plano de tratamento | `treatment_plans` | ⬜ (já tem itens, vindos de Pacotes: PC7–PC9) |
| Marketing (campanhas) | `marketing` | ⬜ |
| Automações | `automations` | ⬜ |
| Caixa (Vender, recebimentos, fechamento do dia) | `cashier` | ✅ (o PDV; recebimentos e fechamento do dia) |
| Financeiro (lançamentos, taxas, comissões) | `financial` | ✅ |
| Estoque | `stock` | ✅ (o que devia fazer; a correção vem depois) |
| Relatórios e indicadores | `reports` | ⬜ |
| Equipe | `team` | ⬜ (já tem item, vindo do Estoque: P3) |
| Fichas (formulários, pré-atendimento) | `forms` | ⬜ |
| Cargos e permissões | `roles` | ⬜ |
| Configurações (rede e unidade) | `settings` | ⬜ |
| Copilot | `copilot` | ⬜ |
| Portal da rede × portal da unidade | `/admin`, `/[slug]` | ⬜ |
| Portal e app da cliente | `/[slug]/cliente`, `apps/native` | ⬜ |
| WhatsApp e avisos (push) | `lib/whatsapp`, `lib/notifications` | ⬜ |
| Busca | `busca_universal` | ⬜ |
| Plataforma (sistema, suporte, assinaturas) | `apps/sistema`, `apps/suporte` | ⬜ |
| Site | `apps/site` | ⬜ |

## Estoque ✅

### O que devia fazer (o Heitor, 2026-11-13)

"Deve ser possivel:
- Cadastrar categorias com texto livre
- Cadastrar marcas com texto livre
- Cadastrar fornecedor com texto livre
- Cadastrar produto, com nome, código de barras opcional com ou sem leitor de
  codigo de barras, categoria, formato da embalagem, conteúdo da embalagem,
  checkbox de onde o produto está disponivel(Insumo e Venda direta), marca e
  fornecedor com autocomplete, estoque minimo e possibilidade de já cadastrar
  um estoque inicial ao cadastrar o produto."

### O que faz (levantamento pelo sistema)

Levantado no código das telas e das actions (`app/*/estoque`,
`components/branch/stock-product-modal.tsx`, `product-category-modal.tsx`,
`fornecedores-modal.tsx`, `campo-fornecedor.tsx`, `actions/stock.ts`).

- **Categorias:** botão "Categorias", com nome livre (Ex.: "Cosméticos,
  Descartáveis…"). Cria e exclui; não renomeia. Nome repetido na rede é
  recusado. Só quem é da rede vê o botão e grava; quem tem unidade fixa é
  recusado (H7).
- **Marcas:** não existem. Nenhum campo, lista ou tabela.
- **Fornecedores:** botão "Fornecedores", com nome livre: novo, renomear,
  arquivar, trazer de volta. O botão é só de quem é da rede, mas o
  "+ Novo fornecedor" dentro do produto e da Entrada cria um fornecedor para
  qualquer pessoa com Estoque em Gerenciar, inclusive de unidade fixa.
- **Novo produto**, campos na ordem da tela:
  - **Nome** *, obrigatório. Nome igual a um existente avisa, com
    "Cadastrar mesmo assim".
  - **SKU**, gerado sozinho (prefixo pela categoria e pelo uso + número). Não
    se edita.
  - **Código de barras**, opcional. Digita ou lê com leitor que funciona como
    teclado (o Enter do leitor fecha o campo). Câmera não há.
  - **Categoria**, opcional, numa lista suspensa das categorias.
  - **Embalagem** *, obrigatória, numa lista fixa: un, U, UI, ml, L, g, kg,
    cx, par, rolo, ampola, frasco, seringa.
  - **Conteúdo da embalagem**, opcional: quantidade + medida (a mesma lista).
  - **Uso do produto** *, três opções: Insumo / Revenda / Os dois. Revenda e
    Os dois pedem **Preço de venda** * e mostram a **comissão de venda do
    produto**.
  - **Fornecedor de costume**, numa lista suspensa da rede, com
    "+ Novo fornecedor".
  - **Estoque mínimo**.
  - **Adicionar estoque inicial**, chave opcional. Ligada, pede: a unidade
    que recebe (só no portal da rede), quantidade *, custo por embalagem,
    número do lote, validade, **Fornecedor desta entrada** (um segundo
    fornecedor), nota fiscal, observações. Diz que não gera despesa.
- **Quem cadastra produto:** existe a regra "catálogo de produtos" da rede
  (só a rede, ou as unidades também; o padrão é a unidade cadastrar).
- **Leitor na lista do estoque:** um botão lê o código, acha o produto e abre
  a Entrada. Se não achar, deixa ligar o código a um produto existente.

### Diferenças

| # | Diferença | Estado |
|---|---|---|
| E1 | **Marca não existe**: nem o cadastro de marcas com texto livre, nem o campo marca no produto | **Decidido:** cadastro de marcas com texto livre (lista do Heitor); a marca se escolhe na ENTRADA, não no produto (E10) |
| E2 | **Onde está disponível**: o Heitor diz checkbox (Insumo e Venda direta); o sistema tem três opções "Insumo / Revenda / Os dois", e chama de "Revenda" | **Decidido:** "checkbox" — Insumo e Venda direta |
| E3 | **Fornecedor sem autocomplete**: é lista suspensa com "+ Novo fornecedor" | **Decidido** no E6 |

### O sistema faz e não está na lista do Heitor (ele decide se fica)

| # | O quê | Estado |
|---|---|---|
| E4 | Categoria: só quem é da rede cria e exclui. Não há renomear | **Decidido:** "Precisa poder renomear, só quem tem permissão de gerenciar/rede pode criar/deletar/editar categoria." ("gerenciar/rede": ver a pergunta P1) |
| E5 | Fornecedor: "+ Novo" no produto/Entrada por quem tem unidade fixa; renomear e arquivar só a rede | **Decidido:** "Botão de novo fornecedor só aparece para quem tem permissão gerenciar. Hoje o que é chamado de fornecedor vira marca. Adiciona cadastro de fornecedor, igual ao de marca." |
| E6 | Categoria é lista suspensa (a lista do Heitor pede autocomplete só para marca e fornecedor) | **Decidido:** "Categoria, marca e fornecedor com lista e campo de busca com autocomplete." (resolve também o E3) |
| E7 | Formato da embalagem é lista FIXA de 13 medidas, não texto livre | **Decidido:** mantém |
| E8 | SKU gerado sozinho | **Decidido:** mantém |
| E9 | Preço de venda e comissão de venda no cadastro do produto | **Decidido:** mantém |
| E10 | Dois fornecedores no cadastro com estoque inicial: o "de costume" e o "desta entrada" | **Decidido:** "Não existe fornecedor de costume. Na entrada no estoque, escolhe fornecedor e marca." (ver a pergunta P2) |
| E11 | Estoque inicial com lote, validade, nota fiscal, custo e observações | **Decidido:** "ok, mantem como está, mas com possibilidade de dividir a entrada entre as unidades." |
| E12 | Nome repetido avisa e pede confirmação | **Decidido:** ok, mantém |
| E13 | A regra "quem cadastra produto" (só a rede × as unidades também) | **Decidido:** "Quem cadastra é só quem tem permissão de gerenciar. Se for pessoa de uma unidade especifica, unidade vem pré-preenchida e não pode ser mudada. Se a pessoa tiver mais de uma unidade, a lista mostra apenas as unidades dela." (ver a pergunta P3) |

### Perguntas respondidas (13/11)

- **P1 (E4):** "quer dizer que só pode alterar quem tem permissão de
  gerenciar". **P1 (E5):** "ta bem claro, é só quem tem permissão de
  gerenciar, mesma regra para categoria, marca e fornecedor". Ou seja: ser
  da rede NÃO conta. Hoje conta (H7): quem tem unidade fixa, mesmo com
  Gerenciar, é recusado em categoria e em renomear/arquivar fornecedor.
- **P2 (E10):** "marca e fornecedor só na entrada". O cadastro do PRODUTO
  não tem marca nem fornecedor. Isto corrige a lista do começo, que os punha
  no produto.
- **P3 (E13):** "No cadastro da equipe, permitir linkar a pessoa em mais de
  uma unidade, \"atende\" é um checkbox que permite que ela faça
  atendimentos". Vai para a revisão da **Equipe**: hoje a pessoa é da rede ou
  de UMA unidade, e o "Atende" é uma lista de unidades (decisão 2 da 8ª
  simulação: "o atende vira um checklist com todas as unidades").
- **E2:** "checkbox".

### O resto do Estoque (o Heitor, 13/11)

"Até aqui falamos sobre a criaçao de produtos no estoque, a tela geral do
estoque esta boa. A entrada adapta para o novo formato de informar marca e
fornecedor. Garanta que existam os 3 filtros: categorias, marca,
fornecedores. Mantem saída no atendimento, transferencia entre unidades,
perda, ajuste, lotes, validade e aviso de mínimo."

| # | Diferença | Estado |
|---|---|---|
| E14 | A Entrada pede o fornecedor da lista de hoje (a que vira marca, E5), com "+ Novo"; não pede marca | **Decidido:** a Entrada passa a pedir marca e fornecedor |
| E15 | Filtros da tela hoje: busca, categoria, unidade, situação. Não há filtro de marca nem de fornecedor | **Decidido:** os 3 filtros, categorias, marca e fornecedores (ver P4) |

- **P4 (E15), respondida:** "o filtro de marca ou fornecedor mostra os
  produtos que tem alguma entrada dessa marca/fornecedor".

## Procedimentos ✅

### O que devia fazer (o Heitor, 2026-11-13)

"A tela de procedimentos esta boa. Para as categorias, vale a mesma regra do
estoque, só quem tem permissão de gerenciar procedimentos. No cadastro do
procedimento, troque \"Visivel no app do cliente\" por \"Permitir auto
agendamento\". Em \"Ficha\" mude para \"Ficha de atendimento\" mantem o padrão
lista. Agora vamos mudar a parte de termo de consentimento e contrato.
Transforme em uma seção \"Documentos\" onde é possível linkar todos os
documentos que precisam de assinatura do cliente. Deve ser possível adicionar
quantos documentos quiser. Depois vamos modificar os documentos para se
comportarem dessa forma, eles não terão mais categorias, todos serão apenas
documentos que poderão ser linkados a um procedimento. Parte de descrição,
disponivel nas unidades, salas, insumos e o resto pode manter."

### O que faz (levantamento pelo sistema)

Levantado em `components/admin/procedure-form.tsx`,
`actions/procedures.ts`, `actions/categorias-de-procedimento.ts` e
`docs/regras/documentos.md`.

- **Categorias de procedimento:** criar, renomear (junta, se o nome já
  existe) e arquivar. Quem pode: Procedimentos em Gerenciar **e** ser da
  rede (`ctx.branchId === null`).
- **Criar e editar procedimento** também exige ser da rede (`assertRede`:
  "Procedimentos são do catálogo da rede").
- **Cadastro:** nome, categoria *, duração *, a caixa "Visível no app do
  cliente" ("A cliente vê o procedimento no app e agenda sozinha"), "Ficha"
  (lista suspensa, uma só), "Termo de consentimento" (UM) e "Contrato" (UM),
  pontos de fidelidade (só no modo por procedimento), descrição, e o resto
  (unidades, salas, insumos, quem realiza, comissão).
- **Termo e contrato:** cada um é uma lista suspensa com um modelo. Embaixo,
  a dica diz quando o documento nasce (ao agendar / no início do atendimento)
  e se ele bloqueia o início sem assinatura ou só avisa.
- **Os documentos têm hoje três categorias** (`kind`): TERMO, CONTRATO e
  CONTRATO_PLANO. Cada uma tem as suas variáveis (o termo não usa
  `agendamento.*`, porque também serve ao plano; só o contrato de plano usa
  `plano.*` e `pagamento.*`). O CONTRATO_PLANO não se liga a procedimento:
  é UM ativo por rede e vale no checkout do plano.

### Diferenças

| # | Diferença | Estado |
|---|---|---|
| PR1 | Categorias: hoje Gerenciar **e** ser da rede | **Decidido:** só quem tem Procedimentos em Gerenciar (a regra do Estoque) |
| PR2 | A caixa se chama "Visível no app do cliente" | **Decidido:** "Permitir auto agendamento" |
| PR3 | O campo se chama "Ficha" | **Decidido:** "Ficha de atendimento", mantém a lista |
| PR4 | UM termo e UM contrato por procedimento, em dois campos | ~~seção "Documentos" com quantos quiser~~ **Revisto no PC7 (Pacotes):** campo "Termo de consentimento", campo "Contrato" (só no avulso) e "outros documentos", quantos quiser |
| PR5 | Os documentos têm categorias (termo, contrato, contrato de plano) | ~~sem categorias~~ **Revisto no PC7 (Pacotes):** termo e contrato voltam a ser papéis específicos; o resto para a revisão de Documentos |

### Perguntas

- **PR6, respondida:** "sim, só quem tem permissão de gerenciar". Criar e
  editar procedimento: quem tem Procedimentos em Gerenciar, e só isso.
- **Para a revisão de Documentos** (não agora; anotado para não se perder):
  sem categorias, (a) o que acontece com o contrato de plano, que hoje não é
  de procedimento e vale no checkout do plano? (b) As variáveis, hoje
  separadas por categoria, ficam todas valendo em todo documento? (c) "Quando
  nasce" e "bloqueia ou avisa" continuam de cada documento?

## Pacotes ✅

### O que devia fazer (o Heitor, 2026-11-13)

"Pacote é um tipo de produto que é um conjunto de procedimentos pre
estabelecidos. Por exemplo, 4 sessoes de botox + 4 massagens, valor x. Então
para montar um pacote, escolhe um nome, procedimentos, sessões de cada
procedimento e valor. O valor base do pacote já puxa a soma dos valores dos
procedimentos adicionados, mas com opção de alterar o valor. Precisamos achar
uma solução de documentos para esse caso."

### O que faz (levantamento pelo sistema)

Levantado em `components/admin/pacotes-catalogo.tsx`, `app/_shared/pacotes.tsx`,
`docs/regras/vendas-financeiro.md` §9.3.1 e `docs/regras/documentos.md`.

- **Onde:** Vendas → Pacotes, nos dois portais. Ver pede Procedimentos em
  Ver; criar e editar, Procedimentos em Gerenciar **e** ser da rede.
- **Cadastro:** Nome; Procedimentos (cada linha: procedimento + sessões;
  "+ Adicionar procedimento"); **Preço do pacote**, que nasce VAZIO, com a
  frase "N sessões no pacote · avulsas sairiam por R$ X" embaixo; Validade em
  dias (vazio = sem validade); "À venda"; comissão de venda e de execução.
- **Na venda,** o preço se reparte entre as sessões pelo preço de tabela de
  cada procedimento (é a base da comissão de cada sessão).
- **Documentos hoje:** vender o pacote não emite documento nenhum. Cada
  SESSÃO agendada emite os documentos do procedimento dela, como um
  atendimento avulso (o termo e o contrato do procedimento), a cada sessão.
  Um pacote de 4 botox pede o termo do botox 4 vezes, e o contrato avulso 4
  vezes. Para comparar: o plano fechado pede um termo por procedimento
  distinto e UM contrato de plano, no checkout.

### Diferenças

| # | Diferença | Estado |
|---|---|---|
| PC1 | O preço nasce vazio; a soma aparece só como frase ("avulsas sairiam por") | **Decidido:** o valor base já vem com a soma dos procedimentos adicionados, e pode ser alterado |
| PC2 | Documentos: nada na venda; os do procedimento a cada sessão | **Decidido (ver PC7):** "como o cliente comprou um pacote, nao faz sentido ele precisar assinar todas as vezes, ele assina pelo pacote. o ideal era funcionar como no plano de tratamento, mas removemos os documentos especificos antes né, talvez tenha que voltar naquele formato de linkar termo e contrato, especificamente, para facilitar essa parte." Assina UMA vez, pelo pacote. Em aberto: o formato (ver PC7) |

### O sistema faz e não está na lista do Heitor (ele decide se fica)

| # | O quê | Estado |
|---|---|---|
| PC3 | Validade em dias (vazio = sem validade) | **Decidido:** ok, mantém |
| PC4 | "À venda" (tirar o pacote da venda sem apagar) | **Decidido:** ok, mantém |
| PC5 | Comissão de venda e de execução no cadastro do pacote | **Decidido:** ok, mantém |
| PC6 | Criar e editar exige ser da rede (além de Procedimentos em Gerenciar) | **Decidido:** "apenas gerenciar" |

- **"Tipo de produto"** (o Heitor): "Pacote tipo um produto que se vende,
  não aparece no estoque pq é um conjunto de procedimentos, não de itens."
  Fica em Vendas → Pacotes, como hoje.
- **PC7, decidido (o Heitor, 13/11)** — vale para Procedimentos, Pacotes e o
  plano de tratamento:

  "O seguinte, vai ser assim, o procedimento, a gente vai poder listar um termo
  de consentimento do procedimento e vai poder adicionar um contrato para quando
  esse procedimento for realizado avulso. Então, esses dois documentos que vão
  no cadastro do procedimento, que são obrigatórios, que estão ali já
  especificados, que é o termo de consentimento, e o contrato, sendo que o
  contrato só vale para quando ele for um procedimento avulso, tá? Por quê?
  Porque num plano de tratamento ou num pacote, esse contrato vai precisar
  englobar os outros procedimentos também. E também nos procedimentos aí
  permite adicionar outros documentos que a rede queira que seja assinado, e aí
  qualquer documento que tenha sido criado ou anexado no sistema, tá? E aí para
  o pacote, e aí vale a mesma coisa para o plano de tratamento, ele vai puxar
  automaticamente um termo de consentimento de cada procedimento diferente, e o
  contrato daí vai ser o contrato do pacote ou o contrato do plano de
  tratamento."

  Em resumo:
  - **No procedimento:** um campo "Termo de consentimento", um campo
    "Contrato" (só vale no atendimento AVULSO) e "outros documentos" que a
    rede queira, quantos quiser, de qualquer documento criado ou anexado no
    sistema.
  - **No pacote e no plano:** puxa sozinho UM termo de cada procedimento
    diferente; o contrato é o do pacote (ou o do plano), não o dos
    procedimentos.
  - Isto substitui o PR4 e o PR5 de Procedimentos.
- **PC8, respondido (o Heitor, 13/11):** "Eu me expressei errado ali, tá?
  Não é obrigatório que aparece na tela do cadastro. Tá? Pode incluir ou pode
  não incluir. Tá? Não é obrigatório. O contrato do pacote e do plano, sim,
  cada um vai ter o seu específico daí, porque é um contrato, né? Então ele
  precisa conter todos os procedimentos, as sessões e tudo mais. Então a
  gente precisa construir um contrato específico por pacote e por plano. Tá?
  E os outros documentos do procedimento, aí faz o seguinte: quando tiver
  outros documentos, ele puxa essa lista dos documentos e mostra ali na tela
  e ver se quer manter ou quer excluir aqueles outros documentos."
  - (a) Termo e contrato no procedimento são **opcionais**.
  - (b) **Um contrato específico por pacote e por plano**, com todos os
    procedimentos, as sessões "e tudo mais".
  - (c) Os **outros documentos** dos procedimentos: a tela do pacote (e a do
    plano) puxa a lista e deixa manter ou excluir cada um.
- **PC9 (a), respondido (o Heitor, 13/11):** "vamos manter esse contrato do
  plano, tá? Ele é bom, ele já funciona bem. E vamos estender isso pro pacote
  também. Estender não, vamos criar um equivalente disso pro pacote. Tá?
  Então vai ter o contrato do plano, o contrato do pacote e os contratos
  avulsos dos procedimentos, tá? Porque esse contrato do plano ali já
  funcionava bem, a gente só cria uma versão adaptada dele pro pacote, né?
  Para caso tenha alguma diferença de contrato entre um plano e um pacote,
  que queira fazer alguma diferenciação, a gente consegue permitir isso."
  - O **contrato de plano** fica como está: um modelo da rede, preenchido
    com os procedimentos, as sessões e o pagamento de cada plano.
  - Nasce o **contrato de pacote**, o equivalente: um modelo da rede, à
    parte do de plano, preenchido com os procedimentos, as sessões e o
    pagamento de cada pacote vendido.
  - Três contratos: o de plano, o de pacote e o avulso de cada procedimento.
- **PC9 (b), respondido (o Heitor, 13/11):** "Isso aí aparece na hora de
  criar um plano e um pacote, tá? Naquele mesmo pop-up da criação ali, ele
  aparece ali logo abaixo da seleção do termo e do contrato, tá? Isso vale
  para os dois, tanto para o plano quanto para o pacote."

- **PC10, esclarecimento (o Heitor, 13/11):** "quando for montar um plano ou
  um pacote, quando puxar os documentos, ele vai puxar os termos dos
  procedimentos e vai puxar também os outros documentos que tiver. Ele só não
  puxa o contrato. Tá? E aí esses documentos que ele vai puxar todos, deve dar
  para poder excluir o qual quiser, né? Então digamos que ele vai fazer aí 2
  sessões de botox e 2 de massagem. Vai puxar o termo do botox e o termo da
  massagem e os outros documentos que tiverem cadastrados nesses 2
  procedimentos, com a possibilidade de excluir eles, tá? Do pacote, excluir
  esses outros documentos do pacote ou do plano, porque depois a gente vai
  enviar isso tudo para o cliente por um link só, onde o cliente com uma
  assinatura já dá o assinado ali em todos os documentos de uma vez só."
  - Puxa os TERMOS e os OUTROS documentos dos procedimentos; o contrato do
    procedimento não (vale o de pacote / de plano).
  - Qualquer documento puxado pode ser excluído (leitura do Claude: o termo
    também; a corrigir se não for).
  - **Um link só** para a cliente, e **uma assinatura** assina todos de uma
    vez. Hoje é um link por documento (`gerarLinkDeAssinatura`: uso único, 7
    dias, um ativo por documento) e cada documento se assina à parte.

## Tags (regra do sistema inteiro) ✅

### O que devia fazer (o Heitor, 2026-11-13)

"Tag é uma coisa que serve para criar filtros personalizados. Isso em
qualquer lugar do sistema, tá? O sistema não coloca tag nenhuma
automaticamente em ninguém por nenhum motivo, tá? As tags são uma maneira
para a clínica criar filtros personalizados. Então ela cria uma tag com o que
ela quiser e depois, onde tiver for passível de filtro, um dos filtros que
ela pode usar são as tags. Tá? Com isso, a clínica tem flexibilidade para
filtrar o que ela quiser do jeito que ela quiser, além dos filtros que a
gente já apresenta ali fixos em cada página."

Substitui as leituras do Claude sobre a H16 (o bloco "Não existe tag de
unidade" em `docs/regras/crm-inbox.md`). Anotado no CLAUDE.md §1, "Tags".

### O que faz (levantamento pelo sistema)

Onde o sistema põe tag sozinho hoje:
- **T1.** A cada agendamento, o gatilho `trg_appointment_unit_tag` põe
  "Unidade: X" na cliente (migration `20260721140001`). E há leituras que
  tomam essa tag como "a unidade da cliente": público das campanhas e
  "Buscar clientes" das automações por unidade, novas clientes por unidade,
  "Reativar", a lista de Clientes do portal da unidade, o Agendar escolhendo
  a unidade pela tag (A25 da F73, `unidadeDaTag`).
- **T2.** A conversa nova que vem de anúncio nasce com a ORIGEM como tag
  (`deriveLeadSource` → `conversations.tags`, que o gatilho leva para a
  pessoa).
- **T3.** Na Importação, a coluna "Origem" de cada linha vira tag da pessoa
  ("Origem (vira tag da pessoa)").
- **T4.** As automações têm a ação "Tag do cliente" (adicionar/remover): é a
  rede que monta a automação, mas quem grava a tag é o sistema, sozinho,
  quando ela dispara.
- **T5.** Onde a tag é filtro hoje: na pessoa (`contacts.tags`) — ficha,
  inbox, oportunidades, campanhas, automações. Produto, procedimento,
  agendamento etc. não têm tag.

### Diferenças

| # | Diferença | Estado |
|---|---|---|
| T1 | O gatilho da "Unidade: X" e as leituras da tag como unidade | **Decidido:** sai. O sistema não põe tag |
| T2 | A origem do anúncio vira tag | **Decidido:** sai |
| T3 | A origem da Importação vira tag | **Decidido:** sai |
| T4 | A ação "Tag do cliente" das automações | **Decidido:** "Adicionar tag", com qualquer tag registrada |

### Respostas (o Heitor, 13/11)

"sobre a ação tag do cliente, essa ação ela deve se chamar só adicionar tag,
tá? E aí ela permite que se adicione qualquer tag que tenha sido registrada
no sistema, tá? Básico. Sobre a origem sem virar tag, como eu já falei, o
sistema não atribui tag automaticamente a nada nem ninguém em momento algum.
Essa é a regra e ponto. Não existe porque tem outras perguntas nesse
sentido, certo?"

- **T4:** a ação das automações se chama **"Adicionar tag"** e oferece
  qualquer tag registrada no sistema. (Leitura do Claude: a ação só
  adiciona; o modo "remover" sai.)
- **T2/T3:** a regra basta — nenhuma origem vira tag. Não perguntar de novo
  nada que a regra já responde.
- Ficam para a revisão de **Clientes**, sem pergunta nova agora: onde mais a
  tag pode ser marcada além da pessoa, e as "Unidade: X" já gravadas não importam (o banco
  será zerado antes do lançamento).

### Bloco no plano: Tags

Está no PLANO DE ADAPTAÇÃO, "Bloco: Tags".

## Agenda ✅

### O que devia fazer (o Heitor, 2026-11-13)

"a pagina da agenda ta boa e as funcoes me parecem boas"

### O que fica pelas regras que já existem (sem pergunta)

- **D20** (aberta desde a F65): quem tem a Agenda em Gerenciar com "só os
  meus" remarca o PRÓPRIO atendimento. A regra das permissões responde:
  Gerenciar nos próprios registros. A F75 já mostra o "Remarcar".
- **Sessão de pacote e de plano** não emite documento (PC2/PC7: assina-se na
  venda).
- **A pessoa em mais de uma unidade** (P3, Equipe) vê e agenda nas unidades
  dela; o "Atende" é por unidade (`atende_em`), como já é.
- **Remarcar e a confirmação:** H3 decidida (a cliente pelo app nasce
  Confirmada; a equipe e o Copilot voltam a Agendado).

### Respostas (o Heitor, 13/11)

- **AG-P1, documentos:** "vai sempre tudo no mesmo link, tá? Todos os
  documentos em um link único, a pessoa visualiza e assina uma vez só, a
  assinatura dela vale para todos os documentos do link." Vale para o
  atendimento avulso e para todo envio de documentos (é a regra do PC10,
  agora geral). Hoje: um link e uma assinatura por documento.
- **AG-P2, agendar pelo inbox:** "coloca uma caixa de seleção para a unidade,
  simples." Sai a escolha pela tag "Unidade: X" (T1).

### Bloco no plano: Agenda

Está no PLANO DE ADAPTAÇÃO, "Bloco: Agenda".

## Clientes ✅

### O que devia fazer (o Heitor, 2026-11-13)

"Em clientes, pagina esta boa, mas o cliente não pertence a unidade,
pertence a rede, então nao faz sentido aparecer a unidade na coluna
esquerda."

### O que faz (levantamento pelo sistema)

- **A coluna esquerda** (`clients-sidebar.tsx`), no portal da rede, mostra em
  cada cliente a unidade em que ela foi cadastrada (`clients.branch_id`).
- **O filtro "Unidade"** da lista (portal da rede) recorta pela tag
  "Unidade: X" (quem frequenta a unidade), e o contador de ativas acompanha.
- **No portal da unidade,** a lista é só de quem tem a tag "Unidade: X" dela
  (`getCachedBranchClients`); a busca acha também as clientes da rede fora
  dessa lista (A17 da 8ª).
- A tag "Unidade: X" sai (T1, Tags).

### Diferenças

- **CL1.** Sai a unidade da coluna esquerda.

### Respostas (o Heitor, 13/11)

- **CL-P1:** "Não deve ter um filtro de unidade nem na lista nem no portal da
  unidade. Como o cliente pertence à clínica, a unidade, o portal da unidade
  vê todos os clientes."

### Bloco no plano: Clientes

Está no PLANO DE ADAPTAÇÃO, "Bloco: Clientes".

## Vendas: o PDV e as comandas ✅

### O que devia fazer (o Heitor, 2026-11-13)

Começou pelo "Vender" da ficha: "Esse \"Vender\" dentro de cliente me
incomoda, alias, me incomoda a maneira como uma venda acontece no geral.
Precisamos melhorar isso." Depois:

"vamos fazer um PDV. E aí tudo que foi relacionado a alguma coisa que tenha
cobrança vira uma comanda. E aí o pagamento acontece por dentro desse PDV,
seja do que for. É todo que for pacote, procedimento avulso, qualquer coisa
que for ser cobrança, aí por exemplo, um agendamento gera uma comanda num PDV
quando ele tiver algum procedimento já especificado, né? E aí a gente tem o
controle desses pagamentos e um lugar para realmente vender. Fazer a venda,
né? Controlar essa venda. E pelo PDV daí também dá para vender o que tiver de
produto marcado como coisa que pode ser vendida."

Em resumo:
- **Um PDV**: o lugar de vender e de controlar as vendas e os pagamentos.
- **Tudo que tem cobrança vira COMANDA**: pacote, procedimento avulso, plano,
  produto, qualquer coisa.
- **O pagamento acontece só pelo PDV**, seja do que for.
- **O agendamento com procedimento especificado gera uma comanda** no PDV.
- **O PDV vende produto** marcado como vendável (a "Venda direta" do E2).

### O que faz hoje (levantamento pelo sistema)

A venda tem cinco portas, cada uma com o seu fluxo:
- **Agendar (avulso):** o preço entra no agendamento; a cobrança é a da
  conclusão do atendimento.
- **"Vender" da ficha e do painel do inbox** (`components/shared/vender.tsx`):
  abas Procedimento (pré-pago), Pacote, Produto e Crédito na clínica;
  pergunta a unidade; depois oferece "Agendar a 1ª sessão".
- **Fim do atendimento:** a cobrança da conclusão, que pode abrir o "Vender"
  dentro dela (`checkout-wizard.tsx`).
- **Plano de tratamento:** nasce no planejamento e se vende no "Fechar
  checkout" (`checkout-de-plano.tsx`), que também agenda as sessões.
- **Produto:** a aba do "Vender", com estoque e devolução próprios.
Não existe tela de comandas nem lista do que está aberto para cobrar; o que
mais se aproxima é o "A receber" do Financeiro e o Fechamento do dia.

### Perguntas

- **PDV-P1, respondida (o Heitor, 13/11):** "Uma comanda para cada coisa que
  vai ser vendido, né? Se foi um agendamento isolado para um atendimento, um
  procedimento qualquer, é uma comanda para isso. Se foi, se está sendo
  vendido um pacote ou está sendo vendido um plano, é uma comanda para um
  pacote ou para um plano. Tudo que for uma venda gera uma comanda."
  Uma VENDA = uma comanda: o agendamento avulso, o pacote, o plano, cada um
  na sua.
- **PDV-P2, respondida (o Heitor, 13/11):** "A comanda ela aparece no PDV
  quando o agendamento é confirmado. Aí ela aparece lá no PDV. Se o
  agendamento for cancelado, aí sem ter sido realizado, aí automaticamente
  exclui essa comanda aí."
- **PDV-P3, respondida (o Heitor, 13/11):** "O vender da ficha sai e o do
  inbox ele pode sair, ele pode levar pro PDV, tá? Porque só vende pelo PDV."
  O "Vender" da ficha sai; o do inbox vira o caminho para o PDV.
- **PDV-P4, respondida (o Heitor, 13/11) — e ela REVÊ a P2:** "quando a
  cliente chega na unidade, qualquer pessoa que seja de recepção ou o
  profissional que vai atender, clica no horário dela na agenda e inicia o
  atendimento. Quando inicia o atendimento, gera a comanda. Aí fica a
  critério da clínica se precisa pagar primeiro ou se paga depois, que daí é
  só a ordem que eles vão fazer qualquer coisa. E aí também já cria o
  atendimento para profissional que vai realmente atender. A cliente que não
  veio e ninguém cancelou, a comanda sai como no cancelamento. A remarcação
  não faz diferença, porque daí ninguém efetivamente iniciou o atendimento,
  só gera comanda quando inicia o atendimento. E no plano de tratamento e no
  pacote, a comanda do plano aparece quando o cliente... Não, vai ter que ser
  diferente. No plano de tratamento pode ser quando o cliente... Quando
  inicia o primeiro atendimento do plano. E o pacote, ele vai ser vendido
  como se fosse um produto. Então já faz ali na hora, porque normalmente isso
  aí vai ser vendido até online."

  Em resumo:
  - **A comanda do atendimento nasce quando o atendimento é INICIADO** (não
    na confirmação, como a P2 dizia): quem tem a permissão clica no horário
    na agenda e inicia; nasce a comanda e o atendimento de quem vai atender.
  - **Pagar antes ou depois** é só a ordem em que a unidade faz as coisas:
    nada a configurar.
  - **Falta e cancelamento:** nunca chegaram a iniciar, então não há comanda.
    A remarcação não muda nada.
  - **Plano de tratamento:** a comanda nasce ao iniciar o PRIMEIRO
    atendimento do plano.
  - **Pacote:** vendido como um produto, na hora, pelo PDV (e um dia online).

### Bloco no plano: Vendas e PDV

Está no PLANO DE ADAPTAÇÃO, "Bloco: Vendas e PDV".

## Caixa: recebimentos e fechamento do dia ✅

### Como se decidiu (o Heitor, 2026-11-13)

O Heitor: "o problema é que eu não entendo nada disso daí, dessa parte aí de
fechamento, de financeiro, de contabilidade, então tu tem que me ajudar com
isso aí. Como é que o pessoal usa normalmente, qual que é a regra geral, qual
que é o modo mais fácil e intuitivo disso acontecer." O Claude explicou o uso
comum (o caixa do balcão × o financeiro da gestão; "o que a cliente paga na
sua frente passa pelo caixa, o resto é do financeiro") e propôs o desenho
abaixo. O Heitor: "Blz pode ser assim".

### O que faz hoje (levantamento)

- **Recebimentos** (permissão `cashier`): recebe o atendimento na conclusão,
  o plano no check-in, dá baixa nas parcelas e no "a receber", vê os
  "Concluídos a receber" (agenda, Fechamento, ficha); é dele o "Vender".
- **Fechamento do dia** (por unidade, sem caixa de abrir): por forma de
  pagamento, entradas, saídas e saldo; o dinheiro esperado × contado, com
  fundo de troco opcional; "Por quem recebeu"; os estornos do dia; seis
  avisos (a receber, lançamento depois do fechamento, espécie negativa, taxas
  da maquininha estimadas, venda sem taxa, o que a operadora vai depositar);
  cada fechamento registrado, "Ainda não fechado", a rede vê todas as
  unidades; CSV.

### Bloco no plano: Caixa

Está no PLANO DE ADAPTAÇÃO, "Bloco: Caixa (recebimentos e fechamento do dia)".

## Financeiro ✅

### Como se decidiu (o Heitor, 2026-11-13)

Como no Caixa, o Claude explicou o uso comum (as cinco perguntas de quem
cuida do dinheiro: como foi o mês, quem me deve, o que eu devo, o extrato,
as comissões) e propôs organizar o que já existe em abas. Sobre o "Conceder
crédito", o Heitor perguntou "Pq precisaria do conceder credito?"; o Claude
explicou (o saldo que a cliente trouxe de fora, e a cortesia ou compensação,
sem dinheiro) e sugeriu levá-lo à ficha. O Heitor: "Blz pode manter e anotar
no plano como voce sugeriu".

### O que faz hoje (levantamento)

Uma página só (`admin-financial-view.tsx`): o período e a unidade; sete
cartões de números; a conta do resultado (competência); o fluxo de caixa dos
próximos meses; as parcelas da operadora; uma lista única de lançamentos com
as ações (marcar pago, receber no cartão, pagar despesa, estornar, cancelar e
devolver parte da venda, recibo, remarcar vencimento); "Novo lançamento"
(receita ou despesa, parcelada, recorrente, com "Contas"); "Conceder
crédito"; o CSV. As comissões em página própria (Financeiro → Comissões).

### Bloco no plano: Financeiro

Está no PLANO DE ADAPTAÇÃO, "Bloco: Financeiro".

## Fidelidade ✅

### O que devia fazer (o Heitor, 2026-11-13)

"Eu acho que ta boa, mas aceito recomendação".

### O que faz hoje (levantamento)

O programa é da rede, nasce desligado e se monta em Configurações →
Fidelidade (`fidelidade-config.tsx`, o catálogo em `fidelidade-catalogo.tsx`).
- **Ganho**: por real pago ou por procedimento (`procedures.loyalty_points`).
  O ponto nasce no PAGAMENTO (`trg_fidelidade_ganho`), e o estorno tira
  exatamente o que aquele pagamento deu.
- **Uso**: desconto no pagamento (valor do ponto, mínimo, teto em %) ou troca
  por recompensa do catálogo (procedimento grátis, desconto em R$ ou %,
  produto, brinde), que vira voucher com validade. A troca é feita pela equipe,
  na ficha.
- **Opcionais, todos desligados**: validade em N meses (com aviso no celular);
  pontos só na unidade em que foram ganhos; bônus de aniversário e de
  primeiro acesso; venda de produto pontuar; a cliente trocar pelo app; o
  prêmio de quem indicou.
- **Na ficha**: o saldo, o extrato, o que vence e os vouchers. Quem tem a
  Fidelidade em Gerenciar ajusta à mão, com motivo.

### Recomendações do Claude (o Heitor, 13/11: "concordo")

- **FD1 — fica como está.** Ganhar por real gasto e trocar por desconto ou
  recompensa é o modelo que as clínicas usam e que a cliente entende sem
  explicação. Os opcionais nascem desligados (princípio 6) e não atrapalham
  quem não usa.
- **FD2 — o uso dos pontos passa pelo PDV** (decorre do PDV1–PDV7, sem
  pergunta): o desconto em pontos e o voucher se aplicam na comanda; o ponto
  nasce quando a comanda é paga; o pacote vendido como produto pontua na
  venda. A tela deixa de dizer "Na recepção, ao confirmar o pagamento" (nome
  de cargo, e o lugar mudou) e passa a dizer "No PDV, ao receber".
- **FD3 — "pontos só na unidade" sai.** A cliente é da rede e qualquer
  unidade a atende (CL3); um saldo separado por unidade contraria isso e
  confunde a cliente ("tenho pontos, mas não aqui"). Com a opção fora, o saldo
  é sempre um só, da rede. Junto sai o que só existia por causa dela: o
  "Onde o bônus pode ser usado" (H10) e a correção pendente C64 (o bônus em
  várias unidades) — com um saldo só, não há o que escolher.

### Bloco no plano: Fidelidade

Está no PLANO DE ADAPTAÇÃO, "Bloco: Fidelidade".

## Prontuário ✅

### O que devia fazer (o Heitor, 2026-11-13)

"pode trazer as fotos pro prontuário e aceito outras recomendações".

### O que faz hoje (levantamento)

Regras em `docs/regras/atendimento.md` §9.4. Onde aparece: a ficha da cliente
(aba Prontuário), a tela do atendimento e, no menu, Planejamento →
Injetáveis.
- **O registro de cada atendimento**: a evolução (texto), a intercorrência e a
  ficha do procedimento (o formulário montado em Configurações → Fichas e
  ligado ao procedimento; a obrigatória barra o Finalizar). Cada atendimento
  da aba diz o dia, o lote que a baixa tirou ("ver em quem o lote foi
  aplicado") e quantas fotos há. Atendimento concluído sem nada escrito
  entra assim mesmo ("Sem evolução registrada").
- **A ficha de saúde (pré-atendimento)**: uma por rede, perguntas sobre a
  pessoa (alergia Sim/Não com detalhe, gestação, medicamentos…), editável em
  Configurações → Fichas. A cliente responde pelo app ou por um link (com CPF
  ou nascimento antes), ou a equipe na clínica. Vale 6 meses (depois, "algo
  mudou?"). O envio ao agendar é da rede e nasce desligado; o "Enviar a
  ficha" está sempre na janela do agendamento. A alergia vira faixa de alerta
  no atendimento, e quem atende é avisada quando a cliente responde.
- **Fotos e anexos clínicos** (exame, laudo, foto, receita): a foto entra pela
  tela do atendimento (antes, durante, depois) e fica na ficha da cliente,
  aba Documentos → Foto clínica. Apagar só marca (fica o rastro). Nada vai ao
  app da cliente sem "Enviar à cliente".
- **Injetáveis**: o mapa do rosto com os pontos e os produtos do estoque; o
  planejamento se faz antes, e a aplicação só se registra dentro do
  atendimento (uma por mapa), ligada à baixa e ao lote.
- **Quem vê**: só quem tem o Prontuário (Ver ou Gerenciar); com "só os
  meus", só as clientes que a pessoa atende, e a tela diz que há o que ela
  não vê. Todo acesso fica registrado, e a lista de quem abriu aparece a quem
  tem o Prontuário em Gerenciar sem unidade fixa. A cliente não vê o
  prontuário no app (só a ficha de saúde pendente e o que a clínica enviar).

### Recomendações do Claude (o Heitor, 13/11: "Concordo com tudo")

- **PR1 — as fotos e os anexos clínicos moram no Prontuário** (o Heitor já
  aprovou as fotos). A foto aparece no atendimento dela, na aba Prontuário; o
  exame, o laudo e a receita sem atendimento ficam numa parte "Anexos
  clínicos" da mesma aba. A aba Documentos fica com o que não é clínico (RG,
  comprovante, "outro"). Quem vê e quem anexa não muda (já é o Prontuário).
- **PR2 — o registro concluído não se reescreve sem rastro.** Hoje o "Editar
  registro" troca o texto da evolução e da ficha, e o de antes some. O que se
  escreve depois vira uma ANOTAÇÃO datada, com o nome de quem escreveu (a
  cliente ligou três dias depois com vermelhidão), e a correção guarda a
  versão de antes, à vista ("editado por X em dd/mm — ver a anterior"). É o
  que os conselhos de saúde pedem do prontuário e o que protege a rede numa
  reclamação.
- **PR3 — um nome só para a ficha de saúde.** A mesma coisa aparece como
  "ficha de pré-atendimento", "ficha de saúde" e "anamnese". Fica "Ficha de
  saúde", que a cliente entende (é ela quem responde).

### Bloco no plano: Prontuário

Está no PLANO DE ADAPTAÇÃO, "Bloco: Prontuário".

## Documentos (termos e contratos) 🟡

### O que devia fazer (o Heitor, 2026-11-13)

Já decidido nos outros módulos (PR4/PR5 de Procedimentos, PC2 e PC7–PC10 de
Pacotes, AG1 da Agenda):
- **No procedimento**: "Termo de consentimento" (opcional), "Contrato"
  (opcional, só vale no atendimento AVULSO) e "outros documentos", quantos a
  rede quiser, de qualquer documento criado ou anexado no sistema.
- **No pacote e no plano**: puxam os termos e os outros documentos dos
  procedimentos (não o contrato deles), e cada um pode ser excluído ali na
  criação; o contrato é o do pacote ou o do plano. O contrato de plano fica
  como está, e nasce o **contrato de pacote**, o equivalente.
- **A sessão de pacote e de plano não pede documento** (assina-se uma vez,
  pelo pacote ou pelo plano).
- **Um link só**: todos os documentos vão à cliente num link único; ela vê
  todos e assina UMA vez, e a assinatura vale para todos.

### O que faz hoje (levantamento)

Regras em `docs/regras/documentos.md` §9.4.1.
- **Modelos** (Configurações → Documentos, quem tem as Fichas em Gerenciar e é
  da rede): três tipos — termo, contrato (do procedimento) e contrato de
  plano (um ativo por rede, trocado por "Tornar ativo") —, cada um com as
  suas variáveis (catálogo fechado). Montado no editor (fontes, tabelas,
  imagens, cabeçalho e rodapé) ou enviado em PDF pronto. Cada mudança no
  texto vira uma versão nova; o modelo não se apaga, desativa.
- **Emissão**: o procedimento liga UM termo e UM contrato. Cada documento
  nasce "ao agendar" ou "no início do atendimento", e "bloqueia o início" sem
  assinatura ou só avisa. Cancelar ou faltar cancela os abertos; trocar o
  procedimento troca os documentos. O contrato que cita o pagamento pede o
  "pagamento combinado" antes de assinar. Faltou dado obrigatório (CPF, o
  responsável da menor): "faltam dados", não assina.
- **Assinatura**: na clínica (o aparelho entregue à cliente, em tela cheia),
  no papel, no app (para quem tem acesso) ou por link (CPF ou nascimento
  antes, uso único, 7 dias, um link por documento; pelo WhatsApp do aparelho
  ou, se a rede ligou, pela conversa). Cada documento se assina à parte. A
  menor de idade: assina o responsável. Dispensar, com motivo, cumpre.
- **Depois**: o PDF assinado com a página de evidências e o QR para conferir
  (`/verificar`, público); no app da cliente, os assinados.
- **A tela Documentos** (menu Atendimento): só leitura, todo documento do
  período com a situação (faltam dados, a enviar, enviado, assinado,
  dispensado, cancelado) e a trilha. Com o Prontuário "só os meus", só os das
  clientes que a pessoa atende.

### Recomendações do Claude (aguardam o Heitor)

Fecham as três perguntas que ficaram de Procedimentos (o que é do contrato de
plano, as variáveis, "quando nasce" e "bloqueia").
- **DC1 — os tipos de documento**: Termo de consentimento, Contrato do
  procedimento (avulso), Contrato de plano, Contrato de pacote (novo) e
  **Documento** (novo: o "outro documento" — uma autorização de uso de
  imagem, um regulamento —, no editor ou em PDF). O tipo diz em que campo o
  documento se liga e quais variáveis ele usa; o "Documento" usa as do termo
  (cliente, responsável, procedimento, rede e unidade, data).
- **DC2 — toda rede nasce com um contrato de pacote padrão**, como já nasce
  com o de plano.
- **DC3 — uma assinatura para todos, em todo canal.** O link único (AG1) e
  também o aparelho entregue na clínica e o app: a cliente vê a lista, abre
  cada um, marca "li e concordo" e assina uma vez. Cada documento continua
  com o seu PDF, a sua evidência e o seu QR — a mesma assinatura em todos.
- **DC4 — "quando nasce" sai: todo documento do atendimento nasce ao
  agendar** (o do pacote e o do plano, na venda/na criação). Com um link só,
  um documento que nascesse depois, no início, pediria outro link e outra
  assinatura; nascendo ao agendar, o link pode ir antes de a cliente chegar.
  "Bloqueia o início ou só avisa" fica, por documento (princípio 1). O
  contrato que cita o pagamento continua pedindo o "pagamento combinado"
  antes (até lá, "faltam dados", e a tela diz).

## O PLANO DE ADAPTAÇÃO

O Heitor, 13/11: "eu quero que os resultados da revisão de cada modulo
constituam um plano de revisão e adaptação do sistema pra se adequar ao que
for revisado aqui. No final da revisão, você vai rodar esse plano e GARANTIR
que o sistema todo funcione."

**Como se monta:** ao fechar cada módulo, o que foi decidido vira um bloco
aqui, com itens numerados (o mesmo número da diferença: E1, E2…). Durante a
revisão, só se escreve o plano. Nada se implementa.

**Como se executa (só no FIM da revisão, quando o Heitor mandar):**
1. Item por item, na ordem dos blocos, respeitando as dependências marcadas.
2. Cada item segue o TDD: o teste nasce antes, é visto falhando, depois vem o
   código. A regra do módulo em `docs/regras/` é reescrita com as palavras do
   Heitor anotadas aqui. Teste que existe e contraria a decisão muda, porque a
   regra mudou; ele é citado no commit.
3. **O dado gravado não importa** (o Heitor, 13/11: "Não se preocupa com o
   que já está gravado, porque a gente vai fazer um wipe total do banco de
   dados antes do lançamento"). Nada de migrar, converter ou preservar dado
   antigo (os fornecedores que viram marcas, as "Unidade: X" gravadas…): o
   plano muda o esquema e o código, sem backfill. A mudança destrutiva no
   banco continua avisada ao Heitor antes de aplicar.
4. **"O sistema todo funciona"** quer dizer, no fim, tudo verde:
   - typecheck e lint;
   - o vitest inteiro;
   - a suíte E2E completa contra o build (GitHub Actions);
   - um passeio pelas telas de cada módulo revisado, conferindo o que o
     Heitor disse que devia fazer.
   Falha não fica para trás: corrige-se e roda-se de novo até passar.

### Bloco: Estoque

| # | O que muda | Depende de |
|---|---|---|
| E1/E5 | A lista que hoje se chama "Fornecedores" vira **Marcas**. Cadastro de **Fornecedores** novo, igual ao de marcas (texto livre) | — (sem migrar dado: o banco será zerado antes do lançamento) |
| E4/E5 | Categorias, marcas e fornecedores: criar, renomear, excluir. Quem pode: quem tem o Estoque em **Gerenciar**, e só isso (ser da rede deixa de contar). Hoje categoria não renomeia | — |
| E6/E3 | Categoria, marca e fornecedor escolhidos numa lista **com campo de busca e autocomplete** | — |
| E2 | "Onde está disponível": **checkbox** Insumo e Venda direta, no lugar de Insumo / Revenda / Os dois | — |
| E10 | O cadastro do produto **não tem** marca nem fornecedor. Sai o "fornecedor de costume" e sai o segundo fornecedor do estoque inicial | E1/E5 |
| E11 | Estoque inicial como está (lote, validade, nota, custo, observações), **dividido entre as unidades** | E13 |
| E14 | A **Entrada** (e o estoque inicial) pede **marca e fornecedor** | E1/E5 |
| E15 | Filtros da tela: **categorias, marca, fornecedores**. Marca e fornecedor mostram os produtos que têm alguma entrada daquela marca ou fornecedor | E14 |
| E13 | **Quem cadastra produto:** quem tem o Estoque em Gerenciar. Sai a regra "catálogo só da rede × as unidades também". Quem é de uma unidade só: a unidade vem preenchida e travada. Quem é de mais de uma: a lista mostra só as unidades dela | **Equipe** (a pessoa em mais de uma unidade) |
| — | Mantém: nome, SKU automático, código de barras (digitado ou leitor), categoria, embalagem (lista fixa), conteúdo da embalagem, preço e comissão de venda, estoque mínimo, aviso de nome repetido. A tela geral do estoque, a saída no atendimento, a transferência entre unidades, a perda, o ajuste, os lotes, a validade e o aviso de mínimo | — |

### Bloco: Procedimentos

| # | O que muda | Depende de |
|---|---|---|
| PR1/PR6 | Categorias de procedimento (criar, renomear, arquivar) **e** o próprio procedimento (criar, editar, ativar/desativar): quem tem Procedimentos em **Gerenciar**, e só isso. Sai a exigência de ser da rede (`assertRede`, `quemGerencia`) | — |
| PR2 | "Visível no app do cliente" → **"Permitir auto agendamento"** (o rótulo e a dica) | — |
| PR3 | "Ficha" → **"Ficha de atendimento"**, a mesma lista | — |
| PR4 | (Revisto no PC7) Mantém o campo **"Termo de consentimento"** e o campo **"Contrato"** (este só no atendimento avulso) e acrescenta **"outros documentos"**: quantos quiser, de qualquer documento criado ou anexado no sistema | PC8; a revisão de **Documentos** |
| PR5 | (Revisto no PC7) Termo e contrato continuam papéis específicos; o que muda nos documentos fica para a revisão de Documentos | a revisão de **Documentos** |
| — | Mantém: a tela, nome, categoria, duração, pontos de fidelidade, descrição, unidades, salas, insumos, quem realiza, comissão | — |

### Bloco: Pacotes (e os documentos de procedimento, pacote e plano)

| # | O que muda | Depende de |
|---|---|---|
| PC1 | O preço do pacote **já vem com a soma** dos procedimentos adicionados (sessões × preço de tabela) e pode ser alterado. Hoje nasce vazio | — |
| PC6 | Criar e editar pacote: quem tem Procedimentos em **Gerenciar**, e só isso (sai a exigência de ser da rede) | — |
| PC7/PC8 | **No procedimento:** "Termo de consentimento" (opcional), "Contrato" (opcional, só no atendimento AVULSO) e "Outros documentos" (opcional, quantos quiser, qualquer documento criado ou anexado no sistema) | a revisão de **Documentos** |
| PC9a | **Contrato de pacote**, novo: o equivalente do contrato de plano, um modelo da rede à parte, preenchido com os procedimentos, as sessões e o pagamento de cada pacote vendido. O contrato de plano fica como está | a revisão de **Documentos** (as variáveis do pacote) |
| PC2/PC7 | **Na venda do pacote,** a cliente assina UMA vez: o contrato de pacote e os documentos puxados que ficaram (PC9b/PC10). As sessões do pacote não emitem documento de novo. Hoje cada sessão emite o termo e o contrato do procedimento | PC7, PC9a |
| PC9b/PC10 | **No pop-up de criação do pacote e do plano,** logo abaixo da parte do termo e do contrato: os documentos puxados dos procedimentos (o termo de cada procedimento diferente e os outros documentos deles; o contrato do procedimento NÃO), cada um com excluir | PC7; **Plano de tratamento** |
| PC10 | **Um link só, uma assinatura:** os documentos do pacote ou do plano vão à cliente num link único, e uma assinatura assina todos de uma vez. Hoje é um link por documento e uma assinatura por documento | a revisão de **Documentos** |
| — | Mantém: nome, procedimentos e sessões de cada um, validade em dias, "À venda", comissões de venda e de execução, Vendas → Pacotes (não aparece no Estoque) | — |

### Bloco: Tags (o sistema inteiro)

| # | O que muda | Depende de |
|---|---|---|
| T1 | Sai o gatilho `trg_appointment_unit_tag` ("Unidade: X" a cada agendamento) e toda leitura da tag como unidade: campanhas e automações por unidade, novas clientes por unidade, "Reativar", a lista de Clientes da unidade, o Agendar (`unidadeDaTag`) | o que entra no lugar de "a unidade" nessas telas: revisão de **Clientes**, **Agenda**, **Marketing**, **Automações**, **Relatórios** |
| T2 | A conversa nascida de anúncio não ganha tag da origem | — |
| T3 | A Importação não transforma a coluna "Origem" em tag | — |
| T4 | A ação de automação vira **"Adicionar tag"**, com qualquer tag registrada no sistema | **Automações** |
| — | Uma trava (teste) de que nenhum caminho do sistema grava tag sem ser a pessoa ou a ação "Adicionar tag" que a rede montou | — |

### Bloco: Agenda

| # | O que muda | Depende de |
|---|---|---|
| AG1 | **Documentos sempre num link só:** todo envio de documentos à cliente (o atendimento avulso, o pacote, o plano) vai num link único; ela visualiza todos e assina UMA vez, e a assinatura vale para todos os documentos do link. Hoje: um link e uma assinatura por documento | PC10; a revisão de **Documentos** |
| AG2 | **O "Agendar" do inbox** tem uma caixa de seleção da unidade, simples. Sai a unidade escolhida pela tag "Unidade: X" (`unidadeDaTag`, `inbox-lead-panel.tsx`) | T1 |
| — | Mantém: a tela da agenda e as funções. Ficam como estão, pelas regras já existentes: D20 (Gerenciar com "só os meus" remarca o próprio), H3 (a remarcação e a confirmação), a sessão de pacote e de plano sem documento (PC2), o "Atende" por unidade | **Equipe** (a pessoa em mais de uma unidade) |

### Bloco: Clientes

| # | O que muda | Depende de |
|---|---|---|
| CL1 | Sai a unidade da coluna esquerda (a cliente é da rede) | — |
| CL2 | Sai o filtro "Unidade" da lista e o contador de ativas por unidade | T1 |
| CL3 | **O portal da unidade vê todas as clientes da rede** (sai `getCachedBranchClients` pela tag; a busca "fora da unidade", A17 da 8ª, deixa de existir). Pela mesma regra, a "última visita" da lista é a da cliente na rede, não só naquela unidade | T1 |
| — | Mantém: a página, a ficha e as abas | — |

### Bloco: Vendas e PDV

| # | O que muda | Depende de |
|---|---|---|
| PDV1 | **O PDV**: a tela de vender e de controlar as vendas e os pagamentos. Todo pagamento de venda passa por ele, seja do que for | o desenho da tela, mostrado ao Heitor antes de implementar |
| PDV2 | **Uma venda, uma comanda**: o atendimento avulso, o pacote, o plano, a venda de produto — cada um na sua comanda | PDV1 |
| PDV3 | **Iniciar o atendimento** (clicar no horário na agenda e iniciar, por quem tem a permissão) gera a comanda e o atendimento de quem vai atender. Pagar antes ou depois é só a ordem do trabalho. Agendar, confirmar e remarcar não geram comanda; falta e cancelamento não têm comanda | PDV2 |
| PDV4 | **Plano de tratamento**: a comanda nasce ao iniciar o PRIMEIRO atendimento do plano. Sai o "Fechar checkout" como porta de pagamento | PDV2; **Plano de tratamento** |
| PDV5 | **Pacote**: vendido como um produto, na hora, pelo PDV | PDV2 |
| PDV6 | **Produto**: o PDV vende o que está marcado como Venda direta | E2 |
| PDV7 | Sai o **"Vender" da ficha**; o do **inbox** leva ao PDV. Sai a cobrança da conclusão do atendimento como porta própria (vira a comanda) | PDV1–PDV3 |
| — | Mantém, dentro da comanda: as formas de pagamento (à vista, entrada + parcelas, a receber, cartão em N vezes), o desconto, "Quem vendeu", o estorno e a devolução, as comissões | — |

### Bloco: Caixa (recebimentos e fechamento do dia)

A regra: **o que a cliente paga na frente de quem está no balcão passa pelo
PDV; o resto é do Financeiro.**

| # | O que muda | Depende de |
|---|---|---|
| CX1 | **O PDV recebe** toda comanda e também a **parcela do crediário** que a cliente veio pagar: abrir a cliente no PDV mostra as parcelas em aberto dela, e recebe-se ali | PDV1–PDV3 |
| CX2 | **O Financeiro** tem a lista de tudo que falta receber, de todas as clientes, e dá baixa só no que entra sem passar pelo balcão (a transferência que caiu na conta) | — |
| CX3 | Os **"Concluídos a receber"** viram as **comandas abertas** do PDV (sai a lista à parte na agenda, no Fechamento e na ficha) | PDV3 |
| CX4 | **O Fechamento do dia mora no PDV** ("Fechar o dia"): uma linha por forma de pagamento, **o que o sistema registrou × o que foi conferido**; o fundo de troco segue opcional na linha do dinheiro | PDV1 |
| CX5 | **Os avisos do Fechamento** ficam dois: **"há comanda aberta"** e **"entrou dinheiro depois do fechamento"**. "Por quem recebeu" e os estornos do dia ficam como detalhe recolhido | CX4 |
| CX6 | **Vão para o Financeiro:** as taxas da maquininha estimadas, o que a operadora ainda vai depositar, a venda sem taxa cadastrada e a planilha da contadora (o CSV) | CX4 |
| — | Mantém: cada fechamento registrado (vale o mais recente), "Ainda não fechado", a rede vendo o dia de todas as unidades. Sem "abrir caixa" e sem sangria (se um dia a unidade trabalhar com muito dinheiro vivo, entra como opção) | — |

### Bloco: Financeiro

Nada de recurso novo: o que já existe, organizado pelas cinco perguntas de
quem cuida do dinheiro.

| # | O que muda | Depende de |
|---|---|---|
| FI1 | **Abas**: Resumo · A receber · A pagar · Movimentações · Comissões. Abre no Resumo | — |
| FI2 | **Resumo**: o período escolhido — entrou, saiu, resultado; embaixo, o que vem pela frente (a receber e a pagar dos próximos meses, o fluxo de caixa) | FI1 |
| FI3 | **A receber**: das clientes (as atrasadas primeiro, com "remarcar vencimento") e da operadora do cartão (o que ela ainda vai depositar, vindo do Fechamento — CX6). A baixa do que entrou sem passar pelo balcão (CX2) | FI1, CX2 |
| FI4 | **A pagar**: as despesas — lançar (avulsa, parcelada, recorrente, com as Contas), pagar, o que vence | FI1 |
| FI5 | **Movimentações**: o extrato com filtro; o estorno, o recibo, a devolução e o cancelamento de venda, o CSV da contadora; como aviso, as taxas da maquininha estimadas e a venda sem taxa cadastrada (vindos do Fechamento — CX6) | FI1, CX6 |
| FI6 | **Comissões**: como hoje, como aba | FI1 |
| FI7 | **"Conceder crédito" vai para a ficha da cliente**, aba Financeiro, para quem tem o Financeiro em Gerenciar (como o "Trazer pacote de fora"). No topo do Financeiro fica só o "Novo lançamento" | — |
| — | Mantém: o período, o filtro de unidade na rede, quem vê o quê pelas permissões. Fora, por ser mais do que uma clínica pequena precisa: conciliação com o extrato do banco e plano de contas contábil completo | — |

### Bloco: Fidelidade

O programa fica como está (FD1); muda onde o ponto se usa e sai o saldo por
unidade.

| # | O que muda | Depende de |
|---|---|---|
| FD2a | **O desconto em pontos e o voucher se aplicam na comanda do PDV** — os dois caminhos que hoje existem fora dele (o pagamento do atendimento, a troca na ficha que vira desconto) passam a ser o PDV | PDV1–PDV7 |
| FD2b | **O ponto nasce quando a comanda é paga**, pela regra que já existe (por real ou por procedimento; o pacote vendido como produto pontua na venda; o produto pontua se a rede ligou). O estorno da comanda tira o que ela deu | PDV1 |
| FD2c | **A tela de Configurações → Fidelidade** diz "No PDV, ao receber" no lugar de "Na recepção, ao confirmar o pagamento" | — |
| FD3 | **Sai "pontos só na unidade"**: o saldo é sempre um, da rede. Saem junto a escolha "Onde o bônus pode ser usado" e a C64. A coluna e o saldo por unidade no razão dos pontos saem das funções e da tela (banco zerado: não há saldo a migrar) | — |
| — | Mantém: ganho por real ou por procedimento, o catálogo e os vouchers, o ajuste com motivo, a validade, os bônus, o prêmio da indicação, a troca pelo app — todos opcionais e desligados ao nascer | — |

### Bloco: Prontuário

| # | O que muda | Depende de |
|---|---|---|
| PR1a | **A foto do atendimento aparece no atendimento dela, na aba Prontuário** (miniatura que abre grande, o momento — antes/durante/depois —, "Enviar à cliente"/"Tirar do app"). Sai o "2 fotos em Documentos → Foto clínica"; o cartão vazio da tela do atendimento diz que a foto fica no prontuário | — |
| PR1b | **"Anexos clínicos" na aba Prontuário**: exame, laudo, receita, foto e termo anexado sem atendimento — anexar, ver, apagar (só marca), enviar à cliente. A aba Documentos fica com o anexo comum (RG, comprovante, "outro"); o aviso de "anexos clínicos que o seu cargo não abre" vai junto | — |
| PR2a | **Anotação depois do atendimento**: no atendimento concluído, "Acrescentar anotação" (quem tem o Prontuário em Gerenciar, com o alcance de hoje) grava um texto datado com o nome de quem escreveu (o do ctx, com a marca "via suporte"), que não se edita nem se apaga. Aparece no atendimento, na aba Prontuário, na ordem do tempo | — |
| PR2b | **A correção guarda a versão de antes**: o "Editar registro" grava, antes de trocar, o que estava (evolução, intercorrência, ficha do procedimento), com quem e quando; o atendimento diz "editado por X em dd/mm — ver a anterior". Só o servidor grava; a versão não se altera (gatilho), como os acessos | — |
| PR2c | **O pacote LGPD leva as anotações e as versões** | PR2a, PR2b |
| PR3 | **"Ficha de saúde" em toda tela, mensagem e aviso** (a equipe, o app, o link, Configurações → Fichas, o Copilot): sai "pré-atendimento" e "anamnese" do texto que se lê. O nome no código e no banco fica | — |
| — | Mantém: o registro de cada atendimento (evolução, intercorrência, ficha do procedimento, o lote), a ficha de saúde e o envio dela, os injetáveis, quem vê e o registro de quem abriu | — |

## O que já estava pendente, para entrar no módulo dele

Não foi decidido. Cada item entra na revisão do módulo indicado.

**Tags (Clientes / CRM): a regra H16.** As palavras do Heitor, de 13/11, são
estas duas:
- "o cliente não é da unidade, o cliente é da rede. Se a rede quiser ela pode
  colocar um tag pra ajudar a filtrar";
- "não existem tags de unidade, existem tags, a rede cria a tag que quiser e
  usa elas como filtro depois, do que quiser, com nome que quiser. Não
  complica".

O bloco "Não existe tag de unidade" em `docs/regras/crm-inbox.md` foi escrito
pelo Claude e vai ALÉM dessas palavras. São leituras do Claude, ainda NÃO
confirmadas pelo Heitor:
- as "Unidade: …" já gravadas ficam como tags comuns;
- `clients.branch_id` não volta;
- onde a unidade importa, vale "a cliente atendida naquela unidade";
- a lista de Clientes da unidade é a da rede.

Também ainda não está feito: o gatilho que cria a tag "Unidade: X" e todas as
leituras da tag como unidade continuam no sistema (campanhas, automações,
novas clientes por unidade, Reativar, lista de Clientes da unidade, Agendar).

**Da F75 (Agenda, Caixa, Financeiro)**, decidido pela frente e não pelo Heitor:
- D7 vale na tela do Fechamento? Hoje a recepção vê "Taxas da maquininha no dia".
- D20: quem tem "só os meus" e Gerenciar remarca o próprio atendimento? A F75
  pôs o "Remarcar", e a regra escrita fala só de cancelar e marcar falta.
- A26: "Novas clientes" por unidade ainda contam pela tag "Unidade: X", contra a H16.
- A política antiga "Operacional acessa financeiro da filial" ficou sem efeito.
  Apagar ou não é decisão do Heitor.
- O CSV do Fechamento põe a maquininha na coluna "Forma".
- O crediário sem entrada não pede o meio de pagamento.
- A frase "o fechamento é por unidade" aparece só com mais de uma unidade.
- ~~C64: o bônus da fidelidade usado em várias unidades~~ — sai com o FD3 (o saldo é um só, da rede).

**Parado, esperando a revisão:**
- a F77, que implementaria a H16 no código;
- a F76, as falhas da completa (execução 43326349069 do GitHub Actions);
- o teste "dois cliques fecham uma vez" (comissões), que falha no `next dev` e
  passa no build.
