-- As tags da rede (2026-10-13): UM vocabulário para a ficha e o CRM.
--
-- Até aqui a ficha oferecia oito tags fixas no código (CLIENT_TAGS) e o CRM
-- as que já estavam em uso nas oportunidades. A tag que chegava por fora —
-- importação, automação, o card — ficava gravada no cliente e invisível na
-- ficha. Agora a rede tem o seu vocabulário (Configurações → Tags): criar,
-- renomear (em todo lugar) e arquivar.
--
-- - O vocabulário cresce SOZINHO: gatilho em clients, contacts e leads registra
--   toda tag gravada (fora as "Unidade: …", que são do sistema). Instrumentar
--   cada ponto que grava tag é garantir esquecer o próximo (o mesmo argumento
--   dos gatilhos da pessoa, §9.2.1).
-- - Nome único por rede SEM caixa: "VIP" e "vip" são a mesma tag.
-- - Rede nova nasce com as oito de sempre (CLIENT_TAGS em packages/utils —
--   mudou lá, muda aqui).
-- - RLS ligada e ZERO políticas permissivas: só o servidor.

create table if not exists public.tags (
  id           uuid primary key default gen_random_uuid(),
  tenant_id    uuid not null references public.tenants(id) on delete cascade,
  nome         text not null check (length(btrim(nome)) between 1 and 60),
  arquivada_em timestamptz,
  criada_em    timestamptz not null default now()
);

create unique index if not exists tags_nome_na_rede on public.tags (tenant_id, lower(nome));

alter table public.tags enable row level security;

-- A sessão de suporte não grava pelo PostgREST (o laço de 20261008000010).
create policy suporte_sem_escrita_ins on public.tags as restrictive for insert
  with check (case when nullif(nullif(auth.jwt() ->> 'session_id', ''), 'null') is null then true
                   else not private.suporte_sem_escrita() end);
create policy suporte_sem_escrita_upd on public.tags as restrictive for update
  using (case when nullif(nullif(auth.jwt() ->> 'session_id', ''), 'null') is null then true
              else not private.suporte_sem_escrita() end)
  with check (case when nullif(nullif(auth.jwt() ->> 'session_id', ''), 'null') is null then true
                   else not private.suporte_sem_escrita() end);
create policy suporte_sem_escrita_del on public.tags as restrictive for delete
  using (case when nullif(nullif(auth.jwt() ->> 'session_id', ''), 'null') is null then true
              else not private.suporte_sem_escrita() end);

-- ─── Registrar as tags gravadas ─────────────────────────────────────────────

create or replace function private.registrar_tags(p_tenant uuid, p_lista text[])
returns void
language sql
security definer
set search_path = public
as $$
  insert into public.tags (tenant_id, nome)
  select distinct on (lower(btrim(x))) p_tenant, btrim(x)
  from unnest(coalesce(p_lista, '{}')) as x
  where length(btrim(x)) between 1 and 60
    and btrim(x) not like 'Unidade: %'
  on conflict (tenant_id, lower(nome)) do nothing
$$;

-- Nada aqui pode derrubar a gravação do registro: o vocabulário é derivado.
create or replace function private.trg_registrar_tags()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if tg_op = 'INSERT' or new.tags is distinct from old.tags then
    begin
      perform private.registrar_tags(new.tenant_id, new.tags);
    exception when others then
      raise warning '[tags] registrar no vocabulário da rede %: %', new.tenant_id, sqlerrm;
    end;
  end if;
  return new;
end
$$;

drop trigger if exists trg_registrar_tags on public.clients;
create trigger trg_registrar_tags after insert or update of tags on public.clients
  for each row execute function private.trg_registrar_tags();
drop trigger if exists trg_registrar_tags on public.contacts;
create trigger trg_registrar_tags after insert or update of tags on public.contacts
  for each row execute function private.trg_registrar_tags();
drop trigger if exists trg_registrar_tags on public.leads;
create trigger trg_registrar_tags after insert or update of tags on public.leads
  for each row execute function private.trg_registrar_tags();

-- ─── As tags padrão da rede nova ────────────────────────────────────────────

create or replace function private.tags_padrao()
returns text[]
language sql
immutable
as $$ select array['VIP', 'Indicação', 'Retorno', 'Alergias', 'Gestante', 'Idoso', 'Plano', 'Desconto'] $$;

create or replace function private.trg_rede_ganha_tags()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  perform private.registrar_tags(new.id, private.tags_padrao());
  return new;
end
$$;

drop trigger if exists trg_rede_ganha_tags on public.tenants;
create trigger trg_rede_ganha_tags after insert on public.tenants
  for each row execute function private.trg_rede_ganha_tags();

-- As redes que já existem: as padrão e tudo o que já está em uso.
select private.registrar_tags(t.id, private.tags_padrao()) from public.tenants t;
select private.registrar_tags(c.tenant_id, c.tags) from public.clients c where c.tags <> '{}';
select private.registrar_tags(c.tenant_id, c.tags) from public.contacts c where c.tags <> '{}';
select private.registrar_tags(l.tenant_id, l.tags) from public.leads l where l.tags <> '{}';

-- ─── O uso de cada tag (a tela de Configurações) ────────────────────────────

