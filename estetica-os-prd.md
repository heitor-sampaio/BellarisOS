# PRD — BellarisOS
**Product Requirements Document**
Versão 2.1 | 1 de outubro de 2026

---

## Histórico de versões

| Versão | Data | Alteração |
|---|---|---|
| 1.0 | Jun/2026 | Versão inicial ("EstéticaOS") |
| 1.1 | Jun/2026 | App mobile (admin + cliente), monorepo, persona Cliente App |
| 2.0 | 28/09/2026 | Reescrito contra o sistema como ele é. O público deixou de ser "rede de 2–5 filiais" e passou a ser a clínica única; o produto passou de gestão financeira a ERP + CRM (conversas, funil, automações, marketing); saíram o caixa de abrir/fechar, o agendamento público sem login, os cargos fixos, o Prisma e o app em Expo |
| 2.1 | 01/10/2026 | O que entrou em 29–30/09: vendas (pacote e procedimento pré-pago, desconto, agendar com o que já foi pago), termos e contratos com assinatura eletrônica, comissões por profissional com fechamento, fidelidade completa, cada parcela um lançamento, e o WhatsApp oficial pelo cadastro incorporado da Meta (Tech Provider) |

> **Este documento diz O QUE o produto é e por quê.** As regras técnicas de
> implementação moram no `CLAUDE.md`; o que foi feito, quando e o que está em
> aberto, no `DEVLOG.md`. Quando os três divergirem, o código manda e os
> documentos se corrigem.

---

## 1. Visão geral

### 1.1 Problema

A clínica de estética opera o dia inteiro com uma colcha de ferramentas: agenda
em papel ou num app genérico, prontuário em ficha, conversas com clientes
espalhadas no WhatsApp do celular da recepção, estoque no caderno e o
financeiro numa planilha. A consequência é horário perdido, lead que pergunta
e ninguém responde, insumo que acaba na hora de aplicar, produto que vence na
prateleira e nenhuma visão real do que entra e do que sai.

### 1.2 Solução

BellarisOS é o **ERP + CRM da clínica de estética** — a ferramenta em que ela
opera o dia inteiro: agenda, prontuário, clientes, conversas, funil comercial,
estoque, marketing e financeiro. O financeiro é uma parte, não o centro.

**O cliente típico tem UMA unidade.** Multiunidade existe no modelo (tudo
carrega rede e unidade, e o portal da rede consolida), mas é exceção: rede
grande costuma ser franquia, e franquia já chega com sistema próprio. Na
dúvida, o produto otimiza para a clínica única — sem tornar a segunda unidade
impossível.

Superfícies:

- **Portal da rede** (`/admin`) — a clínica inteira; é onde a clínica única
  opera, e onde uma rede consolida as unidades.
- **Portal da unidade** (`/[slug]`) — a operação de uma unidade, para quem tem
  unidade fixa.
- **Portal do cliente final** (`/[slug]/cliente`) — agendamento
  self-service, histórico, financeiro e dados pessoais (LGPD).
- **App Android** — o portal web dentro de um app nativo (Capacitor), com
  notificações push. Não há app iOS nem app com código próprio.

A assinatura é por rede (a clínica), cobrindo todas as unidades.

### 1.3 Proposta de valor

- Uma ferramenta só para o dia inteiro da clínica, no computador e no celular.
- Nenhuma conversa perdida: WhatsApp (um ou vários números), Instagram e
  Messenger numa caixa de entrada só, ligada à pessoa e ao funil.
- O anúncio que trouxe o cliente é rastreado até a venda, e a venda volta para
  a Meta (API de Conversões).
- O que acontece vira fato, e a clínica monta automações sobre esses fatos sem
  depender de desenvolvedor.
- Números em que se pode confiar: todo indicador vem de uma definição única,
  calculada no banco.

---

## 2. Objetivos e métricas

### 2.1 Objetivos de negócio

As metas numéricas da v1.1 (30 redes, 100 filiais, MRR de R$ 30.000) foram
escritas para o público antigo (redes de filiais) e **precisam ser redefinidas**
para a clínica única. Até lá, o que se acompanha:

- Clínicas ativas e unidades gerenciadas
- Clientes finais com acesso ao portal/app
- MRR e churn mensal
- NPS

### 2.2 Métricas de produto

- Agendamentos criados no sistema (equipe, CRM e self-service) × fora dele
- Conversas respondidas e tempo de primeira resposta no inbox
- Leads que viram agendamento, e agendamento que vira atendimento (funil
  comercial, medido por `source = COMMERCIAL`)
- Receita atribuída a anúncio (Meta Ads / Google Ads)
- % de atendimentos com a ficha do procedimento preenchida
- % de unidades com estoque movimentado na semana
- Uso por perfil (equipe e cliente final)

---

