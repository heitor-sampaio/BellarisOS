-- FI8 do plano de adaptação (a revisão do Heitor, 2026-11-13: "ok"; "aplica e
-- anota"): sai a política antiga "Operacional acessa financeiro da filial".
--
-- Ela era ALL para todo membro da unidade, sem o módulo (o C1 do levantamento)
-- e, desde a F75 (migration 20261113007503), já não tinha efeito: a política
-- RESTRITIVA `financeiro_so_pelo_servidor` (false/false) fecha
-- `financial_transactions` à sessão, e os lançamentos se leem e se gravam
-- pelo servidor, depois da trava, do "só os meus" e do alcance.
--
-- Sem ela, a tabela fica sem política PERMISSIVA para a sessão: o RLS recusa
-- tudo de qualquer jeito (o mesmo efeito de hoje). As restritivas ficam:
-- `financeiro_so_pelo_servidor` e as `suporte_sem_escrita_*`.
--
-- DESTRUTIVA (dropa uma política). Não mexe em dado nenhum.

drop policy if exists "Operacional acessa financeiro da filial" on public.financial_transactions;
