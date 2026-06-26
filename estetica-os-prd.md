# PRD — EstéticaOS
**Product Requirements Document**
Versão 1.1 | Junho 2026

---

## Histórico de Versões

| Versão | Data | Alteração |
|---|---|---|
| 1.0 | Jun/2026 | Versão inicial |
| 1.1 | Jun/2026 | Inclusão do app mobile (admin + cliente), monorepo Turborepo, novo fluxo de auth de cliente, persona Cliente App |

---

## 1. Visão Geral

### 1.1 Problema

Redes de clínicas de estética de pequeno porte (2–5 filiais) operam hoje com uma combinação precária de ferramentas: planilhas, agendas físicas, WhatsApp e sistemas genéricos que não atendem as especificidades do setor. O resultado é perda de receita por falhas na agenda, desperdício de estoque, dificuldade em consolidar dados entre filiais e ausência de visão gerencial da rede. Além disso, os clientes das clínicas não têm autonomia para agendar, acompanhar seu histórico ou gerir seus pontos de fidelidade.

### 1.2 Solução

EstéticaOS é um SaaS vertical para redes de clínicas de estética composto por:

- **Portal Web Admin** (`/admin`) — visão consolidada da rede inteira
- **Portal Web Filial** (`/[slug]`) — operação isolada de cada unidade
- **App Mobile** (iOS + Android) — app único com fluxo diferenciado por tipo de usuário:
  - *Fluxo Operacional* para admins, gerentes e profissionais (gestão completa pelo celular)
  - *Fluxo Cliente* para os clientes da clínica (agendamento, histórico, fidelidade)

A assinatura é por grupo/rede, cobrindo todas as filiais com uma única contratação.

### 1.3 Proposta de Valor

- Gestão completa de uma rede em um único sistema (web + mobile)
- Visão consolidada de todas as filiais para o dono/gestor, de qualquer dispositivo
- Operação autônoma e isolada por filial
- App para o cliente final: agendamento online, histórico e fidelidade na palma da mão
- Substituição de 4–6 ferramentas por uma plataforma integrada
- Foco total no fluxo real de uma clínica de estética

---

## 2. Objetivos e Métricas

### 2.1 Objetivos de Negócio

| Objetivo | Meta — 12 meses |
|---|---|
| Clientes ativos (redes) | 30 redes |
| Filiais gerenciadas | 100 filiais |
| Clientes finais com conta no app | 5.000 |
| MRR | R$ 30.000 |
| Churn mensal | < 3% |
| NPS | > 50 |

### 2.2 Métricas de Produto

- Taxa de agendamentos realizados via sistema (web + app) vs. telefone/WhatsApp
- % de procedimentos com prontuário preenchido
- % de filiais com estoque atualizado semanalmente
- DAU/MAU por perfil de usuário (admin, profissional, cliente)
- Taxa de adoção do app pelo cliente final (clientes com conta / total de clientes cadastrados)

---

## 3. Personas

### 3.1 Dona da Rede / Gestora (Admin)
**Perfil:** Empresária, 35–55 anos, dona de 2–5 clínicas. Não opera o dia a dia, mas quer controle total dos números.
**Dores:** Não sabe o faturamento real de cada filial em tempo real. Não consegue comparar performance entre unidades. Depende de relatórios manuais das gerentes.
**Canais:** Web (principal) + App Mobile para consultas rápidas e notificações.
**Ganhos:** Dashboard consolidado, DRE por filial, alerta de desvios, controle de comissões — de qualquer dispositivo.

### 3.2 Gerente de Filial
**Perfil:** Profissional da estética ou administrativa, 25–45 anos. Opera a unidade no dia a dia.
**Dores:** Agenda desorganizada, controle de estoque no caderno, dificuldade em cobrar comissões.
**Canais:** Web (principal) + App Mobile.
**Ganhos:** Agenda digital, controle de caixa, estoque automatizado.

### 3.3 Recepcionista
**Perfil:** Atende clientes, agenda horários, opera o caixa.
**Dores:** Sistema complexo demais para o ritmo da recepção.
**Canais:** Web (tablet ou desktop na recepção).
**Ganhos:** Interface simples e rápida para agendamento e check-in.