## 3. Personas

### 3.1 Dona da clínica
**Perfil:** empresária, muitas vezes também profissional da clínica. Uma unidade
na maioria dos casos.
**Dores:** não sabe o faturamento real nem de onde vêm os clientes; o
atendimento no WhatsApp depende de uma pessoa e um celular.
**Ganhos:** dashboard com números confiáveis, relatórios por aba, atribuição de
anúncio até a venda, controle de quem vê o quê (cargos).

### 3.2 Gerente de unidade (quando há mais de uma)
**Perfil:** opera uma unidade de uma rede.
**Ganhos:** o portal da própria unidade — e só dela: não age nem lê o que é de
outra unidade.

### 3.3 Recepção
**Perfil:** agenda, faz check-in, recebe o pagamento.
**Ganhos:** agenda rápida, sessão de atendimento, checkout de plano, recebimento
com as formas de pagamento da clínica.

### 3.4 Profissional
**Perfil:** executa os procedimentos; pode ver só a própria agenda.
**Ganhos:** agenda do dia, prontuário e ficha do procedimento no atendimento,
planejamento de tratamento e mapa de injetáveis, comissão.

### 3.5 Comercial / SDR
**Perfil:** responde leads, qualifica e agenda avaliação.
**Ganhos:** inbox omnichannel, funil de oportunidades, agendamento pelo CRM,
escopo "só os meus leads" configurável.

### 3.6 Financeiro
**Perfil:** lança, confere e concilia.
**Ganhos:** financeiro por período, unidade e forma de pagamento; estorno;
parcelas; relatórios.

### 3.7 Cliente final
**Perfil:** cliente da clínica, acostumado a resolver pelo celular.
**Ganhos:** agenda sozinho os procedimentos que a clínica libera, vê histórico
e financeiro, confirma e avalia o atendimento, pede a exportação dos próprios
dados.

---

## 4. Escopo

### 4.1 Agenda
- Agenda por profissional e por sala; status `Agendado → Confirmado → Em
  atendimento → Concluído`, além de `Cancelado` e `Não compareceu`.
- **Todo agendamento tem procedimento** — a avaliação é um procedimento como
  outro qualquer.
- Origem registrada: equipe (`INTERNAL`), cliente pelo portal (`CLIENT_APP`),
  time comercial pelo CRM (`COMMERCIAL`).
- **Não existe agendamento público sem login.** Só a equipe autenticada, ou o
  cliente logado — e ele só vê os procedimentos que a clínica marca como
  disponíveis para o cliente.
- Profissional e sala não podem ter dois agendamentos no mesmo horário.
- Cancelamento exige motivo; remarcação e troca de profissional ficam no
  histórico.
- Sessão de atendimento: check-in, início, ficha do procedimento, fechamento
  com baixa de insumos, comissão e pacote.

### 4.2 Clientes
- Cadastro com CPF único por rede; o **cliente é da rede** (pode frequentar
  qualquer unidade).
- Histórico, documentos, crédito interno, pacotes, procedimentos pré-pagos e
  planos.
- **Fidelidade** (a clínica liga e configura): pontos no pagamento, por real ou
  por procedimento; desconto em pontos na recepção; recompensas trocadas por
  vouchers; validade; bônus de aniversário e de primeiro acesso; troca pelo
  portal, se a clínica quiser.
- Acesso do cliente final: a clínica cria no cadastro (e-mail + senha inicial).
- **LGPD:** o titular pede a exportação dos dados no portal; o pacote sai em PDF
  (legível) e JSON (portabilidade), com o prontuário só se liberado por quem
  cuida do prontuário. A exclusão NÃO é oferecida: conflita com a guarda legal
  de prontuário e de registros fiscais.

### 4.3 Conversas (inbox omnichannel)
- WhatsApp — **vários números por clínica**, cada um pelo provedor que ela
  escolher: uazapi (não oficial) ou API oficial da Meta (coexistência com o app
  do celular ou Cloud API). Instagram e Messenger pela Meta.
- O número oficial se conecta pelo **cadastro da Meta** dentro do sistema: a
  clínica entra com o Facebook, escolhe a conta e o número, e volta com tudo
  pronto. Na coexistência, as conversas e os contatos do aplicativo vêm junto,
  e o que a equipe responde pelo celular aparece no inbox.
- A **pessoa** (contato) une as conversas: a mesma pessoa em duas caixas são
  duas conversas na fila, e o painel mostra as outras conversas dela.
- Por onde a mensagem sai tem regra explícita (o número de quem responde, senão
  o da conversa, senão o padrão da clínica), e a janela de 24h da API oficial é
  medida na caixa que envia.
- Templates aprovados da Meta, mídia, edição de mensagem.
- Quem vê o quê: escopo "só os meus" (pela pessoa ou pela conversa — escolha da
  clínica) e quais números cada cargo enxerga.

