-- D19 da 8ª simulação (2026-11-06): "Itens zerados" divergia. Relatórios →
-- Estoque da rede dizia 1 (o Hidratante × Água Verde, que nunca teve entrada
-- lá) e o Estoque da rede "Sem estoque 0" (o Hidratante tem saldo no Batel):
-- metrics_relatorio contava PARES unidade × produto (D10 da 6ª, migration
-- 20261104002102), e a tela de estoque e o dashboard, PRODUTOS no recorte
-- (contarSituacoes, lib/estoque/situacao.ts).
--
-- A conta é UMA, a dos produtos — a regra D10 das telas: sem estoque é não
-- ter saldo POSITIVO em nenhuma unidade do recorte (o produto ativo sem linha
-- conta). O total de `zerados` passa a ser ela; a linha de cada unidade
-- (`estoque_por_unidade`) já era "os produtos sem saldo NELA" e não muda.
--
-- Só o trecho do total muda: parte do corpo ATUAL da produção e troca a linha
-- (recusa se ela não estiver lá, em vez de recriar a função de memória).

do $do$
declare
  v_def text;
  v_old text := $o$        'zerados',  (select count(*) from saldo where current_stock <= 0 and is_active is distinct from false),$o$;
  v_new text := $n$        -- D19 da 8ª: os PRODUTOS sem saldo positivo em nenhuma unidade do recorte (a conta das telas).
        'zerados',  (select count(*) from public.products pz
                      where pz.tenant_id = p_tenant and pz.is_active
                        and not exists (select 1 from public.branch_product_stock sz
                                         where sz.product_id = pz.id and sz.branch_id = any (unidades)
                                           and sz.current_stock > 0)),$n$;
begin
  v_def := pg_get_functiondef('public.metrics_relatorio(uuid,uuid[],timestamp with time zone,timestamp with time zone,timestamp with time zone,timestamp with time zone,text,text,uuid)'::regprocedure);
  if position(v_old in v_def) = 0 then
    raise exception 'metrics_relatorio mudou: o total de zerados não está como esperado';
  end if;
  execute replace(v_def, v_old, v_new);
end
$do$;

notify pgrst, 'reload schema';
