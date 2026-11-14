-- Bloco Estoque do plano de adaptação (docs/revisao.md, 2026-11-14).
-- O Heitor, 13/11: "Hoje o que é chamado de fornecedor vira marca. Adiciona
-- cadastro de fornecedor, igual ao de marca." · "Não existe fornecedor de
-- costume. Na entrada no estoque, escolhe fornecedor e marca." · categoria,
-- marca e fornecedor: criar, renomear, excluir — "é só quem tem permissão de
-- gerenciar".
--
-- DESTRUTIVA, autorizada pelo Heitor (o banco será zerado antes do lançamento;
-- nada se migra): sai o fornecedor do PRODUTO (products.supplier,
-- products.fornecedor_id e o gatilho) e o "arquivado" da lista de fornecedores.
-- A lista que se chamava Fornecedores continua sendo a de fornecedores no
-- esquema; as MARCAS são uma tabela nova, igual.

-- ─── 1. Marcas: um cadastro da rede, de texto livre ─────────────────────────
create table if not exists public.marcas (
  id         uuid primary key default gen_random_uuid(),
  tenant_id  uuid not null references public.tenants(id) on delete cascade,
  nome       text not null check (btrim(nome) <> '' and length(nome) <= 120),
  created_at timestamptz not null default now(),
  created_by text
);
create unique index if not exists marcas_nome_unico on public.marcas (tenant_id, public.chave_do_nome(nome));

alter table public.marcas enable row level security;
-- A sessão só LÊ (F63): quem grava é o servidor, depois do Estoque em Gerenciar.
drop policy if exists marcas_select on public.marcas;
create policy marcas_select on public.marcas for select to authenticated
  using ((tenant_id)::text = public.jwt_claim('tenant_id') and public.jwt_claim('role') <> 'CLIENT');
drop policy if exists suporte_sem_escrita_ins on public.marcas;
drop policy if exists suporte_sem_escrita_upd on public.marcas;
drop policy if exists suporte_sem_escrita_del on public.marcas;
create policy suporte_sem_escrita_ins on public.marcas as restrictive for insert
  with check (case when nullif(nullif(auth.jwt() ->> 'session_id', ''), 'null') is null then true
                   else not private.suporte_sem_escrita() end);
create policy suporte_sem_escrita_upd on public.marcas as restrictive for update
  using (case when nullif(nullif(auth.jwt() ->> 'session_id', ''), 'null') is null then true
              else not private.suporte_sem_escrita() end)
  with check (case when nullif(nullif(auth.jwt() ->> 'session_id', ''), 'null') is null then true
                   else not private.suporte_sem_escrita() end);
create policy suporte_sem_escrita_del on public.marcas as restrictive for delete
  using (case when nullif(nullif(auth.jwt() ->> 'session_id', ''), 'null') is null then true
              else not private.suporte_sem_escrita() end);

-- ─── 2. Fornecedores: criar, renomear, excluir (sai o arquivar) ─────────────
alter table public.fornecedores drop column if exists arquivado_em;

-- ─── 3. O produto NÃO tem marca nem fornecedor (E10) ────────────────────────
drop trigger if exists trg_fornecedor_do_produto on public.products;
alter table public.products drop column if exists fornecedor_id;
alter table public.products drop column if exists supplier;

-- ─── 4. A entrada guarda a marca e o fornecedor (E14) ───────────────────────
-- Excluir da lista não apaga a história: a ligação vira nula e o NOME gravado
-- no movimento fica (o Histórico mostra o que foi gravado).
alter table public.stock_movements add column if not exists marca_id uuid;
alter table public.stock_movements add column if not exists marca text;
alter table public.stock_movements drop constraint if exists stock_movements_marca_id_fkey;
alter table public.stock_movements add constraint stock_movements_marca_id_fkey
  foreign key (marca_id) references public.marcas(id) on delete set null;
alter table public.stock_movements drop constraint if exists stock_movements_fornecedor_id_fkey;
alter table public.stock_movements add constraint stock_movements_fornecedor_id_fkey
  foreign key (fornecedor_id) references public.fornecedores(id) on delete set null;
create index if not exists stock_movements_marca_id_idx on public.stock_movements (marca_id);

-- O nome escrito vira a linha da lista (a que existe, ou uma nova), em TODO
-- caminho que grava a entrada: a tela, o estoque inicial, o leitor, o Copilot.
-- O id escolhido vence o texto. Era private.fornecedor_da_lista, que também
-- servia ao produto.
create or replace function private.marca_e_fornecedor_da_lista()
returns trigger language plpgsql security definer set search_path = ''
as $$
declare
  v_tenant uuid;
  v_id     uuid;
  v_nome   text;
