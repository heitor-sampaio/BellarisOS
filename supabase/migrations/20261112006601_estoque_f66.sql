-- F66 — Estoque (levantamento das regras: C16–C26, C63, C69, C71, C76).
-- Aditiva: nada se apaga. O texto livre do fornecedor (products.supplier,
-- stock_movements.fornecedor) FICA até a limpeza destrutiva, com o Heitor.

-- ─── 1. Fornecedores: um cadastro da rede (C76, D4 da 4ª volta) ─────────────
-- "temos uma nova entrada 'Fornecedor' que funciona igual a categoria, mas fica
-- disponível para escolha também na adição do estoque" (o Heitor, 11/11).

-- A chave do nome: sem diferenciar caixa nem espaços ("Distribuidora  Sul " =
-- "distribuidora sul").
create or replace function public.chave_do_nome(p text)
returns text language sql immutable set search_path = ''
as $$ select regexp_replace(lower(btrim(coalesce(p, ''))), '\s+', ' ', 'g') $$;

create table if not exists public.fornecedores (
  id           uuid primary key default gen_random_uuid(),
  tenant_id    uuid not null references public.tenants(id) on delete cascade,
  nome         text not null check (btrim(nome) <> '' and length(nome) <= 120),
  arquivado_em timestamptz,
  created_at   timestamptz not null default now(),
  created_by   text
);
create unique index if not exists fornecedores_nome_unico on public.fornecedores (tenant_id, public.chave_do_nome(nome));

alter table public.fornecedores enable row level security;
-- A sessão só LÊ (F63): quem grava é o servidor, depois da trava.
drop policy if exists fornecedores_select on public.fornecedores;
create policy fornecedores_select on public.fornecedores for select to authenticated
  using ((tenant_id)::text = public.jwt_claim('tenant_id') and public.jwt_claim('role') <> 'CLIENT');
drop policy if exists suporte_sem_escrita_ins on public.fornecedores;
drop policy if exists suporte_sem_escrita_upd on public.fornecedores;
drop policy if exists suporte_sem_escrita_del on public.fornecedores;
create policy suporte_sem_escrita_ins on public.fornecedores as restrictive for insert
  with check (case when nullif(nullif(auth.jwt() ->> 'session_id', ''), 'null') is null then true
                   else not private.suporte_sem_escrita() end);
create policy suporte_sem_escrita_upd on public.fornecedores as restrictive for update
  using (case when nullif(nullif(auth.jwt() ->> 'session_id', ''), 'null') is null then true
              else not private.suporte_sem_escrita() end)
  with check (case when nullif(nullif(auth.jwt() ->> 'session_id', ''), 'null') is null then true
                   else not private.suporte_sem_escrita() end);
create policy suporte_sem_escrita_del on public.fornecedores as restrictive for delete
  using (case when nullif(nullif(auth.jwt() ->> 'session_id', ''), 'null') is null then true
              else not private.suporte_sem_escrita() end);

alter table public.products        add column if not exists fornecedor_id uuid references public.fornecedores(id);
alter table public.stock_movements add column if not exists fornecedor_id uuid references public.fornecedores(id);
create index if not exists products_fornecedor_id_idx on public.products (fornecedor_id);
create index if not exists stock_movements_fornecedor_id_idx on public.stock_movements (fornecedor_id);