### 3.4 Profissional / Esteticista
**Perfil:** Executa os procedimentos. Pode ser CLT ou comissionada.
**Dores:** Não tem visão dos seus agendamentos do dia. Não acompanha suas comissões.
**Canais:** App Mobile (principal) + Web.
**Ganhos:** Agenda do dia no celular, prontuário do cliente na hora do atendimento, extrato de comissões.

### 3.5 Cliente Final (App)
**Perfil:** Cliente da clínica, 20–55 anos. Acostumado a agendar serviços pelo celular.
**Dores:** Precisa ligar ou mandar WhatsApp para agendar. Não sabe quantos pontos tem. Não tem histórico dos procedimentos realizados.
**Canais:** App Mobile exclusivamente.
**Ganhos:** Agendamento self-service, histórico de atendimentos, saldo de pontos, lembretes automáticos.

---

## 4. Escopo do MVP

### 4.1 Módulo: Agenda

**Funcionalidades:**
- Visualizações: dia, semana e mês
- Agendamento por profissional e por sala/cabine
- Status: Agendado → Confirmado → Em atendimento → Concluído → Cancelado → No-show
- Bloqueio de horários (folga, intervalo, indisponibilidade)
- Agendamento online via link público por filial e via App do cliente
- Notificação de confirmação e lembrete via WhatsApp e push notification (24h antes)
- Reagendamento e cancelamento com registro de motivo
- Histórico de agendamentos por cliente

**Regras de negócio:**
- Um profissional não pode ter dois agendamentos simultâneos
- Uma sala não pode ter dois agendamentos simultâneos
- Cancelamentos com menos de X horas podem gerar taxa (configurável por filial)

---

### 4.2 Módulo: Clientes / CRM

**Funcionalidades:**
- Cadastro completo: nome, CPF, data de nascimento, contato, endereço, foto
- Vinculação com conta no app mobile (via CPF — cliente cria conta e vincula ao cadastro existente)
- Histórico de procedimentos, compras e agendamentos
- Programa de pontos configurável (pontos por procedimento, resgate como desconto)
- Tags e segmentação (ex: cliente VIP, pacote ativo, inativa há 60 dias)
- Alertas automáticos: aniversariantes do mês, clientes sem atendimento há X dias
- Registro de indicações
- Extrato de pontos por cliente
- LGPD: cliente pode solicitar exportação ou exclusão dos dados (inclusive pelo app)

**Regras de negócio:**
- CPF é único por rede (cliente pode frequentar mais de uma filial)
- Conta no app é vinculada pelo CPF — se já existir cadastro na clínica, os dados se unificam
- Pontos são acumulados por filial ou por rede (configurável pelo admin)

---

### 4.3 Módulo: Procedimentos

**Funcionalidades:**
- Cadastro de procedimentos com nome, categoria, descrição, duração padrão e preço
- Definição de quais profissionais estão habilitados para cada procedimento
- Vinculação de produtos/insumos consumidos por execução (consumo automático do estoque)
- Pacotes de sessões (ex: 10 sessões de laser — preço especial, controle de sessões restantes)
- Histórico de preço (rastreabilidade de alterações)
- Catálogo base criado pelo admin da rede e herdado pelas filiais

**Regras de negócio:**
- Ao concluir um agendamento, o sistema baixa automaticamente do estoque os insumos vinculados
- Pacotes só podem ser utilizados pelo cliente que os adquiriu

---

### 4.4 Módulo: Prontuário Estético

**Funcionalidades:**
- Ficha de anamnese configurável por categoria de procedimento
- Registro de cada sessão: observações, produtos utilizados, intercorrências
- Upload de fotos antes/depois via web e via câmera do celular (app mobile)
- Termos de consentimento digital com aceite registrado (data, IP)
- Restrições e contraindicações destacadas na abertura do prontuário
- Histórico cronológico completo por cliente
- Acesso restrito: profissional vê apenas clientes com agendamentos na sua agenda

