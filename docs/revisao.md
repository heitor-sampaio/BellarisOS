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
workflow, nenhuma mudança de código. Corrigir os itens vem depois, quando o
Heitor mandar.

**Estado:** ⬜ não começado · 🟡 em revisão · ✅ revisado

## Vocabulário (o primeiro item, 2026-11-13) ✅

O Heitor:
- "rede é o conjunto de unidades, unidade é uma unidade que pertence a rede"
- "Clinica é a mesma coisa que rede e não deve existir no sistema."
- "Filial sai de vez."

Anotado no CLAUDE.md, §1, em "Vocabulário".

| # | Diferença | Estado |
|---|---|---|
| V1 | "Clínica" aparece nas telas (inclusive no portal e no app da cliente: "Crédito na clínica", "Telefone da clínica"), na política de privacidade, nas regras (`docs/regras/`) e no CLAUDE.md | aberto |
| V2 | "Filial" aparece no CLAUDE.md ("Portal Web Filial"), nas regras e em nomes internos do código (`filial`, `trocarFilial…`). Nas telas, a palavra é "unidade" | aberto |

## Os módulos

A lista é a do próprio sistema: os 18 módulos da tela de Cargos e as
superfícies em volta. A ordem é do Heitor.

| Módulo | No sistema | Estado |
|---|---|---|
| Agenda | `agenda` | ⬜ |
| Clientes (ficha, tags, LGPD) | `clients` | ⬜ |
| Fidelidade | `loyalty` | ⬜ |
| Prontuário | `medical_records` | ⬜ |
| Documentos (termos e contratos) | `documents` | ⬜ |
| CRM (inbox, oportunidades, funis) | `crm` | ⬜ |
| Procedimentos e pacotes | `procedures` | ⬜ |
| Marketing (campanhas) | `marketing` | ⬜ |
| Automações | `automations` | ⬜ |
| Caixa (Vender, recebimentos, fechamento do dia) | `cashier` | ⬜ |
| Financeiro (lançamentos, taxas, comissões) | `financial` | ⬜ |
| Estoque | `stock` | 🟡 |
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

## Estoque 🟡

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
- C64: o bônus da fidelidade usado em várias unidades ficou de fora (Fidelidade).

**Parado, esperando a revisão:**
- a F77, que implementaria a H16 no código;
- a F76, as falhas da completa (execução 43326349069 do GitHub Actions);
- o teste "dois cliques fecham uma vez" (comissões), que falha no `next dev` e
  passa no build.
