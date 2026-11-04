-- D10 da 6ª simulação (2026-11-04; princípio 3): o estoque NEGATIVO e o
-- produto sem NENHUMA linha de saldo contam como "sem estoque".
--
-- O Gel condutor (mínimo 2) ficou em −1 un depois de uma baixa — o saldo fica
-- negativo de propósito, "para a falta aparecer" (atendimento.md §10). Em
-- Relatórios → Estoque, `zerados` era `current_stock = 0` e `criticos`
-- `current_stock > 0`: o −1 não caía em nenhum dos dois. E o saldo saía só de
-- `branch_product_stock`: o produto ativo que nunca teve entrada na unidade
-- (sem linha) também não contava.
--
-- Agora o saldo do relatório é cada produto ATIVO × cada unidade ATIVA do
-- recorte (a linha que falta vale 0), mais as linhas que já existem de produto
-- inativo ou unidade inativa (o valor delas sempre contou); `zerados` é
-- `current_stock <= 0`. A tela de estoque e o dashboard fazem a mesma conta
-- (`contarSituacoes`, lib/estoque/situacao.ts).
--
-- O corpo é o da PRODUÇÃO (pg_get_functiondef), com as duas trocas conferidas
-- — frentes anteriores mudaram a função, e nenhuma migration antiga tem o corpo
-- inteiro de hoje. Cada trecho tem de aparecer o número de vezes esperado, ou a
-- migration para sem mudar nada.
do $migracao$
declare
  v_sig  regprocedure := 'public.metrics_relatorio(uuid,uuid[],timestamp with time zone,timestamp with time zone,timestamp with time zone,timestamp with time zone,text,text,uuid)'::regprocedure;
  v_def  text := pg_get_functiondef(v_sig);
  v_saldo_antes text := $q$      with saldo as (
        select s.branch_id, s.current_stock, s.min_stock,
               public.valor_do_saldo(s, pr) valor, pr.category, pr.is_active
        from public.branch_product_stock s
        join public.products pr on pr.id = s.product_id
        where s.branch_id = any (unidades)
      )$q$;
  v_saldo_depois text := $q$      with saldo as (
        -- D10: cada produto ativo × cada unidade ativa do recorte (a linha que
        -- falta vale 0), mais as linhas que existem de produto ou unidade
        -- inativos.
        select u.id as branch_id, coalesce(s.current_stock, 0) as current_stock, coalesce(s.min_stock, 0) as min_stock,
               case when s.product_id is null then 0 else public.valor_do_saldo(s, pr) end as valor,
               pr.category, pr.is_active
        from unnest(unidades) as u(id)
        join public.branches b on b.id = u.id
        join public.products pr on pr.tenant_id = p_tenant
        left join public.branch_product_stock s on s.product_id = pr.id and s.branch_id = u.id
        where s.product_id is not null or (pr.is_active and b.is_active)
      )$q$;
  v_zerado_antes  text := 'current_stock = 0 and is_active is distinct from false';
  v_zerado_depois text := 'current_stock <= 0 and is_active is distinct from false';
  v_vezes int;
begin
  v_vezes := (length(v_def) - length(replace(v_def, v_saldo_antes, ''))) / length(v_saldo_antes);
  if v_vezes <> 1 then
    raise exception 'metrics_relatorio: o saldo do estoque apareceu % vez(es), esperado 1', v_vezes;
  end if;
  v_vezes := (length(v_def) - length(replace(v_def, v_zerado_antes, ''))) / length(v_zerado_antes);
  if v_vezes <> 2 then
    raise exception 'metrics_relatorio: "zerados" apareceu % vez(es), esperado 2', v_vezes;
  end if;
  v_def := replace(v_def, v_saldo_antes, v_saldo_depois);
  v_def := replace(v_def, v_zerado_antes, v_zerado_depois);
  execute v_def;
end
$migracao$;

notify pgrst, 'reload schema';