begin
  select b.tenant_id into v_tenant from public.branches b where b.id = new.branch_id;

  -- O fornecedor.
  if new.fornecedor_id is not null then
    select f.nome into v_nome from public.fornecedores f where f.id = new.fornecedor_id and f.tenant_id = v_tenant;
    if v_nome is null then
      raise exception 'Fornecedor não encontrado.' using errcode = 'P0001';
    end if;
    new.fornecedor := v_nome;
  elsif nullif(btrim(coalesce(new.fornecedor, '')), '') is not null then
    v_id := null; v_nome := null;
    insert into public.fornecedores (tenant_id, nome)
    values (v_tenant, regexp_replace(btrim(new.fornecedor), '\s+', ' ', 'g'))
    on conflict (tenant_id, public.chave_do_nome(nome)) do nothing;
    select f.id, f.nome into v_id, v_nome from public.fornecedores f
     where f.tenant_id = v_tenant and public.chave_do_nome(f.nome) = public.chave_do_nome(new.fornecedor);
    new.fornecedor_id := v_id; new.fornecedor := v_nome;
  else
    new.fornecedor := null;
  end if;

  -- A marca.
  v_nome := null;
  if new.marca_id is not null then
    select m.nome into v_nome from public.marcas m where m.id = new.marca_id and m.tenant_id = v_tenant;
    if v_nome is null then
      raise exception 'Marca não encontrada.' using errcode = 'P0001';
    end if;
    new.marca := v_nome;
  elsif nullif(btrim(coalesce(new.marca, '')), '') is not null then
    v_id := null;
    insert into public.marcas (tenant_id, nome)
    values (v_tenant, regexp_replace(btrim(new.marca), '\s+', ' ', 'g'))
    on conflict (tenant_id, public.chave_do_nome(nome)) do nothing;
    select m.id, m.nome into v_id, v_nome from public.marcas m
     where m.tenant_id = v_tenant and public.chave_do_nome(m.nome) = public.chave_do_nome(new.marca);
    new.marca_id := v_id; new.marca := v_nome;
  else
    new.marca := null;
  end if;

  return new;
end $$;

drop trigger if exists trg_fornecedor_do_movimento on public.stock_movements;
create trigger trg_marca_e_fornecedor_do_movimento before insert on public.stock_movements
  for each row execute function private.marca_e_fornecedor_da_lista();
drop function if exists private.fornecedor_da_lista();

-- ─── 5. estoque_entrada e estoque_inicial com a marca ───────────────────────
create or replace function public.estoque_entrada(
  p_produto uuid, p_unidade uuid, p_quantidade numeric, p_custo numeric, p_observacao text,
  p_lote text, p_validade timestamp with time zone, p_autor text,
  p_fornecedor text, p_nota_fiscal text, p_marca text)
returns numeric language plpgsql security definer set search_path to 'public'
as $function$
declare
  v_saldo        numeric;
  v_minimo       numeric;
  v_rendimento   numeric;
  v_upp          numeric;
  v_fator        numeric;
  v_novo_saldo   numeric;
  v_novo_rend    numeric;
  v_mov          uuid;
  v_lote         uuid;
begin
  if p_quantidade is null or p_quantidade <= 0 then
    raise exception 'Quantidade deve ser maior que zero.' using errcode = 'P0001';
  end if;

  select case when public.tem_unidade_de_consumo(p) then p.units_per_package end, public.fator_de_consumo(p)
    into v_upp, v_fator from public.products p where p.id = p_produto;
  v_fator := coalesce(v_fator, 1);

  insert into public.branch_product_stock (product_id, branch_id, current_stock, min_stock)
  values (p_produto, p_unidade, 0, 0)
  on conflict (product_id, branch_id) do nothing;

  select current_stock, min_stock, current_rendimento into v_saldo, v_minimo, v_rendimento
  from public.branch_product_stock
  where product_id = p_produto and branch_id = p_unidade
  for update;

  v_novo_saldo := coalesce(v_saldo, 0) + p_quantidade;
  v_rendimento := coalesce(v_rendimento, case when v_upp is not null then coalesce(v_saldo, 0) * v_upp end);
  v_novo_rend  := case when v_upp is not null and v_rendimento is not null then v_rendimento + p_quantidade * v_upp end;

  insert into public.stock_movements (branch_id, product_id, type, quantity, balance_after, unit_cost, notes, created_by, fornecedor, nota_fiscal, marca)
  values (p_unidade, p_produto, 'PURCHASE', p_quantidade * v_fator, coalesce(v_novo_rend, v_novo_saldo),
          p_custo / v_fator, p_observacao, p_autor,
          nullif(btrim(coalesce(p_fornecedor, '')), ''), nullif(btrim(coalesce(p_nota_fiscal, '')), ''),
          nullif(btrim(coalesce(p_marca, '')), ''))
  returning id into v_mov;

  update public.branch_product_stock
     set current_stock = v_novo_saldo, current_rendimento = v_novo_rend, updated_at = now()
   where product_id = p_produto and branch_id = p_unidade;

  if nullif(btrim(coalesce(p_lote, '')), '') is not null or p_validade is not null then
    insert into public.product_batches (product_id, branch_id, batch_number, expires_at, quantity)
    values (p_produto, p_unidade, nullif(btrim(coalesce(p_lote, '')), ''), p_validade, p_quantidade)
    returning id into v_lote;
    insert into public.stock_movement_batches (movement_id, batch_id, quantity)
    values (v_mov, v_lote, p_quantidade);
  end if;

  if p_custo is not null and p_custo > 0 then
    update public.products set cost_price = p_custo, updated_at = now() where id = p_produto;
  end if;

  return v_novo_saldo;
