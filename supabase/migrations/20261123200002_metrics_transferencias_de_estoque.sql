-- A33 da 20ª simulação (2026-11-17; princípio 3): o relatório de Estoque não
-- mostrava a transferência entre unidades — só a Auditoria a mostrava. Esta é
-- a conta (CLAUDE.md §13.1: o número vem do banco), para a seção
-- "Transferências entre unidades" de Relatórios → Estoque.
--
-- Cada perna da transferência (`estoque_transferir`: TRANSFER_OUT na origem e
-- TRANSFER_IN no destino, ligadas pela `reference`) é uma linha da unidade
-- dela: "saiu para" ou "entrou de" a outra, com a quantidade (na unidade do
-- movimento e em embalagens) e o custo. O custo é o da SAÍDA, nas duas pernas
-- (a transferência não muda o valor — o lote que chega herda o custo do de
-- origem, `custo_do_lote`): os lotes que saíram, ao custo de cada um, e o que
-- nenhum lote cobre, ao custo do movimento (a conta de `custo_do_movimento`).
--
-- Agrupado no banco (grouping sets): por unidade × direção × outra unidade ×
-- produto, e o total de cada unidade × direção. Só o servidor chama.

create or replace function public.metrics_transferencias_de_estoque(
  p_tenant uuid, p_branch_ids uuid[], p_from timestamp with time zone, p_to timestamp with time zone)
 returns table(branch_id uuid, unidade text, direcao text, outra_id uuid, outra text,
               product_id uuid, produto text, unidade_medida text, embalagem text,
               quantidade numeric, embalagens numeric, custo numeric, movimentos bigint)
 language sql
 stable
 set search_path to ''
as $function$
  with movimentos as (
    select m.*, b.name as nome_da_unidade
      from public.stock_movements m
      join public.branches b on b.id = m.branch_id and b.tenant_id = p_tenant
     where m.type in ('TRANSFER_OUT', 'TRANSFER_IN')
       and (p_branch_ids is null or m.branch_id = any (p_branch_ids))
       and m.created_at between p_from and p_to
  ),
  pernas as (
    select m.branch_id, m.nome_da_unidade,
           case when m.type = 'TRANSFER_OUT' then 'SAIU' else 'ENTROU' end as direcao,
           o.branch_id as outra_id,
           m.product_id,
           abs(m.quantity) as qtd,
           abs(m.quantity) / public.fator_de_consumo(p) as emb,
           -- O custo da saída (a própria perna, ou a saída do mesmo par).
           (select coalesce(sum(abs(smb.quantity) * coalesce(public.custo_do_lote(smb.batch_id), s.unit_cost, public.custo_de_consumo(p), 0)), 0)
                 + greatest(abs(s.quantity) - coalesce(sum(abs(smb.quantity)), 0), 0) * coalesce(s.unit_cost, public.custo_de_consumo(p), 0)
              from public.stock_movements s
              left join public.stock_movement_batches smb on smb.movement_id = s.id
             where s.id = coalesce(
                     case when m.type = 'TRANSFER_OUT' then m.id end,
                     (select x.id from public.stock_movements x
                       where m.reference is not null and x.reference = m.reference and x.type = 'TRANSFER_OUT'
                         and x.product_id = m.product_id
                       limit 1),
                     m.id)
             group by s.id, s.quantity, s.unit_cost) as custo
      from movimentos m
      left join public.products p on p.id = m.product_id
      left join lateral (
        select x.branch_id from public.stock_movements x
         where m.reference is not null and x.reference = m.reference and x.id <> m.id
           and x.type in ('TRANSFER_OUT', 'TRANSFER_IN')
         limit 1
      ) o on true
  )
  select x.branch_id,
         max(x.nome_da_unidade),
         x.direcao,
         x.outra_id,
         case when grouping(x.product_id) = 0 then max(ob.name) end,
         x.product_id,
         case when grouping(x.product_id) = 0 then max(p.name) end,
         case when grouping(x.product_id) = 0 then max(case when public.tem_unidade_de_consumo(p) then p.consumption_unit else p.unit end) end,
         case when grouping(x.product_id) = 0 then max(p.unit) end,
         case when grouping(x.product_id) = 0 then sum(x.qtd) end,
         case when grouping(x.product_id) = 0 then round(sum(x.emb), 4) end,
         round(coalesce(sum(x.custo), 0), 2),
         count(*)
    from pernas x
    left join public.branches ob on ob.id = x.outra_id
    left join public.products p on p.id = x.product_id
   group by grouping sets ((x.branch_id, x.direcao, x.outra_id, x.product_id), (x.branch_id, x.direcao))
$function$;

revoke execute on function public.metrics_transferencias_de_estoque(uuid, uuid[], timestamp with time zone, timestamp with time zone) from public, anon, authenticated;
grant execute on function public.metrics_transferencias_de_estoque(uuid, uuid[], timestamp with time zone, timestamp with time zone) to service_role;

notify pgrst, 'reload schema';
