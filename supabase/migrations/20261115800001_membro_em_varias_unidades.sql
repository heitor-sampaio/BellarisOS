-- EQ1a/EQ1b (Bloco Equipe do plano de adaptação, 2026-11-14): o membro ligado
-- a VÁRIAS unidades. "A rede inteira" continua sendo `users.branch_id` nulo;
-- com unidades marcadas, `branch_id` é a PRIMEIRA (a principal: o destino do
-- login, a claim `branch_id` do token) e as outras moram em
-- `users.outras_unidades`.
--
-- Por que uma coluna e não uma tabela membro × unidade: uma tabela com chave
-- estrangeira para `users` E `branches` o PostgREST lê como junção, e o embed
-- entre as duas quebra no sistema inteiro com PGRST201 (CLAUDE.md §14, o
-- incidente de 2026-11-04). O `atende_em` já é assim pelo mesmo motivo.
--
-- Sem backfill: o membro de hoje tem `outras_unidades = '{}'` e continua
-- exatamente como era (rede, ou uma unidade). Nada é destrutivo.

alter table public.users add column if not exists outras_unidades uuid[] not null default '{}';
create index if not exists users_outras_unidades_idx on public.users using gin (outras_unidades);

comment on column public.users.outras_unidades is
  'As unidades do membro além da principal (branch_id). Vazia com branch_id nulo (a rede inteira). EQ1a, 2026-11-14.';

-- A lista é sempre limpa: sem repetição, sem a principal, só unidades DA REDE
-- do membro (ativas ou não — a desativada que ficou continua alcançável), e
-- vazia para quem tem a rede inteira. Roda ANTES de `trg_atende_em_sincronizar`
-- (os gatilhos BEFORE disparam pela ordem do nome), que lê a lista limpa.
create or replace function private.unidades_do_membro_conferir()
returns trigger
language plpgsql
security definer
set search_path to ''
as $$
declare
  v_estranha uuid;
begin
  if new.branch_id is null then
    new.outras_unidades := '{}';
    return new;
  end if;
  new.outras_unidades := coalesce((
    select array_agg(distinct x order by x) from unnest(new.outras_unidades) x
     where x is not null and x <> new.branch_id), '{}');
  select x into v_estranha from unnest(new.outras_unidades) x
   where not exists (select 1 from public.branches b where b.id = x and b.tenant_id = new.tenant_id)
   limit 1;
  if v_estranha is not null then
    raise exception 'A unidade % não é desta rede.', v_estranha using errcode = '23503';
  end if;
  return new;
end $$;

drop trigger if exists trg_a_unidades_do_membro on public.users;
create trigger trg_a_unidades_do_membro
  before insert or update of branch_id, outras_unidades, tenant_id on public.users
  for each row execute function private.unidades_do_membro_conferir();

-- As OUTRAS unidades do membro desta sessão (a principal é a claim
-- `branch_id`). Lida pelo `auth.uid()`, da rede do token, só de membro ativo
-- com unidade (quem tem a rede inteira não precisa). Lida UMA vez por
-- transação (GUC local `bellaris.unidades`, chaveado pelo login — o Realtime
-- avalia vários inscritos na mesma transação): a política chama isto por
-- linha. Não mora em `jwt_claim`, que não consulta tabela.
-- ⚠️ Esta versão compara `auth_id` (texto) com `auth.uid()` (uuid) e dá 42883:
-- consertada na 20261115800002.
create or replace function private.minhas_outras_unidades()
returns uuid[]
language plpgsql
stable
security definer
set search_path to ''
as $$
declare
  v_uid text := coalesce(auth.uid()::text, '');
  v_c   text;
  v_r   uuid[];
begin
  if v_uid = '' then return '{}'; end if;
  v_c := current_setting('bellaris.unidades', true);
  if v_c is not null and v_c like v_uid || ':%' then
    return substr(v_c, length(v_uid) + 2)::uuid[];
  end if;
  select u.outras_unidades into v_r
    from public.users u
   where u.auth_id = auth.uid()
     and u.is_active
     and u.branch_id is not null
     and u.tenant_id::text = public.jwt_claim('tenant_id');
  v_r := coalesce(v_r, '{}');
  perform set_config('bellaris.unidades', v_uid || ':' || v_r::text, true);
  return v_r;
end $$;

