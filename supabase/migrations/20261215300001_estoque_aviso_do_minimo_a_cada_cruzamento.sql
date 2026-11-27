-- D1 da 36ª simulação (2026-11-27) — o aviso do estoque mínimo sai a CADA
-- cruzamento (ES-30 / NE-06: "uma vez a cada vez que cruza").
--
-- A Máscara, mínimo 5, foi 6 → 4 (cruzou às 02:27) → 3 → 7 (reposição) → 4
-- (cruzou de novo às 02:45), e o sino teve UM aviso, por volta das 03:02. O
-- aviso saía só da rotina de hora em hora (`avisarEstoqueMinimo`), que olhava o
-- ESTADO da linha (`branch_product_stock.minimo_avisado_em`): o que cruza, repõe
-- e cruza de novo entre duas passadas da rotina era um aviso só.
--
-- Agora o cruzamento se registra NA HORA do movimento, no banco (decisão do
-- Claude, 27/11, quanto à forma): um gatilho em `branch_product_stock` — que
-- todo caminho que mexe no saldo atravessa (concluir_atendimento,
-- desistir_do_atendimento, produto_vender*, entregar_voucher_produto,
-- estoque_entrada, estoque_ajuste*, estoque_perda_em, estoque_transferir, os
-- estoque_desfazer_*, o mínimo salvo à mão) — põe cada ENTRADA no mínimo na
-- fila `estoque_cruzamentos_do_minimo`. O aviso de cada um sai da fila, logo
-- depois do movimento (`avisarOMinimoDepois`, pelo after()) e, como rede de
-- segurança, pela rotina — reivindicado antes de avisar (CLAUDE.md §14).
--
-- A régua é a da TELA (`situacaoDoEstoque`, lib/estoque/situacao.ts, princípio
-- 3): o saldo da tela (`saldo_de_consumo`: o rendimento, quando o produto tem
-- unidade de consumo) contra o mínimo na mesma unidade (`fator_de_consumo`),
-- em 4 casas; "No mínimo" conta, e o zerado também (o mesmo `baixo` do envio).
-- Mudou lá, muda aqui.
--
-- O evento `estoque.abaixo_do_minimo` (on_stock_below_min) fica como está,
-- para as automações.
--
-- `minimo_avisado_em` perde o escritor (o código novo não o grava): o envio só
-- o lê para não repetir o cruzamento que a rotina de antes já avisou entre esta
-- migration e o código novo no ar.

-- ─── 1. A fila ──────────────────────────────────────────────────────────────
create table if not exists public.estoque_cruzamentos_do_minimo (
  id                 uuid primary key default gen_random_uuid(),
  tenant_id          uuid not null references public.tenants(id) on delete cascade,
  product_id         uuid not null,
  branch_id          uuid not null,
  -- Quando a linha ENTROU no mínimo.
  cruzou_em          timestamptz not null default now(),
  -- O saldo do cruzamento (o último, enquanto ainda não avisado): o aviso diz
  -- o que aconteceu, não o saldo de quando a rotina passou.
  current_stock      numeric not null,
  current_rendimento numeric,
  min_stock          numeric not null,
  -- Reivindicado: quem marca primeiro avisa.
  avisado_em         timestamptz,
  foreign key (product_id, branch_id) references public.branch_product_stock (product_id, branch_id) on delete cascade
);
create index if not exists estoque_cruzamentos_do_minimo_linha_idx on public.estoque_cruzamentos_do_minimo (product_id, branch_id);
create index if not exists estoque_cruzamentos_do_minimo_tenant_idx on public.estoque_cruzamentos_do_minimo (tenant_id);
create index if not exists estoque_cruzamentos_do_minimo_pendentes_idx
  on public.estoque_cruzamentos_do_minimo (cruzou_em) where avisado_em is null;

alter table public.estoque_cruzamentos_do_minimo enable row level security;
-- A sessão NÃO lê nem grava (o Heitor, 19/11: a sessão nunca grava, e só lê
-- SINAIS — CLAUDE.md §4): sem política permissiva nenhuma. Quem grava é o
-- gatilho; quem lê e reivindica é o servidor (cliente de serviço).
-- As restritivas do suporte valem para toda tabela nova (20261008000010).
drop policy if exists suporte_sem_escrita_ins on public.estoque_cruzamentos_do_minimo;
drop policy if exists suporte_sem_escrita_upd on public.estoque_cruzamentos_do_minimo;
drop policy if exists suporte_sem_escrita_del on public.estoque_cruzamentos_do_minimo;
create policy suporte_sem_escrita_ins on public.estoque_cruzamentos_do_minimo as restrictive for insert
  with check (case when nullif(nullif(auth.jwt() ->> 'session_id', ''), 'null') is null then true else not private.suporte_sem_escrita() end);
create policy suporte_sem_escrita_upd on public.estoque_cruzamentos_do_minimo as restrictive for update
  using (case when nullif(nullif(auth.jwt() ->> 'session_id', ''), 'null') is null then true else not private.suporte_sem_escrita() end)
  with check (case when nullif(nullif(auth.jwt() ->> 'session_id', ''), 'null') is null then true else not private.suporte_sem_escrita() end);
