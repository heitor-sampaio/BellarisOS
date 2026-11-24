-- Item 7 do escopo aprovado pelo Heitor em 18/11 ("motivos de perda
-- configuraveis, poder adicionar/editar/excluir"): os motivos da PERDA do
-- estoque deixam de ser a lista fixa (Vencido, Quebrou, Amostra, Uso interno —
-- D-7, 2026-10-29) e viram um cadastro da rede, ao lado das categorias, das
-- marcas e dos fornecedores. Quem mexe: quem tem o Estoque em Gerenciar, como
-- nas outras três listas (decisão do Claude, 26ª, por analogia ao Bloco
-- Estoque: "é só quem tem permissão de gerenciar") — a trava é da action.
--
-- Excluir é excluir, como nas marcas e fornecedores: o movimento GUARDA o nome
-- do motivo (`stock_movements.motivo_da_perda`, que passa a ser o nome) e a
-- ligação (`motivo_da_perda_id`) vira nula. A perda antiga continua dizendo o
-- nome dela no Histórico e no relatório.
--
-- E o item 6 ("o lote na tabela de perdas"): `metrics_perdas` devolve os lotes
-- de onde cada perda saiu. A mudança do retorno pede drop + create; o corpo é
-- o VIVO da produção (20261123600001; a única posterior que a toca, a
-- 20261128200002, só tirou a execução da sessão — o revoke/grant do fim
-- repete isso), com os trechos novos marcados. `estoque_perda_em` muda pelo
-- corpo vivo (`pg_temp.trocar_no_corpo`), que nenhuma posterior tocou.
--
-- O nome da tabela não é `motivos_de_perda`: o CRM já tem os motivos da perda
-- da OPORTUNIDADE (`crm_motivos_perda`, `private.motivos_perda_semear`).

-- ─── 1. O cadastro ──────────────────────────────────────────────────────────
create table if not exists public.estoque_motivos_de_perda (
  id         uuid primary key default gen_random_uuid(),
  tenant_id  uuid not null references public.tenants(id) on delete cascade,
  nome       text not null check (btrim(nome) <> '' and length(nome) <= 120),
  created_at timestamptz not null default now(),
  created_by text
);
create unique index if not exists estoque_motivos_de_perda_nome_unico
  on public.estoque_motivos_de_perda (tenant_id, public.chave_do_nome(nome));

alter table public.estoque_motivos_de_perda enable row level security;
-- A sessão NÃO lê nem grava (o Heitor, 19/11: a sessão nunca grava, e só lê
-- SINAIS — CLAUDE.md §4): tabela nova nasce SEM política permissiva nenhuma.
-- Quem lê é o servidor (lib/estoque/produtos-da-tela, cliente de serviço) e
-- quem grava é a action, depois do Estoque em Gerenciar. A trava
-- `e2e_leituras_pela_sessao()` exige isto.
-- As restritivas do suporte valem para toda tabela nova (20261008000010).
drop policy if exists suporte_sem_escrita_ins on public.estoque_motivos_de_perda;
drop policy if exists suporte_sem_escrita_upd on public.estoque_motivos_de_perda;
drop policy if exists suporte_sem_escrita_del on public.estoque_motivos_de_perda;
create policy suporte_sem_escrita_ins on public.estoque_motivos_de_perda as restrictive for insert
  with check (case when nullif(nullif(auth.jwt() ->> 'session_id', ''), 'null') is null then true else not private.suporte_sem_escrita() end);
create policy suporte_sem_escrita_upd on public.estoque_motivos_de_perda as restrictive for update
  using (case when nullif(nullif(auth.jwt() ->> 'session_id', ''), 'null') is null then true else not private.suporte_sem_escrita() end)
  with check (case when nullif(nullif(auth.jwt() ->> 'session_id', ''), 'null') is null then true else not private.suporte_sem_escrita() end);
create policy suporte_sem_escrita_del on public.estoque_motivos_de_perda as restrictive for delete
  using (case when nullif(nullif(auth.jwt() ->> 'session_id', ''), 'null') is null then true else not private.suporte_sem_escrita() end);

-- A Auditoria: é o que alguém FAZ (criar, renomear, excluir), como as marcas
-- (`plataforma.md`, a lista das tabelas de 20261116000001).
drop trigger if exists auditoria_ins on public.estoque_motivos_de_perda;
drop trigger if exists auditoria_upd on public.estoque_motivos_de_perda;
drop trigger if exists auditoria_del on public.estoque_motivos_de_perda;
create trigger auditoria_ins after insert on public.estoque_motivos_de_perda
  referencing new table as novas for each statement execute function private.auditar('normal', 'nome', '', '', '');
create trigger auditoria_upd after update on public.estoque_motivos_de_perda
  referencing old table as velhas new table as novas for each statement execute function private.auditar('normal', 'nome', '', '', '');
create trigger auditoria_del after delete on public.estoque_motivos_de_perda
  referencing old table as velhas for each statement execute function private.auditar('normal', 'nome', '', '', '');

-- ─── 2. A rede nasce com os motivos de hoje, como linhas editáveis ─────────
create or replace function private.estoque_motivos_de_perda_semear(p_tenant uuid)
returns void language sql security definer set search_path = ''
as $$
  insert into public.estoque_motivos_de_perda (tenant_id, nome, created_by)
  select p_tenant, v.nome, 'sistema'
    from (values ('Vencido'), ('Quebrou'), ('Amostra'), ('Uso interno')) as v(nome)
  on conflict (tenant_id, public.chave_do_nome(nome)) do nothing
$$;
revoke execute on function private.estoque_motivos_de_perda_semear(uuid) from public, anon, authenticated;

create or replace function private.trg_estoque_motivos_de_perda_na_rede_nova()
returns trigger language plpgsql security definer set search_path = ''
as $$
begin
  perform private.estoque_motivos_de_perda_semear(new.id);
  return new;
end $$;
revoke execute on function private.trg_estoque_motivos_de_perda_na_rede_nova() from public, anon, authenticated;

drop trigger if exists trg_estoque_motivos_de_perda_na_rede_nova on public.tenants;
create trigger trg_estoque_motivos_de_perda_na_rede_nova
  after insert on public.tenants
  for each row execute function private.trg_estoque_motivos_de_perda_na_rede_nova();

-- As redes que já existem.
select private.estoque_motivos_de_perda_semear(t.id) from public.tenants t;

-- ─── 3. O movimento guarda o nome e a ligação ───────────────────────────────
alter table public.stock_movements add column if not exists motivo_da_perda_id uuid;
alter table public.stock_movements drop constraint if exists stock_movements_motivo_da_perda_id_fkey;
alter table public.stock_movements add constraint stock_movements_motivo_da_perda_id_fkey
  foreign key (motivo_da_perda_id) references public.estoque_motivos_de_perda(id) on delete set null;
create index if not exists stock_movements_motivo_da_perda_id_idx on public.stock_movements (motivo_da_perda_id);

-- A lista fixa sai do banco: o motivo gravado é o NOME. A perda continua
-- exigindo um.
alter table public.stock_movements drop constraint if exists stock_movements_motivo_da_perda_check;

-- O motivo pelo id (o formulário) ou pelo nome; as quatro chaves de antes
-- ('VENCIDO'…) ainda se leem (chamadores internos e os movimentos gravados).
-- Da rede do PRODUTO: o motivo de outra rede não serve.
create or replace function private.motivo_da_perda_de(p_produto uuid, p_motivo text)
returns public.estoque_motivos_de_perda language sql stable security definer set search_path = ''
as $$
  select mp.*
    from public.estoque_motivos_de_perda mp
    join public.products p on p.id = p_produto and p.tenant_id = mp.tenant_id
   where mp.id::text = p_motivo
      or public.chave_do_nome(mp.nome) = public.chave_do_nome(case p_motivo
           when 'VENCIDO' then 'Vencido' when 'QUEBROU' then 'Quebrou'
           when 'AMOSTRA' then 'Amostra' when 'USO_INTERNO' then 'Uso interno'
           else p_motivo end)
   order by (mp.id::text = p_motivo) desc
   limit 1
$$;
revoke execute on function private.motivo_da_perda_de(uuid, text) from public, anon, authenticated;

-- As perdas de antes ganham o nome e a ligação ao motivo da rede delas.
update public.stock_movements m
   set motivo_da_perda    = mp.nome,
       motivo_da_perda_id = mp.id
  from public.branches b, public.estoque_motivos_de_perda mp
 where m.motivo_da_perda in ('VENCIDO', 'QUEBROU', 'AMOSTRA', 'USO_INTERNO')
   and b.id = m.branch_id
   and mp.tenant_id = b.tenant_id
   and public.chave_do_nome(mp.nome) = public.chave_do_nome(case m.motivo_da_perda
         when 'VENCIDO' then 'Vencido' when 'QUEBROU' then 'Quebrou'
         when 'AMOSTRA' then 'Amostra' else 'Uso interno' end);

alter table public.stock_movements add constraint stock_movements_motivo_da_perda_check
  check (type <> 'LOSS' or nullif(btrim(coalesce(motivo_da_perda, '')), '') is not null);

-- ─── 4. A perda grava o motivo da rede (trechos no corpo VIVO) ──────────────
create function pg_temp.trocar_no_corpo(p_fn regprocedure, p_de text[], p_para text[], p_vezes int[])
returns void language plpgsql as $f$
declare
  d text := pg_get_functiondef(p_fn);
  i int;
  n int;
begin
  for i in 1 .. array_length(p_de, 1) loop
    n := (length(d) - length(replace(d, p_de[i], ''))) / length(p_de[i]);
    if n <> p_vezes[i] then
      raise exception 'trecho % de %: achado % vez(es), esperado %', i, p_fn, n, p_vezes[i];
    end if;
    d := replace(d, p_de[i], p_para[i]);
  end loop;
  execute d;
end
$f$;

select pg_temp.trocar_no_corpo(
  'public.estoque_perda_em(uuid,uuid,uuid,numeric,boolean,text,text,text)'::regprocedure,
  array[
    $t$p_motivo is null or p_motivo not in ('VENCIDO', 'QUEBROU', 'AMOSTRA', 'USO_INTERNO')$t$,
    $t$reference, motivo_da_perda)$t$,
    $t$'lote:' || p_lote end, p_motivo$t$
  ],
  array[
    $t$(private.motivo_da_perda_de(p_produto, p_motivo)).id is null$t$,
    $t$reference, motivo_da_perda, motivo_da_perda_id)$t$,
    $t$'lote:' || p_lote end, (private.motivo_da_perda_de(p_produto, p_motivo)).nome, (private.motivo_da_perda_de(p_produto, p_motivo)).id$t$
  ],
  array[1, 1, 1]);

