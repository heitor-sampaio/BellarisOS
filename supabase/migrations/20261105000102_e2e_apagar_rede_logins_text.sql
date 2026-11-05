-- F25 (2026-11-05): conserta a 20261105000101. `users.auth_id` e
-- `clients.auth_id` são TEXT (o de `platform_staff` é uuid): a conta dos
-- logins que ficam sem dono comparava text com uuid e a função inteira
-- falhava (42883) — sem apagar nada, porque tudo é uma transação. O resto da
-- função é o mesmo.

create or replace function public.e2e_apagar_rede(p_tenant uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_inicio     timestamptz := clock_timestamp();
  v_rede       record;
  v_tab        record;
  v_fk         record;
  v_n          bigint;
  v_novos      bigint;
  v_certos     int;
  v_apagou     jsonb := '{}'::jsonb;
  v_restam     jsonb := '{}'::jsonb;
  v_auth       text[];   -- users.auth_id e clients.auth_id são text
  v_logins     jsonb;
  v_arquivos   jsonb;
  v_incompleto boolean := false;
begin
  if p_tenant is null then
    raise exception 'e2e_apagar_rede: sem rede' using errcode = '22023';
  end if;

  select t.id, t.name, t.slug, t.email into v_rede from public.tenants t where t.id = p_tenant;
  if not found then
    return jsonb_build_object('ausente', true, 'incompleto', false, 'apagou', '{}'::jsonb,
      'restam', '{}'::jsonb, 'logins', '[]'::jsonb, 'arquivos', '{}'::jsonb);
  end if;
  if not public.e2e_eh_rede_de_teste(v_rede.name, v_rede.slug, v_rede.email) then
    raise exception 'e2e_apagar_rede: a rede % (%) não é uma rede de teste', p_tenant, v_rede.name
      using errcode = '42501';
  end if;

  -- As tabelas de public, com a chave primária e se têm tenant_id.
  create temp table if not exists e2e_tab (
    tab regclass primary key, cols text[], tipos text[], tem_tenant boolean,
    json_c text, casa_p text, casa_x text, prof int not null default 0
  ) on commit drop;
  create temp table if not exists e2e_alvo (tab regclass, k jsonb, primary key (tab, k)) on commit drop;
  create temp table if not exists e2e_fk (filho regclass, pai regclass, juncao text, prende boolean) on commit drop;
  truncate pg_temp.e2e_tab, pg_temp.e2e_alvo, pg_temp.e2e_fk;

  insert into pg_temp.e2e_tab (tab, cols, tipos, tem_tenant)
  select c.oid::regclass,
         array_agg(a.attname::text order by k.ord),
         array_agg(format_type(a.atttypid, a.atttypmod) order by k.ord),
         exists (select 1 from pg_attribute ta
                 where ta.attrelid = c.oid and ta.attname = 'tenant_id' and not ta.attisdropped)
  from pg_class c
  join pg_namespace n on n.oid = c.relnamespace and n.nspname = 'public'
  join pg_index i on i.indrelid = c.oid and i.indisprimary
  cross join lateral unnest(i.indkey) with ordinality as k(attnum, ord)
  join pg_attribute a on a.attrelid = c.oid and a.attnum = k.attnum
  where c.relkind in ('r', 'p')
  group by c.oid;

  -- A chave como jsonb (alias c), e "a chave desta linha está no alvo" (alias p e x).
  update pg_temp.e2e_tab t set
    json_c = 'jsonb_build_object(' || (select string_agg(format('%L, c.%I', col, col), ', ') from unnest(t.cols) as col) || ')',
    casa_p = case when array_length(t.cols, 1) = 1
      then format('p.%I in (select (a.k->>%L)::%s from pg_temp.e2e_alvo a where a.tab = %L::regclass)', t.cols[1], t.cols[1], t.tipos[1], t.tab)
      else format('jsonb_build_object(%s) in (select a.k from pg_temp.e2e_alvo a where a.tab = %L::regclass)',
             (select string_agg(format('%L, p.%I', col, col), ', ') from unnest(t.cols) as col), t.tab) end,
    casa_x = case when array_length(t.cols, 1) = 1
      then format('x.%I in (select (a.k->>%L)::%s from pg_temp.e2e_alvo a where a.tab = %L::regclass)', t.cols[1], t.cols[1], t.tipos[1], t.tab)
      else format('jsonb_build_object(%s) in (select a.k from pg_temp.e2e_alvo a where a.tab = %L::regclass)',
             (select string_agg(format('%L, x.%I', col, col), ', ') from unnest(t.cols) as col), t.tab) end;

  -- As chaves estrangeiras entre as tabelas de public.
  insert into pg_temp.e2e_fk (filho, pai, juncao, prende)
  select f.conrelid::regclass, f.confrelid::regclass,
         (select string_agg(format('c.%I = p.%I', ca.attname, pa.attname), ' and ' order by u.ord)
            from unnest(f.conkey, f.confkey) with ordinality as u(ck, pk, ord)
            join pg_attribute ca on ca.attrelid = f.conrelid and ca.attnum = u.ck
            join pg_attribute pa on pa.attrelid = f.confrelid and pa.attnum = u.pk),
         f.confdeltype in ('a', 'r', 'c')
  from pg_constraint f
  join pg_temp.e2e_tab tf on tf.tab = f.conrelid
  join pg_temp.e2e_tab tp on tp.tab = f.confrelid
  where f.contype = 'f' and f.conrelid <> f.confrelid;

  -- O alvo: a rede, toda linha com o tenant_id dela...
  insert into pg_temp.e2e_alvo values ('public.tenants'::regclass, jsonb_build_object('id', p_tenant));
  for v_tab in select * from pg_temp.e2e_tab where tem_tenant loop
    execute format('insert into pg_temp.e2e_alvo select %L::regclass, %s from %s c where c.tenant_id = $1 on conflict do nothing',
                   v_tab.tab, v_tab.json_c, v_tab.tab) using p_tenant;
  end loop;

  -- ... e o que pende delas pela chave, nas tabelas sem tenant_id, até parar de crescer.
  for v_n in 1..20 loop
    v_novos := 0;
    for v_fk in
      select fk.filho, fk.pai, fk.juncao, tf.json_c, tp.casa_p
      from pg_temp.e2e_fk fk
      join pg_temp.e2e_tab tf on tf.tab = fk.filho and not tf.tem_tenant
      join pg_temp.e2e_tab tp on tp.tab = fk.pai
      where fk.prende and exists (select 1 from pg_temp.e2e_alvo a where a.tab = fk.pai)
    loop
      execute format('insert into pg_temp.e2e_alvo select %L::regclass, %s from %s c join %s p on %s where %s on conflict do nothing',
                     v_fk.filho, v_fk.json_c, v_fk.filho, v_fk.pai, v_fk.juncao, v_fk.casa_p);
      get diagnostics v_certos = row_count;
      v_novos := v_novos + v_certos;
    end loop;
    exit when v_novos = 0;
  end loop;

  -- O aviso de agendamento de teste no sino de gente de VERDADE (sem chave: o id vai no data).
  insert into pg_temp.e2e_alvo
  select 'public.user_notifications'::regclass, jsonb_build_object('id', un.id)
  from public.user_notifications un
  where un.data->>'appointment_id' in (select a.k->>'id' from pg_temp.e2e_alvo a where a.tab = 'public.appointments'::regclass)
  on conflict do nothing;

  -- Os logins e os arquivos, ANTES de as linhas saírem.
  select array_agg(distinct x.auth_id) into v_auth from (
    select u.auth_id from public.users u
    where u.id in (select (a.k->>'id')::uuid from pg_temp.e2e_alvo a where a.tab = 'public.users'::regclass) and u.auth_id is not null
    union
    select cl.auth_id from public.clients cl
    where cl.id in (select (a.k->>'id')::uuid from pg_temp.e2e_alvo a where a.tab = 'public.clients'::regclass) and cl.auth_id is not null
  ) x;
  v_arquivos := jsonb_build_object(
    'client-documents', coalesce((select jsonb_agg(d.file_path) from public.client_documents d
      where d.id in (select (a.k->>'id')::uuid from pg_temp.e2e_alvo a where a.tab = 'public.client_documents'::regclass)
        and d.file_path is not null), '[]'::jsonb),
    'lgpd-exports', coalesce((select jsonb_agg(p.caminho) from (
        select l.export_json_path as caminho from public.lgpd_requests l
        where l.id in (select (a.k->>'id')::uuid from pg_temp.e2e_alvo a where a.tab = 'public.lgpd_requests'::regclass)
        union all
        select l.export_pdf_path from public.lgpd_requests l
        where l.id in (select (a.k->>'id')::uuid from pg_temp.e2e_alvo a where a.tab = 'public.lgpd_requests'::regclass)
      ) p where p.caminho is not null), '[]'::jsonb),
    'documentos-assinados', coalesce((select jsonb_agg(p.caminho) from (
        select s.scan_path as caminho from public.document_signatures s
        where s.id in (select (a.k->>'id')::uuid from pg_temp.e2e_alvo a where a.tab = 'public.document_signatures'::regclass)
        union all
        select d.signed_pdf_path from public.issued_documents d
        where d.id in (select (a.k->>'id')::uuid from pg_temp.e2e_alvo a where a.tab = 'public.issued_documents'::regclass)
      ) p where p.caminho is not null), '[]'::jsonb));

  -- A ordem: do mais fundo (mais longe da rede pelas chaves que prendem) para a rede.
  for v_n in 1..15 loop
    update pg_temp.e2e_tab t set prof = s.p
    from (select fk.filho, max(tp.prof) + 1 as p
          from pg_temp.e2e_fk fk join pg_temp.e2e_tab tp on tp.tab = fk.pai
          where fk.prende group by fk.filho) s
    where t.tab = s.filho and t.prof < s.p and s.p <= 40;
    get diagnostics v_certos = row_count;
    exit when v_certos = 0;
  end loop;

  -- Apaga. A tabela que a ordem não resolveu (um gatilho, uma chave fora do
  -- grafo) tenta de novo na passada seguinte; a rede, por último.
  for v_n in 1..12 loop
    v_certos := 0;
    for v_tab in
      select t.* from pg_temp.e2e_tab t
      where exists (select 1 from pg_temp.e2e_alvo a where a.tab = t.tab)
      order by (t.tab = 'public.tenants'::regclass), t.prof desc, t.tab::text
    loop
      if clock_timestamp() - v_inicio > interval '5 seconds' then v_incompleto := true; exit; end if;
      begin
        execute format('delete from %s x where %s', v_tab.tab, v_tab.casa_x);
        get diagnostics v_novos = row_count;
        if v_novos > 0 then
          v_apagou := v_apagou || jsonb_build_object(v_tab.tab::text, coalesce((v_apagou->>(v_tab.tab::text))::bigint, 0) + v_novos);
        end if;
        delete from pg_temp.e2e_alvo a where a.tab = v_tab.tab;
        v_restam := v_restam - (v_tab.tab::text);
        v_certos := v_certos + 1;
      exception when others then
        v_restam := v_restam || jsonb_build_object(v_tab.tab::text, sqlerrm);
      end;
    end loop;
    exit when v_incompleto or v_certos = 0 or not exists (select 1 from pg_temp.e2e_alvo);
  end loop;

  -- Os logins que ficaram sem dono: o apoio os apaga pela API do Auth.
  select coalesce(jsonb_agg(jsonb_build_object('id', u.id, 'email', u.email)), '[]'::jsonb) into v_logins
  from auth.users u
  where u.id::text = any(coalesce(v_auth, '{}'::text[]))
    and not exists (select 1 from public.users m where m.auth_id = u.id::text)
    and not exists (select 1 from public.clients c where c.auth_id = u.id::text)
    and not exists (select 1 from public.platform_staff s where s.auth_id = u.id);

  return jsonb_build_object(
    'ausente', false,
    'incompleto', v_incompleto,
    'apagou', v_apagou,
    'restam', case when v_incompleto then '{}'::jsonb else v_restam end,
    'logins', v_logins,
    'arquivos', v_arquivos,
    'ms', round(extract(epoch from clock_timestamp() - v_inicio) * 1000));
end
$$;

revoke execute on function public.e2e_apagar_rede(uuid) from public, anon, authenticated;
grant  execute on function public.e2e_apagar_rede(uuid) to service_role;

notify pgrst, 'reload schema';