create policy suporte_sem_escrita_del on public.estoque_cruzamentos_do_minimo as restrictive for delete
  using (case when nullif(nullif(auth.jwt() ->> 'session_id', ''), 'null') is null then true else not private.suporte_sem_escrita() end);

comment on table public.estoque_cruzamentos_do_minimo is
  'Cada entrada de uma linha de estoque no mínimo ou abaixo (a régua da tela), na hora do movimento — '
  'um aviso no sino por linha (D1 da 36ª). Grava o gatilho de branch_product_stock; lê e reivindica o servidor.';

-- ─── 2. A régua da tela ─────────────────────────────────────────────────────
-- O espelho de `situacaoDoEstoque(...) === 'SEM_ESTOQUE' || estoqueBaixo(...)`
-- sobre a linha com mínimo (o `baixo` de lib/estoque/aviso-do-minimo.ts).
create or replace function private.estoque_avisa_no_minimo(s public.branch_product_stock, p public.products)
returns boolean
language sql
immutable
set search_path = ''
as $$
  select s.min_stock > 0
     and (   round(public.saldo_de_consumo(s, p), 4) <= 0
          or (    round(s.min_stock * public.fator_de_consumo(p), 4) > 0
              and round(public.saldo_de_consumo(s, p), 4) <= round(s.min_stock * public.fator_de_consumo(p), 4)))
$$;

revoke execute on function private.estoque_avisa_no_minimo(public.branch_product_stock, public.products) from public, anon, authenticated;
grant execute on function private.estoque_avisa_no_minimo(public.branch_product_stock, public.products) to service_role;

-- ─── 3. O gatilho: entrar no mínimo é um cruzamento ─────────────────────────
create or replace function private.estoque_registrar_cruzamento_do_minimo()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  p        public.products;
  v_tenant uuid;
  v_antes  boolean := false;
begin
  -- O marcador da linha que nasce (saldo 0; o de verdade vem no UPDATE da
  -- mesma transação — 20261110005402): não é cruzamento.
  if tg_op = 'INSERT' and new.current_stock = 0 and coalesce(new.current_rendimento, 0) = 0 then
    return null;
  end if;

  select * into p from public.products where id = new.product_id;
  if not found or not p.is_active or not private.estoque_avisa_no_minimo(new, p) then
    return null;   -- fora do mínimo: a próxima entrada nele é outro cruzamento
  end if;

  if tg_op = 'UPDATE' then
    -- A linha que nasceu nesta transação (o marcador) ainda não estava no mínimo.
    v_antes := not (old.current_stock = 0 and coalesce(old.current_rendimento, 0) = 0 and old.updated_at = now())
               and private.estoque_avisa_no_minimo(old, p);
  end if;

  if v_antes then
    -- Já estava no mínimo: não cruzou. O cruzamento ainda não avisado leva o
    -- saldo de agora (o aviso diz o último saldo dessa vez).
    update public.estoque_cruzamentos_do_minimo c
       set current_stock = new.current_stock, current_rendimento = new.current_rendimento, min_stock = new.min_stock
     where c.product_id = new.product_id and c.branch_id = new.branch_id and c.avisado_em is null;
    return null;
  end if;

  select b.tenant_id into v_tenant from public.branches b where b.id = new.branch_id;
  if v_tenant is null then return null; end if;

  insert into public.estoque_cruzamentos_do_minimo
    (tenant_id, product_id, branch_id, current_stock, current_rendimento, min_stock)
  values (v_tenant, new.product_id, new.branch_id, new.current_stock, new.current_rendimento, new.min_stock);
  return null;
end
$$;

revoke execute on function private.estoque_registrar_cruzamento_do_minimo() from public, anon, authenticated;

drop trigger if exists trg_estoque_cruzamento_do_minimo on public.branch_product_stock;
create trigger trg_estoque_cruzamento_do_minimo
  after insert or update of current_stock, current_rendimento, min_stock on public.branch_product_stock
  for each row execute function private.estoque_registrar_cruzamento_do_minimo();

-- ─── 4. O que já está no mínimo e a rotina ainda não avisou ─────────────────
-- A rotina de antes avisaria na próxima passada: entra na fila uma vez.
insert into public.estoque_cruzamentos_do_minimo
  (tenant_id, product_id, branch_id, current_stock, current_rendimento, min_stock)
select b.tenant_id, s.product_id, s.branch_id, s.current_stock, s.current_rendimento, s.min_stock
  from public.branch_product_stock s
  join public.products p on p.id = s.product_id
  join public.branches b on b.id = s.branch_id
 where s.minimo_avisado_em is null
   and p.is_active
   and private.estoque_avisa_no_minimo(s, p)
   and not exists (select 1 from public.estoque_cruzamentos_do_minimo c
                    where c.product_id = s.product_id and c.branch_id = s.branch_id and c.avisado_em is null);

comment on column public.branch_product_stock.minimo_avisado_em is
  'Era a marca do aviso do mínimo pelo ESTADO da linha (A48 da 11ª). Sem escritor desde a D1 da 36ª '
  '(a fila estoque_cruzamentos_do_minimo): o envio só a lê para não repetir o que a rotina de antes avisou.';

notify pgrst, 'reload schema';
