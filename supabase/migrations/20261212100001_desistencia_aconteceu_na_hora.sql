-- D14 da 33ª simulação e a Decisão A (decisão do Claude, 26/11, princípio 5):
-- a desistência no meio do atendimento ACONTECEU na hora da desistência.
--
-- A A08 (iniciada 10:11, desistida 10:12, marcada para 14:15) contava como
-- "Cancelado 1" nos Relatórios do dia e ficava fora dos "Cancelados/faltas"
-- do dashboard, que conta "até agora" (CC-03): o `aconteceu_em` do cancelado
-- era a hora marcada. Como o concluído ANTES da hora vale pela conclusão
-- (D13, o Heitor, 2026-10-22 — migration 20261022000001), o atendimento
-- INICIADO e cancelado antes da hora vale pelo cancelamento (`cancelled_at`,
-- que `cancelarCore` e `desistir_do_atendimento` gravam). O cancelado sem
-- início (não houve atendimento) segue na hora marcada, e o desistido depois
-- da hora marcada também — a mesma régua do concluído depois (não muda o
-- atendimento de dia).
--
-- Coluna gerada: o Postgres 17 troca a expressão e reescreve a tabela (o
-- índice `appointments_unidade_aconteceu_em` se refaz junto). As funções
-- `metrics_*` leem a coluna, e nenhuma muda. A Auditoria não vê a reescrita
-- (não é gravação de linha), e a coluna já é das derivadas que ela não cita.

alter table public.appointments
  alter column aconteceu_em set expression as (
    case when status = 'COMPLETED' and completed_at is not null and completed_at < scheduled_at
           then completed_at
         when status = 'CANCELLED' and started_at is not null and cancelled_at is not null and cancelled_at < scheduled_at
           then cancelled_at
         else scheduled_at end
  );

notify pgrst, 'reload schema';