### 4.4 CRM — funil de oportunidades
- Funis e etapas configuráveis; oportunidade é da **pessoa**.
- Origem do lead derivada da atribuição (Meta Ads, Google Ads, orgânico) ou
  escolhida à mão.
- Agendamento pelo CRM (nasce `COMMERCIAL`), histórico de cada oportunidade.
- **Oportunidade não se apaga** (2026-09-28): a que não vai adiante é marcada
  como perdida, e o histórico fica.

### 4.5 Automações e eventos
- Cada ação relevante vira um **fato** nomeado pela intenção
  (`agendamento.nao_compareceu`, `pagamento.recebido`…), com retenção de 30
  dias.
- Automação é um grafo montado na tela: gatilho por fato ou por tempo
  (intervalo ou relógio), condições, ações (mandar mensagem, mover etapa,
  definir responsável, anotar, marcar ganho/perdido…), com variáveis e
  expressões. Histórico de versões e ensaio antes de ativar.
- **Campanha ≠ automação:** campanha é disparo em massa por público; automação é
  reação a um fato.

### 4.6 Marketing
- Integração com Meta Ads e Google Ads: campanhas e métricas na tela de
  marketing.
- API de Conversões da Meta: agendamento e venda voltam para a campanha que
  trouxe o cliente.
- Notificações e campanhas para clientes (push e WhatsApp).

### 4.7 Procedimentos
- Catálogo da rede com disponibilidade e preço por unidade.
- Insumos consumidos por execução (base da baixa de estoque).
- Histórico de preço.
- **Uma ficha por procedimento**, montada no construtor de fichas.
- Cada procedimento liga até um termo e um contrato (ver Prontuário).

### 4.7.1 Vendas
- Um botão **"Vender"** na ficha do cliente e no inbox (para quem ainda não é
  cliente, primeiro o cadastro): **pacote** — um conjunto de procedimentos por
  um preço só — ou **procedimento pré-pago** — N sessões de um procedimento,
  pagas antes. Os dois são separados.
- Pagamento à vista, entrada + parcelas ou a receber; **desconto em toda venda**
  (R$ ou %), registrando quem deu.
- Agendar usando o que já foi pago, com o procedimento e o preço daquilo.
  Falta ou cancelamento devolvem a sessão; cancelar a sessão pré-paga registra a
  devolução do dinheiro a fazer.

### 4.8 Prontuário
- Anamnese geral do cliente (uma vez) e a ficha de cada procedimento
  (por atendimento).
- Fotos antes/durante/depois.
- **Termos e contratos**: a clínica monta os modelos (editor com fonte, tabela,
  imagem e variáveis) ou envia um PDF pronto. O documento nasce no
  agendamento ou no checkout do plano, e o cliente assina na clínica, no
  portal, por link (com conferência do CPF) ou no papel. Sai um PDF assinado
  com código de verificação pública; o que bloqueia impede o atendimento de
  começar.
- Planejamento de tratamento com checkout e aceite; mapa de injetáveis com
  registro de aplicação.
- O cliente final NÃO vê o prontuário — só o histórico de procedimentos.

### 4.9 Estoque
- Produtos da rede; **saldo por unidade**, com rendimento (unidade de consumo:
  ml, UI) quando o produto tem.
- Entrada (compra), ajuste, transferência entre unidades (imediata) e baixa
  automática no fechamento do atendimento.
- **Lote e validade por unidade**: a saída baixa o lote que vence primeiro,
  entre os ainda válidos; a transferência leva o lote junto; cada baixa diz de
  qual lote saiu (2026-09-28).
- Insumo faltando **não impede** fechar o atendimento: o saldo fica negativo e a
  falta aparece.
- Alertas de estoque mínimo e de validade próxima.

### 4.10 Financeiro
- **Não existe caixa de abrir e fechar** — a clínica opera em Pix e cartão; a
  conferência do dia é a própria tela do financeiro (período, unidade, forma).
- A receita do atendimento nasce no **recebimento**, na recepção.
- Formas: dinheiro, Pix, débito, crédito (com parcelas) e crédito interno — que
  desconta do saldo do cliente e é recusado sem saldo.
- Estorno por contra-lançamento (registro financeiro não se apaga); estornar um
  pagamento feito com crédito devolve o crédito.
- **Cada parcela é um lançamento**, no mês do seu vencimento.
- Despesas e contas a receber.
- **Comissões**: regra por profissional, com exceção por procedimento; a
  clínica escolhe se nasce no atendimento (sobre o preço) ou no pagamento
  (sobre o recebido), e se desconta insumos e taxa da maquininha. Fechamento
  por período (mensal, quinzenal ou semanal), que vira despesa; cada
  profissional vê as próprias.

