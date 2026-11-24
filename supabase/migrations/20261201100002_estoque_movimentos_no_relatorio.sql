-- Item 6 do escopo aprovado pelo Heitor em 18/11 ("ok"): Relatórios →
-- Estoque ganha a lista das movimentações do período — data, produto, tipo,
-- quantidade, lote/validade, unidade, quem fez e o custo. O relatório já
-- mostrava o valor, o consumo, as perdas e o giro, mas não as entradas e
-- saídas.
--
-- É leitura de REGISTRO, com o cuidado de indicador: o filtro (rede, unidades
-- do recorte, período) vai no banco, a página é do banco (limit/offset — o
-- PostgREST corta em 1000), o total vem junto (count(*) over ()), o custo é o
-- de `custo_do_movimento` (a regra única do custo do movimento, §9.5) e cada
-- linha traz o fuso da UNIDADE dela, para a tela dizer o dia e a hora no
-- relógio de quem fez. Só o servidor chama.
create or replace function public.metrics_movimentos_de_estoque(
  p_tenant uuid, p_branch_ids uuid[], p_from timestamptz, p_to timestamptz, p_limite integer, p_offset integer)
returns table(
  id uuid, created_at timestamptz, fuso text, branch_id uuid, unidade text, product_id uuid, produto text,
  type text, quantity numeric, medida text, embalagem text, embalagens numeric, reference text,
  correcao_de_cadastro boolean, motivo_da_perda text, desfeita boolean, desfaz boolean, lotes jsonb,
  quem text, custo numeric, total bigint)
language sql stable set search_path = ''
as $$
  select m.id, m.created_at, public.fuso_da_unidade(m.branch_id), m.branch_id, b.name, m.product_id, p.name,
         m.type::text, m.quantity,
         case when public.tem_unidade_de_consumo(p) then p.consumption_unit else p.unit end,
         p.unit,
         round(m.quantity / public.fator_de_consumo(p), 4),
         m.reference, coalesce(m.correcao_de_cadastro, false),
         -- O nome GRAVADO (o Histórico diz o mesmo; o motivo excluído continua aqui).
         m.motivo_da_perda,
         m.desfeita_em is not null,
         -- Este movimento desfaz outro ("Ajuste desfeito", "Perda desfeita"…).
         exists (select 1 from public.stock_movements o where o.desfeita_pelo = m.id),
         -- Os lotes do movimento: de onde saiu, ou o que a entrada criou (o gatilho do lote).
         (select coalesce(jsonb_agg(jsonb_build_object('numero', pb.batch_number, 'validade', pb.expires_at)
                                    order by pb.expires_at nulls last, pb.batch_number), '[]'::jsonb)
            from public.stock_movement_batches smb
            join public.product_batches pb on pb.id = smb.batch_id
           where smb.movement_id = m.id),
         -- Quem fez: o membro da rede gravado em created_by.
         coalesce(u.name, case when m.created_by = 'sistema' then 'Sistema' end),
         round(public.custo_do_movimento(m, p), 2),
         count(*) over ()
    from public.stock_movements m
    join public.branches b on b.id = m.branch_id and b.tenant_id = p_tenant
    join public.products p on p.id = m.product_id
    left join public.users u on u.id::text = m.created_by and u.tenant_id = p_tenant
   where (p_branch_ids is null or m.branch_id = any (p_branch_ids))
     and m.created_at between p_from and p_to
   order by m.created_at desc, m.id desc
   limit p_limite offset p_offset
$$;
revoke execute on function public.metrics_movimentos_de_estoque(uuid, uuid[], timestamptz, timestamptz, integer, integer) from public, anon, authenticated;
grant execute on function public.metrics_movimentos_de_estoque(uuid, uuid[], timestamptz, timestamptz, integer, integer) to service_role;

notify pgrst, 'reload schema';