end;
$function$;
revoke execute on function public.estoque_entrada(uuid, uuid, numeric, numeric, text, text, timestamptz, text, text, text, text) from public, anon, authenticated;
grant execute on function public.estoque_entrada(uuid, uuid, numeric, numeric, text, text, timestamptz, text, text, text, text) to service_role;

-- A de 10 argumentos (sem a marca) passa a chamar a de 11.
create or replace function public.estoque_entrada(
  p_produto uuid, p_unidade uuid, p_quantidade numeric, p_custo numeric, p_observacao text,
  p_lote text, p_validade timestamp with time zone, p_autor text,
  p_fornecedor text, p_nota_fiscal text)
returns numeric language sql security definer set search_path to 'public'
as $function$
  select public.estoque_entrada(p_produto, p_unidade, p_quantidade, p_custo, p_observacao, p_lote, p_validade, p_autor, p_fornecedor, p_nota_fiscal, null::text)
$function$;

drop function if exists public.estoque_inicial(uuid, uuid, numeric, numeric, text, text, timestamptz, text, numeric, text, text);
create or replace function public.estoque_inicial(
  p_produto uuid, p_unidade uuid, p_quantidade numeric, p_custo numeric, p_observacao text,
  p_lote text, p_validade timestamp with time zone, p_autor text, p_minimo numeric,
  p_fornecedor text, p_nota_fiscal text, p_marca text)
returns numeric language plpgsql security definer set search_path to 'public'
as $function$
declare
  v_saldo numeric;
begin
  v_saldo := public.estoque_entrada(p_produto, p_unidade, p_quantidade, p_custo,
                                    p_observacao, p_lote, p_validade, p_autor, p_fornecedor, p_nota_fiscal, p_marca);
  if p_minimo is not null then
    update public.branch_product_stock set min_stock = p_minimo, updated_at = now()
     where product_id = p_produto and branch_id = p_unidade;
  end if;
  return v_saldo;
end;
$function$;
revoke execute on function public.estoque_inicial(uuid, uuid, numeric, numeric, text, text, timestamptz, text, numeric, text, text, text) from public, anon, authenticated;
grant execute on function public.estoque_inicial(uuid, uuid, numeric, numeric, text, text, timestamptz, text, numeric, text, text, text) to service_role;

-- ─── 6. O filtro de marca e de fornecedor (E15) ─────────────────────────────
-- "o filtro de marca ou fornecedor mostra os produtos que tem alguma entrada
-- dessa marca/fornecedor" (o Heitor, P4). Uma linha por produto × marca ×
-- fornecedor das ENTRADAS (a compra; a desfeita não conta), na rede — somada
-- no banco, para a lista não cortar em 1000.
create or replace function public.estoque_marcas_e_fornecedores_dos_produtos(p_tenant uuid)
returns table(product_id uuid, marca_id uuid, fornecedor_id uuid)
language sql stable security definer set search_path = ''
as $$
  select distinct m.product_id, m.marca_id, m.fornecedor_id
    from public.stock_movements m
    join public.branches b on b.id = m.branch_id and b.tenant_id = p_tenant
   where m.type = 'PURCHASE' and m.quantity > 0 and m.desfeita_em is null
     and (m.marca_id is not null or m.fornecedor_id is not null)
$$;
revoke execute on function public.estoque_marcas_e_fornecedores_dos_produtos(uuid) from public, anon, authenticated;
grant execute on function public.estoque_marcas_e_fornecedores_dos_produtos(uuid) to service_role;

notify pgrst, 'reload schema';