### 4.11 Relatórios e indicadores
- Dashboard da rede e da unidade; relatórios por aba, e cada cargo vê só as abas
  liberadas.
- Toda conta é feita no banco, a partir de uma definição única por indicador
  (receita recebida, ticket médio, ocupação, retenção…) — a tela não soma nada.

### 4.12 Equipe, cargos e permissões
- **Cargos criados pela clínica** — não há cargos fixos. Cada cargo define, por
  módulo (15), o nível (nenhum / ver / gerenciar) e, onde se aplica, o escopo
  (os meus registros / todos).
- A **abrangência** é do membro: da rede (todas as unidades) ou de uma unidade
  fixa, e quem tem unidade fixa só age nela.
- Membro desativado perde o acesso na hora, inclusive a sessão aberta.

### 4.13 Portal do cliente e app
- Agendamento self-service, histórico, financeiro, confirmação e avaliação do
  atendimento, perfil e pedido de dados (LGPD).
- Notificações: web push no navegador e push nativo (FCM) no app Android.

---

## 5. Arquitetura (resumo)

- Monorepo Turborepo: `apps/web` (Next.js 16), `apps/native` (Capacitor,
  Android), `packages/types`, `packages/validators`, `packages/utils`.
- Supabase: Postgres + Auth + Storage. Acesso pelo cliente Supabase
  (PostgREST); sem ORM.
- Isolamento: todo dado operacional carrega rede e unidade; a RLS confere a
  **rede** como segunda linha de defesa, e as regras de módulo, escopo e
  unidade moram nas actions.
- Regras que nascem em vários lugares moram em **gatilho no banco** (eventos de
  pagamento e de estoque, crédito interno, lotes, ligação conversa → pessoa).
- Deploy web no Railway (Docker), com dois serviços de cron (hora em hora e
  5 em 5 minutos).

Detalhe em `CLAUDE.md`.

---

## 6. Requisitos não funcionais

### Segurança
- Autenticação Supabase (JWT) para equipe e cliente final; o cliente só alcança
  os próprios dados.
- A RLS confere a rede em toda tabela sensível; funções privilegiadas não ficam
  abertas a quem tem só a chave pública.
- Cada rota de `/api/*` se defende sozinha (segredo, assinatura ou sessão +
  permissão).
- Prontuário e fotos com acesso por permissão; bucket privado com link assinado.

### Confiabilidade
- Nenhum erro de consulta é descartado: ou o fluxo para, ou o motivo é
  registrado.
- Indicadores calculados no banco (sem o teto de 1000 linhas do PostgREST).
- Testes de ponta a ponta contra o banco de produção, isolados pelo prefixo
  `[e2e]`, com varredura de sobras.

### Disponibilidade
- Backup diário do banco pelo Supabase.

---

## 7. Fora do escopo

- Agendamento público sem login.
- Caixa de abrir e fechar.
- Exclusão de dados a pedido do titular (LGPD) — só exportação.
- Apagar oportunidade (lead).
- Prontuário médico completo (clínica com médicos).
- Integração com maquininha (TEF) e emissão de NF-e / NFS-e.
- App iOS e app com código próprio (o app é o portal web num Capacitor).

---

## 8. Em aberto

O que falta — decisões de fora do código, dívida técnica e a próxima frente —
está no `DEVLOG.md`, seção 5. Destaques de produto:

- **A primeira conexão real do WhatsApp oficial** pelo cadastro da Meta (o
  fluxo está no ar, provado só em teste) e o App Review da Meta.
- **Metas de negócio** para o público atual (seção 2.1).

---

## 9. Premissas e riscos

### Premissas
- A clínica contrata por rede; unidades não pagam à parte.
- O app usa o mesmo backend e as mesmas telas do web.
- A clínica escolhe, número a número, entre a API oficial da Meta e a uazapi —
  no caminho não oficial, o risco de bloqueio do número é aceito.

### Riscos

| Risco | Probabilidade | Impacto | Mitigação |
|---|---|---|---|
| Instabilidade ou bloqueio do WhatsApp não oficial | Alta | Alto | Vários números por clínica; caminho oficial disponível |
| O sistema nunca foi usado por uma clínica real | — | Alto | Piloto acompanhado antes de escalar |
| E-mail de acesso não chegar (SMTP padrão do Supabase) | Média | Alto | Configurar SMTP próprio antes do piloto |
| App da Meta sem App Review (Instagram/Messenger) e WhatsApp oficial sem conexão real ainda | Alta | Médio | App Review e uma conexão real acompanhada antes de oferecer os canais |
| Resistência da equipe a trocar de ferramenta | Média | Alto | Onboarding presencial; o sistema substitui o WhatsApp do celular, não soma a ele |

---

*BellarisOS — PRD v2.1 | 1 de outubro de 2026*