**Regras de negócio:**
- Prontuário é criado na primeira sessão e vinculado ao CPF do cliente
- Fotos armazenadas com controle de acesso — apenas profissional e gerente da filial
- Cliente NÃO vê o prontuário completo no app — apenas histórico de procedimentos realizados
- LGPD: fotos são excluídas junto com os dados do cliente mediante solicitação

---

### 4.5 Módulo: Estoque

**Funcionalidades:**
- Cadastro de produtos: nome, SKU, categoria, unidade de medida, fornecedor, preço de custo
- Controle de lote e validade
- Entrada de estoque manual (compra) e saída automática (consumo por procedimento concluído)
- Saída manual para perdas e ajustes
- Transferência de produtos entre filiais (registrada e visível pelo admin)
- Alerta de estoque mínimo (configurável por produto)
- Alerta de produtos próximos ao vencimento
- Relatório de consumo por período e por procedimento

**Regras de negócio:**
- Estoque é isolado por filial
- Transferência entre filiais gera saída em uma e entrada na outra, pendente de confirmação
- Produtos com validade vencida são sinalizados e bloqueados para uso

---

### 4.6 Módulo: Financeiro

**Caixa e Receitas:**
- Lançamento de receitas vinculado ao agendamento concluído (automático) ou manual
- Formas de pagamento: dinheiro, PIX, cartão de débito, cartão de crédito, crédito interno
- Parcelamento no cartão com registro das parcelas
- Abertura e fechamento de caixa diário com conferência
- Contas a receber (pacotes parcelados, crédito interno)

**Despesas:**
- Lançamento de despesas por categoria (aluguel, produtos, pessoal, marketing etc.)
- Contas a pagar com vencimento e status

**Comissões:**
- Regras de comissão por profissional e por procedimento (% ou valor fixo)
- Extrato de comissão por profissional no período
- Fechamento de comissão mensal (marca como pago)

**Relatórios:**
- DRE simplificado por filial (receitas − despesas = resultado)
- Relatório consolidado da rede (visível apenas pelo admin)
- Ticket médio por período, por profissional e por procedimento
- Comparativo entre filiais (apenas admin da rede)

**Regras de negócio:**
- Receita só é lançada quando o agendamento é marcado como "Concluído"
- Estorno cancela a receita e gera crédito interno ao cliente
- Comissão sobre pacotes: calculada na sessão executada, não na venda do pacote

---

### 4.7 App Mobile — Fluxo Operacional (Admin / Profissional)

**Funcionalidades:**
- Agenda do dia com visualização por profissional
- Gestão completa de agendamentos (criar, confirmar, concluir, cancelar)
- Cadastro e consulta de clientes
- Preenchimento de prontuário com câmera nativa (fotos antes/depois)
- Controle de estoque (consulta, entrada, ajuste)
- Lançamentos financeiros e consulta de caixa
- Extrato de comissões (profissional vê as próprias; admin vê todos)
- Relatórios e dashboard (admin)
- Notificações push: novo agendamento, cancelamento, estoque mínimo, lembrete de atendimento

---

### 4.8 App Mobile — Fluxo Cliente

**Funcionalidades:**
- Cadastro/login via CPF + senha ou magic link por e-mail
- Vinculação automática ao cadastro existente na clínica (por CPF)
- Agendamento self-service: escolher filial → procedimento → profissional → horário
- Reagendamento e cancelamento dentro do prazo configurado pela clínica
- Histórico de procedimentos realizados (sem acesso ao prontuário completo)
- Saldo e extrato de pontos de fidelidade
- Pacotes ativos e sessões restantes
- Notificações push: confirmação de agendamento, lembrete 24h antes, promoções

---

## 5. Arquitetura

### 5.1 Monorepo

```
estetica-os/                        (Turborepo)
├── apps/
│   ├── web/                        Next.js 14 — portais web
│   └── mobile/                     Expo (React Native) — app iOS + Android
├── packages/
│   ├── db/                         Prisma schema + migrations
│   ├── types/                      interfaces TypeScript compartilhadas
│   ├── validators/                 schemas Zod (validação web + mobile)
│   └── utils/                      formatadores BRL, datas pt-BR, máscaras
└── supabase/                       RLS policies, edge functions, seed
```

### 5.2 Estrutura Multi-tenant