-- ─── 5. O relatório de perdas: o motivo da rede e os lotes ──────────────────
-- Agrupa pelo MOTIVO: o nome de hoje (renomear junta as perdas de antes e as
-- de depois); o excluído, pelo nome gravado no movimento. Os lotes de cada
-- produto × motivo vêm da ligação do gatilho do lote (`stock_movement_batches`).
drop function if exists public.metrics_perdas(uuid, uuid[], timestamptz, timestamptz);
create function public.metrics_perdas(p_tenant uuid, p_branch_ids uuid[], p_from timestamp with time zone, p_to timestamp with time zone)
 returns table(motivo text, product_id uuid, produto text, unidade text, embalagem text, quantidade numeric, embalagens numeric, custo numeric, movimentos bigint, lotes jsonb)
 language sql
 stable
 set search_path to ''
as $function$
  with perdas as (
    -- Item 7 (18/11): o motivo da rede (o nome de hoje; o excluído, o gravado).
    select coalesce(mp.nome, m.motivo_da_perda) as motivo, m.product_id,
           abs(m.quantity) as qtd,
           abs(m.quantity) / public.fator_de_consumo(p) as emb,
           public.custo_do_movimento(m, p) as custo,
           m.id as mov
      from public.stock_movements m
      join public.branches b on b.id = m.branch_id and b.tenant_id = p_tenant
      left join public.products p on p.id = m.product_id
      left join public.estoque_motivos_de_perda mp on mp.id = m.motivo_da_perda_id
     where m.type = 'LOSS' and m.quantity < 0 and m.desfeita_em is null
       and (p_branch_ids is null or m.branch_id = any (p_branch_ids))
       and m.created_at between p_from and p_to
    union all
    -- D5 da 10ª: o ajuste de inventário que achou MENOS é perda ("Inventário").
    -- D5 da 11ª: o desfeito não é, nem o movimento que desfaz um ajuste.
    -- A40 da 12ª: a entrega do brinde (voucher) não é inventário — vai abaixo.
    -- A10 da 24ª: a correção de cadastro não é perda.
    select 'INVENTARIO', m.product_id,
           abs(m.quantity),
           abs(m.quantity) / public.fator_de_consumo(p),
           public.custo_do_movimento(m, p),
           m.id
      from public.stock_movements m
      join public.branches b on b.id = m.branch_id and b.tenant_id = p_tenant
      left join public.products p on p.id = m.product_id
     where m.type = 'MANUAL_ADJUSTMENT' and m.quantity < 0
       and coalesce(m.reference, '') not like 'voucher:%'
       and not m.correcao_de_cadastro
       and m.desfeita_em is null
       and not exists (select 1 from public.stock_movements o where o.desfeita_pelo = m.id)
       and (p_branch_ids is null or m.branch_id = any (p_branch_ids))
       and m.created_at between p_from and p_to
    union all
    -- A40 da 12ª: o brinde da fidelidade entregue, pelo custo do lote.
    select 'BRINDE', m.product_id,
           abs(m.quantity),
           abs(m.quantity) / public.fator_de_consumo(p),
           public.custo_do_movimento(m, p),
           m.id
      from public.stock_movements m
      join public.branches b on b.id = m.branch_id and b.tenant_id = p_tenant
      left join public.products p on p.id = m.product_id
     where m.type = 'MANUAL_ADJUSTMENT' and m.quantity < 0
       and m.reference like 'voucher:%'
       and (p_branch_ids is null or m.branch_id = any (p_branch_ids))
       and m.created_at between p_from and p_to
    union all
    -- A venda estornada que não voltou: o que ainda estava com a cliente
    -- (sem o que a devolução em parte já levou).
    select 'VENDA_ESTORNADA', coalesce(i.product_id, v.product_id),
           (coalesce(i.quantity, v.quantity) - coalesce(i.devolvidas, 0)) * public.fator_de_consumo(p),
           (coalesce(i.quantity, v.quantity) - coalesce(i.devolvidas, 0))::numeric,
           coalesce(i.custo - coalesce(i.custo_devolvido, 0), v.custo),
           null::uuid
      from public.product_sales v
      join public.branches b on b.id = v.branch_id and b.tenant_id = p_tenant
      left join public.product_sale_items i on i.sale_id = v.id
      left join public.products p on p.id = coalesce(i.product_id, v.product_id)
     where v.tenant_id = p_tenant
       and v.estornada_em is not null and v.produto_voltou = false
       and coalesce(i.quantity, v.quantity) - coalesce(i.devolvidas, 0) > 0
       and (p_branch_ids is null or v.branch_id = any (p_branch_ids))
       and v.estornada_em between p_from and p_to
    union all
    -- A devolução em parte que não voltou ao estoque (A34 da 8ª).
    select 'VENDA_ESTORNADA', i.product_id,
           r.quantidade * public.fator_de_consumo(p),
           r.quantidade::numeric,
           r.custo,
           null::uuid
      from public.product_sale_returns r
      join public.product_sales v on v.id = r.sale_id
      join public.branches b on b.id = v.branch_id and b.tenant_id = p_tenant
      join public.product_sale_items i on i.id = r.item_id
      left join public.products p on p.id = i.product_id
     where r.tenant_id = p_tenant and not r.voltou
       and (p_branch_ids is null or v.branch_id = any (p_branch_ids))
       and r.created_at between p_from and p_to
  )
  select x.motivo,
         x.product_id,
         case when grouping(x.product_id) = 0 then max(p.name) end,
         case when grouping(x.product_id) = 0 then max(case when public.tem_unidade_de_consumo(p) then p.consumption_unit else p.unit end) end,
         case when grouping(x.product_id) = 0 then max(p.unit) end,
         case when grouping(x.product_id) = 0 then sum(x.qtd) end,
         case when grouping(x.product_id) = 0 then round(sum(x.emb), 4) end,
         round(coalesce(sum(x.custo), 0), 2),
         count(*),
         -- Item 6 (18/11): os lotes de onde as perdas da linha saíram.
         case when grouping(x.product_id) = 0 then (
           select coalesce(jsonb_agg(distinct jsonb_build_object('numero', pb.batch_number, 'validade', pb.expires_at)), '[]'::jsonb)
             from public.stock_movement_batches smb
             join public.product_batches pb on pb.id = smb.batch_id
            where smb.movement_id = any (array_agg(x.mov))
         ) end
    from perdas x
    left join public.products p on p.id = x.product_id
   group by grouping sets ((x.motivo, x.product_id), (x.motivo), ())
$function$;
revoke execute on function public.metrics_perdas(uuid, uuid[], timestamptz, timestamptz) from public, anon, authenticated;
grant execute on function public.metrics_perdas(uuid, uuid[], timestamptz, timestamptz) to service_role;

notify pgrst, 'reload schema';
