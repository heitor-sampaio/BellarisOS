-- A passagem que está rodando a importação (2026-10-13, revisão).
--
-- Reivindicar troca o status E carimba uma `execucao` nova; todo sinal de vida
-- e a gravação final filtram por ela. Uma passagem que perdeu a vez (o
-- "Tentar de novo" de uma que parecia morta) deixa de gravar no lugar da nova
-- — sem isto, duas escreviam as mesmas contagens e uma sobrescrevia a outra.

alter table public.importacoes
  add column if not exists execucao uuid;

notify pgrst, 'reload schema';