create or replace function public.tags_da_rede(p_tenant uuid)
returns table (id uuid, nome text, arquivada_em timestamptz, clientes bigint, contatos bigint, oportunidades bigint)
language sql
stable
security definer
set search_path = public
as $$
  with uso as (
    select lower(btrim(x)) as chave, 'c' as onde from public.clients r, unnest(r.tags) x where r.tenant_id = p_tenant
    union all
    select lower(btrim(x)), 'p' from public.contacts r, unnest(r.tags) x where r.tenant_id = p_tenant
    union all
    select lower(btrim(x)), 'o' from public.leads r, unnest(r.tags) x where r.tenant_id = p_tenant
  ), contagem as (
    select chave,
           count(*) filter (where onde = 'c') as clientes,
           count(*) filter (where onde = 'p') as contatos,
           count(*) filter (where onde = 'o') as oportunidades
    from uso group by chave
  )
  select t.id, t.nome, t.arquivada_em,
         coalesce(k.clientes, 0), coalesce(k.contatos, 0), coalesce(k.oportunidades, 0)
  from public.tags t
  left join contagem k on k.chave = lower(t.nome)
  where t.tenant_id = p_tenant
  order by lower(t.nome)
$$;

-- ─── Renomear (e juntar) ────────────────────────────────────────────────────
--
-- Troca a tag em clients, contacts, leads e na semente das conversas, sem
-- caixa. Se o nome novo já é de outra tag, as duas viram UMA (a que já
-- existia, com o nome dela) e a renomeada sai do vocabulário. Na mesma
-- transação: renomear pela metade deixaria a rede com as duas grafias.
-- As variáveis não se chamam como colunas (42702 dentro do update).

create or replace function public.renomear_tag(p_tenant uuid, p_tag uuid, p_novo text)
returns table (nome_final text, registros bigint)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_antigo text;
  v_final  text;
  v_outra  uuid;
  v_total  bigint := 0;
  v_n      bigint;
begin
  select t.nome into v_antigo from public.tags t where t.id = p_tag and t.tenant_id = p_tenant;
  if v_antigo is null then raise exception 'Tag não encontrada.'; end if;
  v_final := btrim(p_novo);
  if length(v_final) not between 1 and 60 then raise exception 'Nome inválido.'; end if;

  select t.id, t.nome into v_outra, v_final
  from public.tags t
  where t.tenant_id = p_tenant and lower(t.nome) = lower(btrim(p_novo)) and t.id <> p_tag;
  if v_outra is null then
    v_final := btrim(p_novo);
    update public.tags set nome = v_final where id = p_tag;
  else
    delete from public.tags where id = p_tag;
  end if;

  update public.clients r set tags = private.trocar_tag(r.tags, v_antigo, v_final)
  where r.tenant_id = p_tenant and exists (select 1 from unnest(r.tags) x where lower(btrim(x)) = lower(v_antigo));
  get diagnostics v_n = row_count; v_total := v_total + v_n;
  update public.contacts r set tags = private.trocar_tag(r.tags, v_antigo, v_final)
  where r.tenant_id = p_tenant and exists (select 1 from unnest(r.tags) x where lower(btrim(x)) = lower(v_antigo));
  get diagnostics v_n = row_count; v_total := v_total + v_n;
  update public.leads r set tags = private.trocar_tag(r.tags, v_antigo, v_final)
  where r.tenant_id = p_tenant and exists (select 1 from unnest(r.tags) x where lower(btrim(x)) = lower(v_antigo));
  get diagnostics v_n = row_count; v_total := v_total + v_n;
  update public.conversations r set tags = private.trocar_tag(r.tags, v_antigo, v_final)
  where r.tenant_id = p_tenant and exists (select 1 from unnest(r.tags) x where lower(btrim(x)) = lower(v_antigo));

  return query select v_final, v_total;
end
$$;

-- A lista com a tag trocada, sem repetir (a grafia antiga e a final viram a final).
create or replace function private.trocar_tag(p_lista text[], p_antigo text, p_final text)
returns text[]
language sql
immutable
as $$
  select coalesce(array_agg(y order by ordem), '{}')
  from (
    select y, min(ordem) as ordem
    from (
      select case when lower(btrim(x)) in (lower(p_antigo), lower(p_final)) then p_final else x end as y, ordem
      from unnest(p_lista) with ordinality as u(x, ordem)
    ) a
    group by y
  ) b
$$;

-- As automações que citam a tag pelo nome (a tela avisa ao renomear: o fluxo
-- publicado não se reescreve sozinho).
create or replace function public.automacoes_que_citam_tag(p_tenant uuid, p_nome text)
returns table (id uuid, nome text)
language sql
stable
security definer
set search_path = public
as $$
  select a.id, a.nome from public.automations a
  where a.tenant_id = p_tenant
    and a.grafo::text ilike '%' || to_json(p_nome)::text || '%'
  order by a.nome
$$;

revoke execute on function public.tags_da_rede(uuid) from public, anon, authenticated;
revoke execute on function public.renomear_tag(uuid, uuid, text) from public, anon, authenticated;
revoke execute on function public.automacoes_que_citam_tag(uuid, text) from public, anon, authenticated;
grant execute on function public.tags_da_rede(uuid) to service_role;
grant execute on function public.renomear_tag(uuid, uuid, text) to service_role;
grant execute on function public.automacoes_que_citam_tag(uuid, text) to service_role;

notify pgrst, 'reload schema';
