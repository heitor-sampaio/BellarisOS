-- F17-3, conserto: `avaliacoes_dos_procedimentos` (20261104001802) tinha a
-- chave primária (appointment_id, procedure_id) com chave estrangeira para as
-- DUAS tabelas — o PostgREST a leu como tabela de junção appointments ↔
-- procedures, e todo embed `appointments → procedures(name)` passou a falhar
-- com PGRST201 ("more than one relationship was found"). Visto no E2E minutos
-- depois de aplicada.
--
-- Sem nada destrutivo: a tabela de antes vai para `private` (fora do que o
-- PostgREST lê), com outro nome, e nasce a de agora SEM chave estrangeira para
-- `procedures` — o id do procedimento é só o dado; a chave é um id próprio, e
-- (atendimento, procedimento) é único. A de antes só tinha linhas de teste
-- `[e2e]`; o drop dela fica para a limpeza com o Heitor.

alter table public.avaliacoes_dos_procedimentos set schema private;
alter table private.avaliacoes_dos_procedimentos rename to avaliacoes_dos_procedimentos_juncao_descartada;

create table public.avaliacoes_dos_procedimentos (
  id             uuid primary key default gen_random_uuid(),
  appointment_id uuid not null references public.appointments(id) on delete cascade,
  procedure_id   uuid not null,
  nota           smallint not null check (nota between 1 and 5),
  ordem          smallint not null default 0,
  created_at     timestamptz not null default now(),
  unique (appointment_id, procedure_id)
);

alter table public.avaliacoes_dos_procedimentos enable row level security;

create policy suporte_sem_escrita_ins on public.avaliacoes_dos_procedimentos as restrictive for insert
  with check (case when nullif(nullif((auth.jwt() ->> 'session_id'), ''), 'null') is null then true else (not private.suporte_sem_escrita()) end);
create policy suporte_sem_escrita_upd on public.avaliacoes_dos_procedimentos as restrictive for update
  using (case when nullif(nullif((auth.jwt() ->> 'session_id'), ''), 'null') is null then true else (not private.suporte_sem_escrita()) end)
  with check (case when nullif(nullif((auth.jwt() ->> 'session_id'), ''), 'null') is null then true else (not private.suporte_sem_escrita()) end);
create policy suporte_sem_escrita_del on public.avaliacoes_dos_procedimentos as restrictive for delete
  using (case when nullif(nullif((auth.jwt() ->> 'session_id'), ''), 'null') is null then true else (not private.suporte_sem_escrita()) end);

notify pgrst, 'reload schema';
