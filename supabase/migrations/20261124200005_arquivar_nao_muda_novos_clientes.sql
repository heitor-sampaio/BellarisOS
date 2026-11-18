-- Arquivar a cliente NÃO muda quantas clientes novas houve (auditoria das
-- regras, 18/11; decisão do Claude pelos princípios 3 e 5: "Novos clientes" é
-- o fato do período — ela passou a ser cliente naquele mês —, e arquivar hoje
-- não desfaz o fato de ontem).
--
-- As três contas de "Novos clientes" (`metrics_core`, `metrics_by_branch`,
-- `metrics_new_clients_series`) filtravam `c.is_active` (A24): arquivar a Ana
-- tirava uma cliente nova de outubro, e o número do mês passado mudava. O
-- filtro sai das três; o resto de cada função não muda (remendo pelo
-- `pg_get_functiondef`, o padrão de 20261116300001). As LISTAS (clientes,
-- aniversariantes, reativar, a base ativa dos relatórios) seguem só com as
-- ativas — arquivar a tira delas.

do $$
declare
  v_def text;
  v_novo text;
  v_trecho text;
  v_troca text;
  v_func text;
  v_pares text[][] := array[
    array['public.metrics_core(uuid,uuid[],timestamp with time zone,timestamp with time zone,uuid)',
          E'        where c.tenant_id = p_tenant\n          and c.is_active\n          and coalesce(c.cliente_desde',
          E'        where c.tenant_id = p_tenant\n          and coalesce(c.cliente_desde'],
    array['public.metrics_by_branch(uuid,timestamp with time zone,timestamp with time zone)',
          E'         where c.tenant_id = p_tenant and c.is_active\n           and coalesce(c.cliente_desde',
          E'         where c.tenant_id = p_tenant\n           and coalesce(c.cliente_desde'],
    array['public.metrics_new_clients_series(uuid,uuid[],timestamp with time zone,timestamp with time zone,text,uuid)',
          E'    where c.tenant_id = p_tenant\n      and c.is_active\n      and public.recorte_e_a_clinica',
          E'    where c.tenant_id = p_tenant\n      and public.recorte_e_a_clinica']
  ];
  i int;
begin
  for i in 1 .. array_length(v_pares, 1) loop
    v_func   := v_pares[i][1];
    v_trecho := v_pares[i][2];
    v_troca  := v_pares[i][3];
    v_def := pg_get_functiondef(v_func::regprocedure);
    if position(v_troca in v_def) > 0 and position(v_trecho in v_def) = 0 then
      continue; -- já remendada
    end if;
    if position(v_trecho in v_def) = 0 then
      raise exception 'arquivar_nao_muda_novos_clientes: o trecho de % não foi achado', v_func;
    end if;
    v_novo := replace(v_def, v_trecho, v_troca);
    execute v_novo;
  end loop;
end
$$;

notify pgrst, 'reload schema';
