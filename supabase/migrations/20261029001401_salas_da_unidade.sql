-- D5 (decisão do Heitor, 2026-10-30): as SALAS da unidade.
--
-- `rooms` e a conferência de conflito de sala existiam, mas nada no app criava
-- sala (as 2 da produção nasceram por SQL). Agora a sala se cria, renomeia e
-- desativa em Configurações → Unidades → a unidade, PELO SERVIDOR (a action
-- confere `settings: MANAGE` e a abrangência). E o procedimento pode ser ligado
-- às salas em que é feito — ligação opcional: sem sala marcada NA UNIDADE,
-- qualquer sala ativa dela serve.
--
-- 1. `rooms`: o nome é único entre as salas ATIVAS da unidade (sem caixa nem
--    espaço nas pontas), e a sessão deixa de gravar sala pelo PostgREST — só
--    o servidor grava (a RLS conferia a unidade, não o módulo: a recepção
--    criaria sala pela chave pública). Ler continua como era.
-- 2. `procedure_rooms`: a ligação procedimento × sala. Só o servidor grava; a
--    sessão lê o da própria rede. Some com o procedimento ou a sala.

-- 1 ---------------------------------------------------------------------------
alter table public.rooms add column if not exists created_at timestamptz not null default now();

create unique index if not exists rooms_nome_unico_na_unidade
  on public.rooms (branch_id, lower(btrim(name))) where is_active;

drop policy if exists rooms_insert on public.rooms;
drop policy if exists rooms_update on public.rooms;
drop policy if exists rooms_delete on public.rooms;

-- 2 ---------------------------------------------------------------------------
create table if not exists public.procedure_rooms (
  procedure_id uuid not null references public.procedures(id) on delete cascade,
  room_id      uuid not null references public.rooms(id) on delete cascade,
  tenant_id    uuid not null references public.tenants(id) on delete cascade,
  created_at   timestamptz not null default now(),
  primary key (procedure_id, room_id)
);

create index if not exists procedure_rooms_room on public.procedure_rooms (room_id);
create index if not exists procedure_rooms_tenant on public.procedure_rooms (tenant_id);

alter table public.procedure_rooms enable row level security;

create policy procedure_rooms_select on public.procedure_rooms for select using (
  (jwt_claim('role') <> 'CLIENT') and ((tenant_id)::text = jwt_claim('tenant_id'))
);

create policy suporte_sem_escrita_ins on public.procedure_rooms as restrictive for insert with check (
  case when (nullif(nullif((auth.jwt() ->> 'session_id'), ''), 'null') is null) then true
       else (not private.suporte_sem_escrita()) end
);
create policy suporte_sem_escrita_upd on public.procedure_rooms as restrictive for update using (
  case when (nullif(nullif((auth.jwt() ->> 'session_id'), ''), 'null') is null) then true
       else (not private.suporte_sem_escrita()) end
) with check (
  case when (nullif(nullif((auth.jwt() ->> 'session_id'), ''), 'null') is null) then true
       else (not private.suporte_sem_escrita()) end
);
create policy suporte_sem_escrita_del on public.procedure_rooms as restrictive for delete using (
  case when (nullif(nullif((auth.jwt() ->> 'session_id'), ''), 'null') is null) then true
       else (not private.suporte_sem_escrita()) end
);

notify pgrst, 'reload schema';
