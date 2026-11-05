-- Decisão 3 do Heitor (7ª simulação, 2026-11-05: "concordo"): o bloqueio
-- pontual da agenda — o almoço de hoje, a folga, as férias de vários dias —,
-- por PROFISSIONAL ou por SALA, com início, fim e motivo. Existe o horário
-- semanal (com pausa) da Equipe, mas não um bloqueio de uma data e hora.
--
-- - Os livres (`computeAvailableSlots`: o app da cliente, o Copilot, o CRM)
--   não oferecem o horário bloqueado; a equipe, pela agenda, é AVISADA e
--   encaixa (princípio 2), como no encaixe fora do horário.
-- - A profissional bloqueada vale para a pessoa (a da rede atende em todas as
--   unidades); `branch_id` é a unidade de onde se bloqueou (a da sala, para a
--   sala), que decide o alcance de quem desfaz.
-- - Só o servidor lê e grava (RLS sem política permissiva, como os fundos de
--   troco), e as restritivas do suporte valem.

create table if not exists public.agenda_bloqueios (
  id              uuid primary key default gen_random_uuid(),
  tenant_id       uuid not null references public.tenants(id) on delete cascade,
  branch_id       uuid not null references public.branches(id) on delete cascade,
  professional_id uuid references public.users(id) on delete cascade,
  room_id         uuid references public.rooms(id) on delete cascade,
  inicio          timestamptz not null,
  fim             timestamptz not null,
  motivo          text not null,
  criado_por      uuid references public.users(id) on delete set null,
  criado_por_nome text,
  criado_em       timestamptz not null default now(),
  constraint agenda_bloqueios_periodo check (fim > inicio and fim - inicio <= interval '366 days'),
  constraint agenda_bloqueios_alvo check ((professional_id is null) <> (room_id is null)),
  constraint agenda_bloqueios_motivo check (char_length(btrim(motivo)) between 1 and 200)
);

comment on table public.agenda_bloqueios is
  'Bloqueio pontual da agenda (decisão 3 da 7ª simulação): uma profissional OU uma sala, de inicio a fim, com o motivo. Só o servidor lê e grava.';

create index if not exists agenda_bloqueios_profissional on public.agenda_bloqueios (professional_id, inicio) where professional_id is not null;
create index if not exists agenda_bloqueios_sala on public.agenda_bloqueios (room_id, inicio) where room_id is not null;
create index if not exists agenda_bloqueios_rede on public.agenda_bloqueios (tenant_id, inicio);

alter table public.agenda_bloqueios enable row level security;

create policy suporte_sem_escrita_ins on public.agenda_bloqueios as restrictive for insert
  with check (case when nullif(nullif((auth.jwt() ->> 'session_id'), ''), 'null') is null then true else (not private.suporte_sem_escrita()) end);
create policy suporte_sem_escrita_upd on public.agenda_bloqueios as restrictive for update
  using (case when nullif(nullif((auth.jwt() ->> 'session_id'), ''), 'null') is null then true else (not private.suporte_sem_escrita()) end)
  with check (case when nullif(nullif((auth.jwt() ->> 'session_id'), ''), 'null') is null then true else (not private.suporte_sem_escrita()) end);
create policy suporte_sem_escrita_del on public.agenda_bloqueios as restrictive for delete
  using (case when nullif(nullif((auth.jwt() ->> 'session_id'), ''), 'null') is null then true else (not private.suporte_sem_escrita()) end);

notify pgrst, 'reload schema';
