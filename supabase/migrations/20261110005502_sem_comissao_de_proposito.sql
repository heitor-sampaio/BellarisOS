-- A14 da 11ª simulação (2026-11-10): o aviso "profissionais sem comissão" e
-- a pílula "Sem comissão" incluíam a dona, que fica sem comissão DE PROPÓSITO
-- (a Renata atende e não se paga comissão). Princípio 1: a clínica decide —
-- "Sem comissão, de propósito" na comissão da pessoa (Equipe) tira o aviso.
-- Só a marca: a conta da comissão não muda (sem regra, o atendimento conclui
-- sem comissão, como sempre). Gravar uma regra padrão desfaz a marca.

alter table public.users add column if not exists sem_comissao_de_proposito boolean not null default false;

comment on column public.users.sem_comissao_de_proposito is
  'A clínica marcou que esta pessoa atende SEM comissão de propósito (A14 da 11ª): o aviso de "sem comissão" não a conta. Só o servidor grava (salvarRegrasDoProfissional).';

notify pgrst, 'reload schema';