```
Tenant (Rede)
├── Portal Web Admin     → visão consolidada, gestão de filiais
├── App Mobile Admin     → gestão completa pelo celular
└── Filiais
    ├── Filial A
    │   ├── Portal Web Filial
    │   ├── App Mobile (profissionais)
    │   └── Clientes → App Mobile (fluxo cliente)
    ├── Filial B
    └── Filial C
```

### 5.3 Isolamento de Dados

- Todos os registros operacionais carregam `tenant_id` e `branch_id`
- RLS do Postgres garante isolamento no banco como segunda linha de defesa
- Claims do JWT determinam o escopo:
  - `role: NETWORK_ADMIN` + `tenant_id` → acesso a toda a rede
  - `role: BRANCH_*` + `branch_id` → acesso restrito à filial
  - `role: CLIENT` + `client_id` → acesso apenas aos próprios dados

### 5.4 Autenticação por Tipo de Usuário

| Tipo | Método de Login | Auth Provider |
|---|---|---|
| Operacional (admin, gerente, profissional, recepcionista) | E-mail + senha | Supabase Auth |
| Cliente Final | CPF + senha ou magic link por e-mail | Supabase Auth |

O `Client` possui `authId` opcional — preenchido quando o cliente cria conta no app. O vínculo é feito por CPF no momento do cadastro.

---

## 6. Perfis de Acesso

| Perfil | Escopo | Acesso |
|---|---|---|
| **Network Admin** | Toda a rede | Tudo: filiais, relatórios consolidados, billing, configurações globais |
| **Branch Admin** | 1 filial | Tudo na filial: agenda, clientes, estoque, financeiro, relatórios |
| **Receptionist** | 1 filial | Agenda, cadastro de clientes, caixa, consulta de estoque |
| **Professional** | 1 filial | Própria agenda, prontuários dos seus clientes, extrato de comissões |
| **Financial** | 1 filial | Relatórios financeiros, lançamentos, sem editar agenda/clientes |
| **Client** | Próprios dados | Agendamentos, histórico de procedimentos, pontos, pacotes |

---

## 7. Portais e Rotas

| Canal | URL / Plataforma | Descrição |
|---|---|---|
| Portal Admin (web) | `app.esteticaos.com.br/admin` | Dashboard consolidado, gestão de filiais |
| Portal Filial (web) | `app.esteticaos.com.br/[slug]` | Operação completa da unidade |
| Agendamento online | `agenda.esteticaos.com.br/[slug]` | Link público para clientes agendarem sem app |
| App Mobile | iOS App Store + Google Play | Fluxo operacional + fluxo cliente no mesmo app |

---

## 8. Stack Técnica

| Camada | Tecnologia |
|---|---|
| Web Frontend | Next.js 14 + TypeScript + Tailwind CSS + shadcn/ui |
| Mobile | Expo (React Native) + TypeScript |
| Backend / Banco | Supabase (PostgreSQL + RLS + Auth + Storage) |
| ORM | Prisma |
| Packages compartilhados | Turborepo (`types`, `validators`, `utils`) |
| Pagamentos (billing) | Pagar.me (assinatura da rede) |
| Notificações WhatsApp | Z-API ou Evolution API |
| Push Notifications | Expo Push Notifications |
| Jobs / Filas | BullMQ + Upstash Redis |
| Deploy Web | Vercel |
| Deploy Mobile | EAS Build (Expo Application Services) |

---

## 9. Roadmap de Desenvolvimento

### Sprint 1 — Fundação (Semanas 1–2)
- [ ] Setup do monorepo (Turborepo + Next.js + Expo + Supabase)
- [ ] Packages compartilhados: `types`, `validators`, `utils`
- [ ] Autenticação multi-tenant com Supabase Auth (operacional + cliente)
- [ ] CRUD de rede (tenant) e filiais (branch)
- [ ] Gestão de usuários e perfis de acesso
- [ ] RLS policies no banco para isolamento por filial e por cliente
- [ ] Layout base web: sidebar, navegação, portal admin vs. filial