-- O nome escrito vira a linha da lista (a que existe, ou uma nova — "+ Novo
-- fornecedor" na entrada, princípio 7), em TODO caminho que grava: a tela, o
-- estoque inicial, o Copilot, a importação. O id escolhido vence o texto.
create or replace function private.fornecedor_da_lista()
returns trigger language plpgsql security definer set search_path = ''
as $$
declare
  v_tenant uuid;
  v_texto  text;
  v_id     uuid;
  v_nome   text;
begin
  if tg_table_name = 'products' then
    v_tenant := new.tenant_id; v_texto := new.supplier;
  else
    select b.tenant_id into v_tenant from public.branches b where b.id = new.branch_id;
    v_texto := new.fornecedor;
  end if;

  if new.fornecedor_id is not null and (tg_op = 'INSERT' or new.fornecedor_id is distinct from old.fornecedor_id) then
    select f.nome into v_nome from public.fornecedores f where f.id = new.fornecedor_id and f.tenant_id = v_tenant;
    if v_nome is null then
      raise exception 'Fornecedor não encontrado.' using errcode = 'P0001';
    end if;
  elsif nullif(btrim(coalesce(v_texto, '')), '') is null then
    new.fornecedor_id := null;
    return new;
  else
    select f.id, f.nome into v_id, v_nome from public.fornecedores f
     where f.tenant_id = v_tenant and public.chave_do_nome(f.nome) = public.chave_do_nome(v_texto);
    if v_id is null then
      insert into public.fornecedores (tenant_id, nome)
      values (v_tenant, regexp_replace(btrim(v_texto), '\s+', ' ', 'g'))
      on conflict (tenant_id, public.chave_do_nome(nome)) do nothing
      returning id, nome into v_id, v_nome;
      if v_id is null then
        select f.id, f.nome into v_id, v_nome from public.fornecedores f
         where f.tenant_id = v_tenant and public.chave_do_nome(f.nome) = public.chave_do_nome(v_texto);
      end if;
    end if;
    new.fornecedor_id := v_id;
  end if;

  if tg_table_name = 'products' then new.supplier := v_nome; else new.fornecedor := v_nome; end if;
  return new;
end $$;

drop trigger if exists trg_fornecedor_do_produto on public.products;
create trigger trg_fornecedor_do_produto before insert or update of supplier, fornecedor_id on public.products
  for each row execute function private.fornecedor_da_lista();
drop trigger if exists trg_fornecedor_do_movimento on public.stock_movements;
create trigger trg_fornecedor_do_movimento before insert on public.stock_movements
  for each row execute function private.fornecedor_da_lista();

-- A migração do texto livre: um fornecedor por nome (sem caixa e espaços), e os
-- registros passam a apontar para ele. O texto fica.
insert into public.fornecedores (tenant_id, nome)
select distinct on (x.t, public.chave_do_nome(x.n)) x.t, regexp_replace(btrim(x.n), '\s+', ' ', 'g')
  from (
    select p.tenant_id as t, p.supplier as n from public.products p
     where nullif(btrim(coalesce(p.supplier, '')), '') is not null
    union all
    select b.tenant_id, m.fornecedor from public.stock_movements m
      join public.branches b on b.id = m.branch_id
     where nullif(btrim(coalesce(m.fornecedor, '')), '') is not null
  ) x
 order by x.t, public.chave_do_nome(x.n), x.n
on conflict (tenant_id, public.chave_do_nome(nome)) do nothing;

update public.products p set fornecedor_id = f.id
  from public.fornecedores f
 where p.fornecedor_id is null and nullif(btrim(coalesce(p.supplier, '')), '') is not null
   and f.tenant_id = p.tenant_id and public.chave_do_nome(f.nome) = public.chave_do_nome(p.supplier);

update public.stock_movements m set fornecedor_id = f.id
  from public.branches b, public.fornecedores f
 where m.fornecedor_id is null and nullif(btrim(coalesce(m.fornecedor, '')), '') is not null
   and b.id = m.branch_id and f.tenant_id = b.tenant_id
   and public.chave_do_nome(f.nome) = public.chave_do_nome(m.fornecedor);

-- ─── 2. Quem cadastra e edita os produtos (C63, H8 da 2ª volta) ─────────────
-- "catalogo de produtos pode ser da rede ou da unidade, decisão da rede". O
-- padrão é o de hoje, a unidade (princípio 6: nada muda sozinho).
alter table public.tenants add column if not exists catalogo_de_produtos text not null default 'UNIDADE';
do $$ begin
  alter table public.tenants add constraint tenants_catalogo_de_produtos_check check (catalogo_de_produtos in ('UNIDADE', 'REDE'));
exception when duplicate_object then null; end $$;

-- ─── 3. O estoque inicial com o fornecedor e a nota (C16, os caminhos irmãos) ─
create or replace function public.estoque_inicial(
  p_produto uuid, p_unidade uuid, p_quantidade numeric, p_custo numeric, p_observacao text,
  p_lote text, p_validade timestamp with time zone, p_autor text, p_minimo numeric,
  p_fornecedor text, p_nota_fiscal text)
returns numeric language plpgsql security definer set search_path to 'public'
as $function$
declare
  v_saldo numeric;
begin
  v_saldo := public.estoque_entrada(p_produto, p_unidade, p_quantidade, p_custo,
                                    p_observacao, p_lote, p_validade, p_autor, p_fornecedor, p_nota_fiscal);
  if p_minimo is not null then
    update public.branch_product_stock set min_stock = p_minimo, updated_at = now()
     where product_id = p_produto and branch_id = p_unidade;
  end if;
  return v_saldo;
end;
$function$;
revoke execute on function public.estoque_inicial(uuid, uuid, numeric, numeric, text, text, timestamptz, text, numeric, text, text) from public, anon, authenticated;
grant execute on function public.estoque_inicial(uuid, uuid, numeric, numeric, text, text, timestamptz, text, numeric, text, text) to service_role;

-- ─── 4. Transferir confere no RENDIMENTO (C18) ─────────────────────────────
-- O frasco aberto contava inteiro (current_stock): com 1,5 frasco (150 ml),
-- transferir 2 passava e o destino ganhava 200 ml que não existiam. A conta é
-- o que a embalagem rende, e o saldo em embalagens é o rendimento arredondado
-- para cima, como no ajuste e na perda.
create or replace function public.estoque_transferir(p_produto uuid, p_origem uuid, p_destino uuid, p_quantidade numeric, p_observacao text, p_autor text)
 returns jsonb
 language plpgsql
 security definer
 set search_path to 'public'
as $function$
declare
  v_upp       numeric;
  v_unidade   text;
  v_de        numeric;
  v_de_rend   numeric;
  v_para      numeric;
  v_para_rend numeric;
  v_de_novo   numeric;
  v_para_novo numeric;
  v_disp      numeric;
  v_ref       text;
  v_nome_de   text;
  v_nome_para text;
  v_obs       text;
begin
  if p_quantidade is null or p_quantidade <= 0 then
    raise exception 'Quantidade deve ser maior que zero.' using errcode = 'P0001';
  end if;
  if p_origem = p_destino then
    raise exception 'Origem e destino devem ser filiais diferentes.' using errcode = 'P0001';
  end if;

  select case when public.tem_unidade_de_consumo(p) then p.units_per_package end, p.unit
    into v_upp, v_unidade from public.products p where p.id = p_produto;

  select b.name into v_nome_de   from public.branches b where b.id = p_origem;
  select b.name into v_nome_para from public.branches b where b.id = p_destino;
  v_obs := nullif(trim(coalesce(p_observacao, '')), '');

  insert into public.branch_product_stock (product_id, branch_id, current_stock, min_stock)
  values (p_produto, p_origem, 0, 0), (p_produto, p_destino, 0, 0)
  on conflict (product_id, branch_id) do nothing;
  perform 1 from public.branch_product_stock
   where product_id = p_produto and branch_id in (p_origem, p_destino)
   order by branch_id
     for update;

  select current_stock, current_rendimento into v_de, v_de_rend
    from public.branch_product_stock where product_id = p_produto and branch_id = p_origem;
  select current_stock, current_rendimento into v_para, v_para_rend
    from public.branch_product_stock where product_id = p_produto and branch_id = p_destino;
  v_de := coalesce(v_de, 0);
  v_para := coalesce(v_para, 0);

  if v_upp is not null then
    v_de_rend   := coalesce(v_de_rend, v_de * v_upp);
    v_para_rend := coalesce(v_para_rend, v_para * v_upp);
    v_disp      := greatest(v_de_rend, 0) / v_upp;
    if round(p_quantidade * v_upp, 6) > round(greatest(v_de_rend, 0), 6) then
      raise exception 'Estoque insuficiente na unidade de origem. Disponível: % % (o % aberto conta pelo que sobra nele).',
        replace(trim_scale(round(v_disp, 3))::text, '.', ','), v_unidade, v_unidade using errcode = 'P0001';
    end if;
    v_de_rend   := v_de_rend - p_quantidade * v_upp;
    v_para_rend := v_para_rend + p_quantidade * v_upp;
    v_de_novo   := ceil(round(v_de_rend / v_upp, 6));
    v_para_novo := ceil(round(v_para_rend / v_upp, 6));
  else
    if p_quantidade > v_de then
      raise exception 'Estoque insuficiente na unidade de origem. Disponível: % %.', replace(trim_scale(round(greatest(v_de, 0), 3))::text, '.', ','), v_unidade using errcode = 'P0001';
    end if;
    v_de_rend := null; v_para_rend := null;
    v_de_novo := v_de - p_quantidade;
    v_para_novo := v_para + p_quantidade;
  end if;

  v_ref := 'TRANSFER-' || gen_random_uuid();
  insert into public.stock_movements (branch_id, product_id, type, quantity, balance_after, notes, reference, created_by)
  values
    (p_origem,  p_produto, 'TRANSFER_OUT', -p_quantidade * coalesce(v_upp, 1), coalesce(v_de_rend, v_de_novo),
     concat_ws(' ', 'Transferência para ' || coalesce(v_nome_para, 'outra unidade') || '.', v_obs),
     v_ref, p_autor),
    (p_destino, p_produto, 'TRANSFER_IN',   p_quantidade * coalesce(v_upp, 1), coalesce(v_para_rend, v_para_novo),
     concat_ws(' ', 'Transferência de ' || coalesce(v_nome_de, 'outra unidade') || '.', v_obs),
     v_ref, p_autor);

  update public.branch_product_stock
     set current_stock = v_de_novo, current_rendimento = v_de_rend, updated_at = now()
   where product_id = p_produto and branch_id = p_origem;
  update public.branch_product_stock
     set current_stock = v_para_novo, current_rendimento = v_para_rend, updated_at = now()
   where product_id = p_produto and branch_id = p_destino;

  return jsonb_build_object('origem', coalesce(v_de_rend / v_upp, v_de_novo), 'destino', coalesce(v_para_rend / v_upp, v_para_novo));
end $function$;

-- ─── 5. O custo da perda é o do LOTE (C20, D2 da 10ª) ──────────────────────
-- Olhava só a compra (PURCHASE): o lote do ajuste e o da transferência ficavam
-- sem custo, e a parte que nenhum lote cobre era ignorada na média. Agora é a
-- regra do valor em estoque (valor_do_saldo): cada lote ao custo_do_lote, e o
-- que nenhum lote cobre ao último custo.
create or replace function public.estoque_perda_em(p_produto uuid, p_unidade uuid, p_lote uuid, p_quantidade numeric, p_em_consumo boolean, p_motivo text, p_observacao text, p_autor text)
 returns numeric
 language plpgsql
 security definer
 set search_path to ''
as $function$
declare
  v_p          public.products%rowtype;
  v_upp        numeric;
  v_fator      numeric;
  v_saldo      numeric;
  v_rend       numeric;
  v_lote_qtd   numeric;
  v_custo      numeric;
  v_ultimo     numeric;
  v_novo_rend  numeric;
  v_novas      numeric;
  v_falta      numeric;
  v_tira       numeric;
  v_soma       numeric := 0;
  v_peso       numeric := 0;
  v_l          record;
  v_consumo    boolean;
  v_emb        numeric;
  v_cons       numeric;
  v_un         text;
begin
  if p_motivo is null or p_motivo not in ('VENCIDO', 'QUEBROU', 'AMOSTRA', 'USO_INTERNO') then
    raise exception 'Escolha o motivo da perda.' using errcode = 'P0001';
  end if;
  if p_quantidade is null or p_quantidade <= 0 then
    raise exception 'Quantidade deve ser maior que zero.' using errcode = 'P0001';
  end if;

  select * into v_p from public.products p where p.id = p_produto;
  if not found then
    raise exception 'Produto não encontrado.' using errcode = 'no_data_found';
  end if;
  if not exists (select 1 from public.branches b where b.id = p_unidade and b.tenant_id = v_p.tenant_id) then
    raise exception 'Unidade não encontrada.' using errcode = 'no_data_found';
  end if;

  v_upp     := case when public.tem_unidade_de_consumo(v_p) then v_p.units_per_package end;
  v_fator   := public.fator_de_consumo(v_p);
  v_ultimo  := public.custo_de_consumo(v_p);
  v_consumo := coalesce(p_em_consumo, false) and v_upp is not null;
  v_emb     := case when v_consumo then p_quantidade / v_upp else p_quantidade end;
  v_cons    := case when v_upp is null then null when v_consumo then p_quantidade else p_quantidade * v_upp end;
  v_un      := case when v_consumo then v_p.consumption_unit else v_p.unit end;

  select s.current_stock, s.current_rendimento into v_saldo, v_rend
    from public.branch_product_stock s
   where s.product_id = p_produto and s.branch_id = p_unidade
   for update;
  if not found then
    raise exception 'Não há estoque deste produto nesta unidade.' using errcode = 'P0001';
  end if;

  if p_lote is not null then
    select b.quantity into v_lote_qtd
      from public.product_batches b
     where b.id = p_lote and b.product_id = p_produto and b.branch_id = p_unidade
     for update;
    if not found then
      raise exception 'Lote não encontrado nesta unidade.' using errcode = 'P0001';
    end if;
    if v_emb > v_lote_qtd + 0.0001 then
      raise exception 'O lote tem só % %.',
        trim_scale(round(greatest(case when v_consumo then v_lote_qtd * v_upp else v_lote_qtd end, 0), 2)), v_un using errcode = 'P0001';
    end if;
  end if;

  if v_upp is not null then
    v_rend := coalesce(v_rend, coalesce(v_saldo, 0) * v_upp);
    if v_cons > v_rend + 0.0001 then
      raise exception 'Estoque insuficiente: há % % nesta unidade.',
        trim_scale(round(greatest(case when v_consumo then v_rend else v_rend / v_upp end, 0), 2)), v_un using errcode = 'P0001';
    end if;
    v_novo_rend := v_rend - v_cons;
    v_novas     := ceil(round(v_novo_rend / v_upp, 6));
  else
    if p_quantidade > coalesce(v_saldo, 0) + 0.0001 then
      raise exception 'Estoque insuficiente: há % % nesta unidade.',
        trim_scale(round(greatest(coalesce(v_saldo, 0), 0), 2)), v_p.unit using errcode = 'P0001';
    end if;
    v_novas     := coalesce(v_saldo, 0) - p_quantidade;
    v_novo_rend := null;
  end if;

  if p_lote is not null then
    v_custo := coalesce(public.custo_do_lote(p_lote), v_ultimo);
  else
    v_falta := v_emb;
    for v_l in
      select b.id, b.quantity, coalesce(public.custo_do_lote(b.id), v_ultimo) as custo
        from public.product_batches b
       where b.product_id = p_produto and b.branch_id = p_unidade and b.quantity > 0
       order by coalesce((b.expires_at at time zone 'UTC')::date < (now() at time zone public.fuso_da_unidade(b.branch_id))::date, false), b.expires_at nulls last, b.received_at
    loop
      exit when v_falta <= 0;
      v_tira := least(v_l.quantity, v_falta);
      if v_l.custo is not null then
        v_soma := v_soma + v_tira * v_l.custo;
        v_peso := v_peso + v_tira;
      end if;
      v_falta := v_falta - v_tira;
    end loop;
    -- O que nenhum lote cobre sai ao último custo (a regra do valor em estoque).
    if v_falta > 0 and v_ultimo is not null then
      v_soma := v_soma + v_falta * v_ultimo;
      v_peso := v_peso + v_falta;
    end if;
    if v_peso > 0 then v_custo := v_soma / v_peso; end if;
  end if;
  v_custo := coalesce(v_custo, v_ultimo);

  insert into public.stock_movements
    (branch_id, product_id, type, quantity, balance_after, unit_cost, notes, created_by, reference, motivo_da_perda)
  values (
    p_unidade, p_produto, 'LOSS', -(coalesce(v_cons, p_quantidade * v_fator)), coalesce(v_novo_rend, v_novas), v_custo,
    nullif(btrim(coalesce(p_observacao, '')), ''), coalesce(p_autor, 'sistema'),
    case when p_lote is not null then 'lote:' || p_lote end, p_motivo
  );

  update public.branch_product_stock
     set current_stock = v_novas, current_rendimento = v_novo_rend, updated_at = now()
   where product_id = p_produto and branch_id = p_unidade;

  return v_novas;
end $function$;

-- ─── 6. O custo da venda de produto também (C20) ───────────────────────────
do $$
declare
  d text;
  antes text;
begin
  d := pg_get_functiondef('public.produto_vender_itens(uuid,uuid,uuid,uuid,uuid,jsonb,numeric,jsonb)'::regprocedure);
  antes := d;
  d := replace(d,
$a$      select b.id, b.quantity,
             (select m.unit_cost from public.stock_movement_batches smb
                join public.stock_movements m on m.id = smb.movement_id
               where smb.batch_id = b.id and m.type = 'PURCHASE' and m.unit_cost is not null limit 1) as custo
        from public.product_batches b
       where b.product_id = v_it.product_id$a$,
$b$      select b.id, b.quantity, coalesce(public.custo_do_lote(b.id), public.custo_de_consumo(v_p)) as custo
        from public.product_batches b
       where b.product_id = v_it.product_id$b$);
  d := replace(d,
$a$    v_custo_un := case when v_peso > 0 then v_soma / v_peso else public.custo_de_consumo(v_p) end;$a$,
$b$    -- C20 (F66): o que nenhum lote cobre sai ao último custo, como no valor em estoque.
    if v_falta > 0 and public.custo_de_consumo(v_p) is not null then
      v_soma := v_soma + v_falta * public.custo_de_consumo(v_p);
      v_peso := v_peso + v_falta;
    end if;
    v_custo_un := case when v_peso > 0 then v_soma / v_peso else public.custo_de_consumo(v_p) end;$b$);
  if d = antes or position('custo_do_lote(b.id)' in d) = 0 or position('C20 (F66)' in d) = 0 then
    raise exception 'produto_vender_itens: o trecho do custo não foi achado';
  end if;
  execute d;
end $$;

-- ─── 7. "Desfazer perda" (C69, H12 = a) ───────────────────────────────────
-- A última perda do produto na unidade se desfaz, com o motivo: a quantidade
-- volta ao MESMO lote de onde saiu (e o que saiu sem lote, ao saldo solto), o
-- movimento fica (nada se apaga) e a perda sai de "Perdas no período".
create or replace function public.estoque_desfazer_perda(p_tenant uuid, p_movimento uuid, p_motivo text, p_autor text)
returns numeric language plpgsql security definer set search_path = ''
as $$
declare
  v_m          public.stock_movements%rowtype;
  v_p          public.products%rowtype;
  v_fator      numeric;
  v_upp        numeric;
  v_qtd        numeric;
  v_saldo      numeric;
  v_rendimento numeric;
  v_novas      numeric;
  v_novo_rend  numeric;
  v_mov        uuid;
  v_lig        record;
begin
  if coalesce(btrim(p_motivo), '') = '' then
    raise exception 'Diga por que a perda é desfeita.' using errcode = 'P0001';
  end if;

  select m.* into v_m
    from public.stock_movements m
    join public.branches b on b.id = m.branch_id and b.tenant_id = p_tenant
   where m.id = p_movimento and m.type = 'LOSS' and m.quantity < 0
   for update of m;
  if not found then
    raise exception 'Perda não encontrada.' using errcode = 'P0001';
  end if;
  if v_m.desfeita_em is not null then
    raise exception 'Esta perda já foi desfeita.' using errcode = 'P0001';
  end if;
  if exists (select 1 from public.stock_movements o
              where o.product_id = v_m.product_id and o.branch_id = v_m.branch_id
                and o.type = 'LOSS' and o.quantity < 0 and o.desfeita_em is null
                and (o.created_at, o.id) > (v_m.created_at, v_m.id)) then
    raise exception 'Só a última perda do produto nesta unidade se desfaz: desfaça antes a mais recente.' using errcode = 'P0001';
  end if;

  select * into v_p from public.products p where p.id = v_m.product_id;
  v_fator := coalesce(public.fator_de_consumo(v_p), 1);
  v_upp   := case when public.tem_unidade_de_consumo(v_p) then v_p.units_per_package end;
  v_qtd   := abs(v_m.quantity);

  insert into public.branch_product_stock (product_id, branch_id, current_stock, min_stock)
  values (v_m.product_id, v_m.branch_id, 0, 0)
  on conflict (product_id, branch_id) do nothing;
  select s.current_stock, s.current_rendimento into v_saldo, v_rendimento
    from public.branch_product_stock s
   where s.product_id = v_m.product_id and s.branch_id = v_m.branch_id
   for update;

  if v_upp is not null then
    v_novo_rend := coalesce(v_rendimento, coalesce(v_saldo, 0) * v_upp) + v_qtd;
    v_novas     := ceil(round(v_novo_rend / v_upp, 6));
  else
    v_novo_rend := null;
    v_novas     := coalesce(v_saldo, 0) + v_qtd / v_fator;
  end if;

  -- Positivo: o gatilho do lote não mexe nele; a volta a cada lote é daqui.
  insert into public.stock_movements (branch_id, product_id, type, quantity, balance_after, unit_cost, notes, created_by, motivo_da_perda)
  values (v_m.branch_id, v_m.product_id, 'LOSS', v_qtd, coalesce(v_novo_rend, v_novas), v_m.unit_cost,
          'Perda desfeita: ' || btrim(p_motivo), coalesce(p_autor, 'sistema'), v_m.motivo_da_perda)
  returning id into v_mov;

  for v_lig in
    select smb.batch_id as v_batch, smb.quantity as v_quant
      from public.stock_movement_batches smb
     where smb.movement_id = v_m.id
  loop
    update public.product_batches set quantity = quantity + v_lig.v_quant where id = v_lig.v_batch;
    insert into public.stock_movement_batches (movement_id, batch_id, quantity)
    values (v_mov, v_lig.v_batch, v_lig.v_quant);
  end loop;

  update public.branch_product_stock
     set current_stock = v_novas, current_rendimento = v_novo_rend, updated_at = now()
   where product_id = v_m.product_id and branch_id = v_m.branch_id;

  update public.stock_movements
     set desfeita_em = now(), desfeita_por = p_autor, desfeita_motivo = btrim(p_motivo), desfeita_pelo = v_mov
   where id = v_m.id;

  return v_novas;
end $$;
revoke execute on function public.estoque_desfazer_perda(uuid, uuid, text, text) from public, anon, authenticated;
grant execute on function public.estoque_desfazer_perda(uuid, uuid, text, text) to service_role;

-- A perda desfeita (e o movimento que a desfaz, positivo) sai de "Perdas no período".
do $$
declare
  d text;
  antes text;
begin
  d := pg_get_functiondef('public.metrics_perdas(uuid,uuid[],timestamptz,timestamptz)'::regprocedure);
  antes := d;
  d := replace(d,
$a$     where m.type = 'LOSS'
       and (p_branch_ids is null$a$,
$b$     where m.type = 'LOSS' and m.quantity < 0 and m.desfeita_em is null
       and (p_branch_ids is null$b$);
  if d = antes then
    raise exception 'metrics_perdas: o trecho da perda não foi achado';
  end if;
  execute d;
end $$;

-- ─── 8. "Itens críticos" conta PRODUTOS, pela régua da tela (C21, D19) ─────
-- Contava pares produto × unidade, e pelas embalagens arredondadas (o frasco
-- aberto inteiro): a tela diz "No mínimo ou abaixo" no rendimento, um por produto.
do $$
declare
  d text;
  antes text;
begin
  d := pg_get_functiondef('public.metrics_relatorio(uuid,uuid[],timestamptz,timestamptz,timestamptz,timestamptz,text,text,uuid)'::regprocedure);
  antes := d;
  d := replace(d,
$a$               pr.category, pr.is_active
        from unnest(unidades) as u(id)$a$,
$b$               pr.category, pr.is_active, pr.id as product_id,
               coalesce(s.product_id is not null and s.min_stock > 0
                 and public.saldo_de_consumo(s, pr) > 0
                 and round(public.saldo_de_consumo(s, pr), 6) <= round(s.min_stock * public.fator_de_consumo(pr), 6), false) as critico
        from unnest(unidades) as u(id)$b$);
  d := replace(d,
$a$'criticos', (select count(*) from saldo where current_stock > 0 and min_stock > 0 and current_stock <= min_stock),$a$,
$b$'criticos', (select count(distinct product_id) from saldo where critico and is_active),$b$);
  d := replace(d,
$a$count(*) filter (where current_stock > 0 and min_stock > 0 and current_stock <= min_stock) criticos,$a$,
$b$count(*) filter (where critico and is_active) criticos,$b$);
  if position('count(distinct product_id) from saldo where critico' in d) = 0
     or position('filter (where critico and is_active) criticos' in d) = 0
     or position('as critico' in d) = 0 then
    raise exception 'metrics_relatorio: o trecho dos críticos não foi achado';
  end if;
  execute d;
end $$;

-- ─── 9. O aviso do lote vencendo: uma vez por lote, com a linha reivindicada (C25)
alter table public.product_batches add column if not exists vencimento_avisado_em timestamptz;
-- O lote que já foi avisado (há aviso com o id dele) não avisa de novo.
update public.product_batches b set vencimento_avisado_em = now()
 where b.vencimento_avisado_em is null
   and exists (select 1 from public.user_notifications n
                where n.type = 'batch_expiring' and n.data ->> 'lote_id' = b.id::text);

notify pgrst, 'reload schema';
