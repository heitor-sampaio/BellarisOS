-- Quem abriu o prontuário (2026-10-27, decisões do Heitor).
--
-- Dado de saúde é sensível na LGPD, e numa investigação a pergunta é "quem
-- viu?". Toda leitura clínica fica aqui: a ficha da cliente (com os anexos
-- clínicos), a sessão de atendimento, o plano com a anotação ou a anamnese, e
-- a liberação do prontuário no pacote LGPD. Quem vê o registro é o admin da
-- rede, pelo servidor; a cliente não o recebe no pacote LGPD.

create table if not exists public.prontuario_acessos (
  id          uuid primary key default gen_random_uuid(),
  tenant_id   uuid not null references public.tenants(id) on delete cascade,
  client_id   uuid not null references public.clients(id) on delete cascade,
  -- Sem chave estrangeira de propósito: o registro sobrevive ao membro (o
  -- nome fica em ator_nome, como estava na hora — com a marca "via suporte").
  user_id     uuid,
  ator_nome   text not null,
  ponto       text not null check (ponto in ('ficha', 'sessao', 'plano', 'lgpd')),
  -- O agendamento, o plano ou o pedido LGPD, quando o ponto tem um.
  referencia  uuid,
  acessado_em timestamptz not null default now()
);

create index if not exists prontuario_acessos_cliente on public.prontuario_acessos (client_id, acessado_em desc);

-- Só o servidor lê e grava (a tela confere quem é da rede).
alter table public.prontuario_acessos enable row level security;
create policy suporte_sem_escrita_ins on public.prontuario_acessos as restrictive for insert
  with check (case when nullif(nullif(auth.jwt() ->> 'session_id', ''), 'null') is null then true else not private.suporte_sem_escrita() end);
create policy suporte_sem_escrita_upd on public.prontuario_acessos as restrictive for update
  using (case when nullif(nullif(auth.jwt() ->> 'session_id', ''), 'null') is null then true else not private.suporte_sem_escrita() end) with check (case when nullif(nullif(auth.jwt() ->> 'session_id', ''), 'null') is null then true else not private.suporte_sem_escrita() end);
create policy suporte_sem_escrita_del on public.prontuario_acessos as restrictive for delete
  using (case when nullif(nullif(auth.jwt() ->> 'session_id', ''), 'null') is null then true else not private.suporte_sem_escrita() end);
create policy suporte_sem_clinico on public.prontuario_acessos as restrictive for all
  using (not private.suporte_sem_clinico()) with check (not private.suporte_sem_clinico());

-- Um acesso registrado não se altera (como o registro de acesso do suporte).
-- Apagar sai só com a cliente (cascade) — o produto não apaga cliente.
create or replace function private.prontuario_acessos_imutavel()
returns trigger language plpgsql set search_path = '' as $$
begin
  raise exception 'O registro de acesso ao prontuário não se altera.';
end $$;
drop trigger if exists trg_prontuario_acessos_imutavel on public.prontuario_acessos;
create trigger trg_prontuario_acessos_imutavel
  before update on public.prontuario_acessos
  for each row execute function private.prontuario_acessos_imutavel();

-- Registra um acesso. A cliente tem de ser da rede, e a mesma pessoa relendo a
-- mesma cliente no mesmo ponto (e referência) em 30 min é uma linha só — a
-- tela recarrega sozinha, e o registro não pode virar ruído.
create or replace function public.prontuario_registrar_acesso(
  p_tenant uuid, p_cliente uuid, p_usuario uuid, p_nome text, p_ponto text, p_referencia uuid default null
)
returns void language sql set search_path = '' as $$
  insert into public.prontuario_acessos (tenant_id, client_id, user_id, ator_nome, ponto, referencia)
  select p_tenant, p_cliente, p_usuario, coalesce(nullif(p_nome, ''), 'Alguém da equipe'), p_ponto, p_referencia
   where exists (select 1 from public.clients c where c.id = p_cliente and c.tenant_id = p_tenant)
     and not exists (
       select 1 from public.prontuario_acessos a
        where a.client_id = p_cliente
          and a.user_id is not distinct from p_usuario
          and a.ponto = p_ponto
          and a.referencia is not distinct from p_referencia
          and a.acessado_em > now() - interval '30 minutes')
$$;

-- Só o servidor.
revoke execute on function public.prontuario_registrar_acesso(uuid, uuid, uuid, text, text, uuid) from public, anon, authenticated;
grant execute on function public.prontuario_registrar_acesso(uuid, uuid, uuid, text, text, uuid) to service_role;

notify pgrst, 'reload schema';