### Sprint 2 — Core Operacional Web (Semanas 3–4)
- [ ] Módulo Clientes: cadastro, busca, perfil
- [ ] Módulo Procedimentos: catálogo, categorias, duração, preço
- [ ] Módulo Agenda: calendário, criação de agendamentos, status
- [ ] Vinculação agendamento → cliente → procedimento → profissional

### Sprint 3 — Clínica Completa Web (Semanas 5–6)
- [ ] Módulo Prontuário: ficha de anamnese, fotos, termos de consentimento
- [ ] Módulo Estoque: cadastro de produtos, entradas, consumo automático
- [ ] Pacotes de sessões: venda, controle de saldo
- [ ] Caixa: abertura/fechamento, lançamentos, formas de pagamento

### Sprint 4 — Financeiro & Relatórios Web (Semanas 7–8)
- [ ] Despesas e contas a pagar
- [ ] DRE por filial e consolidado da rede
- [ ] Comissões: regras, extrato, fechamento
- [ ] Dashboard admin da rede: consolidado, comparativo entre filiais

### Sprint 5 — App Mobile Operacional (Semanas 9–11)
- [ ] Setup Expo + autenticação
- [ ] Agenda do dia + gestão de agendamentos
- [ ] Consulta e cadastro de clientes
- [ ] Prontuário com câmera nativa
- [ ] Estoque e financeiro (mobile)
- [ ] Push notifications operacionais

### Sprint 6 — App Mobile Cliente + CRM (Semanas 12–14)
- [ ] Fluxo de cadastro/login do cliente final (CPF + vinculação)
- [ ] Agendamento self-service pelo app
- [ ] Histórico de procedimentos, pontos e pacotes
- [ ] Push notifications para o cliente
- [ ] Agendamento online público (web)
- [ ] Notificações WhatsApp
- [ ] Alertas CRM: aniversariantes, clientes inativos
- [ ] Transferência de estoque entre filiais

---

## 10. Requisitos Não Funcionais

### Segurança
- Autenticação via Supabase Auth (JWT + refresh token) para todos os perfis
- RLS obrigatório em todas as tabelas com dados de clientes
- Cliente só acessa os próprios dados via `client_id` no JWT
- Dados sensíveis (prontuário, fotos) com acesso auditado
- LGPD: fluxo de exclusão de dados implementado desde o MVP

### Performance
- Carregamento inicial do dashboard web em < 2s
- App mobile: tela de agenda do dia carregando em < 1,5s
- Relatórios gerados assincronamente para períodos > 30 dias

### Disponibilidade
- SLA 99,5% (downtime máximo: ~3,6h/mês)
- Backup automático diário do banco via Supabase

### Escalabilidade
- Arquitetura suporta redes com até 20 filiais sem refatoração
- Crescimento horizontal via Supabase e Vercel

---

## 11. Fora do Escopo (MVP)

- Prontuário médico completo (para clínicas com médicos)
- Integração com maquininhas de cartão (TEF)
- Emissão de NF-e / NFS-e
- Módulo de marketing por e-mail
- Marketplace de produtos para clientes
- Integração com Instagram para agendamento via DM
- Chat em tempo real entre cliente e clínica

---

## 12. Premissas e Riscos

### Premissas
- Cliente contrata um plano por rede; filiais não pagam individualmente
- O app mobile usa os mesmos dados e backend do web (Supabase)
- Clientes que já existem na base são vinculados por CPF ao criar conta no app
- Integrações de WhatsApp usam APIs não-oficiais (Z-API / Evolution) — risco aceito

### Riscos

| Risco | Probabilidade | Impacto | Mitigação |
|---|---|---|---|
| Instabilidade da API de WhatsApp | Alta | Médio | Fallback por push notification e e-mail |
| Resistência de esteticistas a usar app | Média | Alto | UX simplificada, onboarding presencial |
| Complexidade das regras de comissão | Média | Médio | Configuração flexível desde o início |
| Churn por falta de migração de dados | Baixa | Alto | Importação via CSV no onboarding |
| Baixa adoção do app pelo cliente final | Média | Médio | QR code na recepção + incentivo com pontos no primeiro acesso |

---

*Documento gerado em Junho de 2026. Versão 1.1.*