-- A unidade está ao alcance da sessão: quem é da rede, qualquer uma da rede;
-- quem tem unidades, a principal (a claim) ou uma das outras.
create or replace function private.can_access_branch(p_branch_id uuid)
returns boolean
language sql
stable
security definer
set search_path to ''
as $$
  select case
    when public.eh_da_rede() then exists (
      select 1 from public.branches
      where id = p_branch_id
        and tenant_id = public.jwt_claim('tenant_id')::uuid
    )
    when p_branch_id is null then false
    when public.jwt_claim('branch_id')::uuid = p_branch_id then true
    else p_branch_id = any(private.minhas_outras_unidades())
  end
$$;

-- As unidades que a sessão de unidade lê: a dela e as outras dela.
drop policy if exists "Usuário vê própria filial" on public.branches;
create policy "Usuário vê própria filial" on public.branches
  for select to authenticated
  using (
    case
      when public.eh_da_rede() then tenant_id = (public.jwt_claim('tenant_id'))::uuid
      else (id = (public.jwt_claim('branch_id'))::uuid or id = any(private.minhas_outras_unidades()))
    end
  );

-- Os membros que a sessão de unidade lê: os que têm uma unidade em comum com
-- ela (a principal ou uma das outras, de um lado ou do outro).
drop policy if exists "Usuário vê membros do próprio tenant/filial" on public.users;
create policy "Usuário vê membros do próprio tenant/filial" on public.users
  for select to authenticated
  using (
    case
      when public.eh_da_rede() then tenant_id = (public.jwt_claim('tenant_id'))::uuid
      else tenant_id = (public.jwt_claim('tenant_id'))::uuid and (
        branch_id = (public.jwt_claim('branch_id'))::uuid
        or branch_id = any(private.minhas_outras_unidades())
        or outras_unidades && (array[(public.jwt_claim('branch_id'))::uuid] || private.minhas_outras_unidades())
      )
    end
  );

-- O "Atende" segue as unidades do membro (EQ1c): o padrão de quem atende sem
-- a lista é "as unidades dela" (a principal e as outras), não só a principal.
-- Recriado a partir do corpo de produção (20261106003601), só com isso.
create or replace function private.atende_em_sincronizar()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_padrao_antes uuid[];
  v_estranha     uuid;
begin
  if tg_op = 'INSERT' then
    if cardinality(new.atende_em) > 0 then
      new.provides_services := true;
    elsif new.provides_services then
      new.atende_em := case when new.branch_id is not null then array[new.branch_id] || coalesce(new.outras_unidades, '{}')
        else coalesce((select array_agg(b.id order by b.id) from branches b
                       where b.tenant_id = new.tenant_id and b.is_active), '{}') end;
    end if;
  else
    if new.atende_em is distinct from old.atende_em then
      new.provides_services := cardinality(new.atende_em) > 0;
    elsif new.provides_services is distinct from old.provides_services then
      if not new.provides_services then
        new.atende_em := '{}';
      elsif cardinality(new.atende_em) = 0 then
        new.atende_em := case when new.branch_id is not null then array[new.branch_id] || coalesce(new.outras_unidades, '{}')
          else coalesce((select array_agg(b.id order by b.id) from branches b
                         where b.tenant_id = new.tenant_id and b.is_active), '{}') end;
      end if;
    elsif (new.branch_id is distinct from old.branch_id or new.outras_unidades is distinct from old.outras_unidades)
          and new.provides_services then
      -- A lista seguia as unidades de antes? Segue as novas.
      v_padrao_antes := case when old.branch_id is not null
        then (select array_agg(distinct x order by x) from unnest(array[old.branch_id] || coalesce(old.outras_unidades, '{}')) x)
        else coalesce((select array_agg(b.id order by b.id) from branches b
                       where b.tenant_id = old.tenant_id and b.is_active), '{}') end;
      if (select array_agg(x order by x) from unnest(old.atende_em) x) is not distinct from v_padrao_antes then
        new.atende_em := case when new.branch_id is not null then array[new.branch_id] || coalesce(new.outras_unidades, '{}')
          else coalesce((select array_agg(b.id order by b.id) from branches b
                         where b.tenant_id = new.tenant_id and b.is_active), '{}') end;
      end if;
    end if;
  end if;

  -- Sem repetição, em ordem, e só unidades DA REDE do membro.
  new.atende_em := coalesce((select array_agg(distinct x order by x) from unnest(new.atende_em) x), '{}');
  select x into v_estranha from unnest(new.atende_em) x
   where not exists (select 1 from branches b where b.id = x and b.tenant_id = new.tenant_id)
   limit 1;
  if v_estranha is not null then
    raise exception 'A unidade % não é desta rede.', v_estranha using errcode = '23503';
  end if;
  return new;
end;
$function$;

notify pgrst, 'reload schema';
