-- F62, fatia 4 — os indicadores no fuso da unidade.
--
-- "Não, deixa a clinica configurar o seu fuso" (o Heitor, 2026-11-11). As
-- funções de indicador montavam o dia, o mês e a hora no relógio de Brasília
-- (`at time zone 'America/Sao_Paulo'`): o pagamento das 23:30 de Manaus caía
-- na barra do dia seguinte.
--
-- Cada função é recriada a partir da definição de PRODUÇÃO
-- (`pg_get_functiondef`), trocando o fuso fixo pelo do RECORTE —
-- `public.fuso_do_recorte(p_tenant, p_branch_ids)`: a unidade, o fuso dela;
-- a rede, o fuso comum das unidades (com fusos diferentes, o de Brasília).
-- Como subconsulta sem correlação, o Postgres a calcula UMA vez por chamada.
--
-- No gráfico do dinheiro (`metrics_series`), "o dia é o da unidade": cada
-- lançamento cai no dia do relógio da unidade dele, e a barra é a
-- meia-noite desse dia no fuso do recorte.
--
-- Sem fuso escolhido (o padrão, o de Brasília), o resultado é o mesmo de
-- antes: `fuso_do_recorte` devolve 'America/Sao_Paulo'.

do $$
declare
  v_fn  regprocedure;
  v_def text;
  v_fuso constant text := '(select public.fuso_do_recorte(p_tenant, p_branch_ids))';
begin
  -- O gráfico do dinheiro: o dia de cada lançamento é o da unidade dele.
  v_def := pg_get_functiondef('public.metrics_series(uuid,uuid[],timestamptz,timestamptz,text,uuid)'::regprocedure);
  if position($q$coalesce(t.paid_at, t.created_at) at time zone 'America/Sao_Paulo'$q$ in v_def) > 0 then
    v_def := replace(v_def,
      $q$coalesce(t.paid_at, t.created_at) at time zone 'America/Sao_Paulo'$q$,
      $q$coalesce(t.paid_at, t.created_at) at time zone public.fuso_da_unidade(t.branch_id)$q$);
    v_def := replace(v_def, $q$'America/Sao_Paulo'$q$, v_fuso);
    execute v_def;
  end if;

  foreach v_fn in array array[
    'public.metrics_core(uuid,uuid[],timestamptz,timestamptz,uuid)',
    'public.metrics_new_clients_series(uuid,uuid[],timestamptz,timestamptz,text,uuid)',
    'public.metrics_series_do_resultado(uuid,uuid[],timestamptz,timestamptz,text,uuid)',
    'public.metrics_series_dos_custos_da_venda(uuid,uuid[],timestamptz,timestamptz,text,uuid)',
    'public.metrics_relatorio(uuid,uuid[],timestamptz,timestamptz,timestamptz,timestamptz,text,text,uuid)',
    'public.metrics_em_aberto(uuid,uuid[],timestamptz,timestamptz)',
    'public.metrics_a_receber_vencido(uuid,uuid[],uuid,uuid)',
    'public.metrics_a_receber_da_operadora(uuid,uuid[],timestamptz,timestamptz)',
    'public.metrics_a_receber_da_operadora_liquido(uuid,uuid[],timestamptz,timestamptz)',
    'public.metrics_fluxo_de_caixa(uuid,uuid[],integer)',
    'public.metrics_fluxo_de_caixa_liquido(uuid,uuid[],integer)',
    'public.recebiveis_do_cartao_lista(uuid,uuid[],timestamptz,timestamptz)'
  ]::regprocedure[] loop
    v_def := pg_get_functiondef(v_fn);
    if position($q$'America/Sao_Paulo'$q$ in v_def) > 0 then
      execute replace(v_def, $q$'America/Sao_Paulo'$q$, v_fuso);
    end if;
  end loop;
end
$$;

notify pgrst, 'reload schema';
