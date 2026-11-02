-- "Quem realiza" o procedimento (por-01, revisão do Heitor de 2026-11-02):
-- "já deveria ter um cadastro das profissionais que podem realizar o
-- procedimento. Isso já deve estar na hora da criação de um procedimento e
-- disponível também na edição de um procedimento."
--
-- `procedure_professionals`: a ligação procedimento × profissional. Sem
-- ninguém marcado, valem todas as que atendem (o de antes). Só o servidor
-- grava (actions/procedures.ts); a sessão lê o da própria rede. Some com o
-- procedimento ou com o membro.

create table if not exists public.procedure_professionals (
  procedure_id uuid not null references public.procedures(id) on delete cascade,
  user_id      uuid not null references public.users(id) on delete cascade,
  tenant_id    uuid not null references public.tenants(id) on delete cascade,
  created_at   timestamptz not null default now(),
  primary key (procedure_id, user_id)
);

create index if not exists procedure_professionals_user on public.procedure_professionals (user_id);
create index if not exists procedure_professionals_tenant on public.procedure_professionals (tenant_id);

alter table public.procedure_professionals enable row level security;

create policy procedure_professionals_select on public.procedure_professionals for select using (
  (jwt_claim('role') <> 'CLIENT') and ((tenant_id)::text = jwt_claim('tenant_id'))
);

create policy suporte_sem_escrita_ins on public.procedure_professionals as restrictive for insert with check (
  case when (nullif(nullif((auth.jwt() ->> 'session_id'), ''), 'null') is null) then true
       else (not private.suporte_sem_escrita()) end
);
create policy suporte_sem_escrita_upd on public.procedure_professionals as restrictive for update using (
  case when (nullif(nullif((auth.jwt() ->> 'session_id'), ''), 'null') is null) then true
       else (not private.suporte_sem_escrita()) end
) with check (
  case when (nullif(nullif((auth.jwt() ->> 'session_id'), ''), 'null') is null) then true
       else (not private.suporte_sem_escrita()) end
);
create policy suporte_sem_escrita_del on public.procedure_professionals as restrictive for delete using (
  case when (nullif(nullif((auth.jwt() ->> 'session_id'), ''), 'null') is null) then true
       else (not private.suporte_sem_escrita()) end
);

notify pgrst, 'reload schema';
