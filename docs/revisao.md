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
| Estoque | `stock` | ⬜ |
| Relatórios e indicadores | `reports` | ⬜ |
| Equipe | `team` | ⬜ |
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
