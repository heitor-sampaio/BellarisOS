-- F64 — o fuso da unidade no que sobrou (13ª simulação; C4 do levantamento).
--
-- Cada função é recriada a partir da definição de PRODUÇÃO
-- (`pg_get_functiondef`), como na 20261111006202, trocando só o trecho do
-- relógio. Sem fuso escolhido (o padrão, Brasília), o resultado é o de antes.
--
-- 1. As comissões no fuso da REDE (decisão D12): o `period_ref` da linha
--    acertada (`comissao_acertar_linha`) e o "até DD/MM/AAAA" do fechamento
--    (`comissao_fechar_escolhidos`) saíam no relógio de Brasília — o acerto
--    das 23:30 de 30/11 em Manaus caía em dezembro. O fuso da rede é o comum
--    das unidades ativas (`fuso_do_recorte(rede, null)`), o mesmo de
--    `fusoDaRede` no app.
-- 2. O pacote vencido (`pacote_cancelar_devolvendo`) diz a validade no
--    relógio da unidade do pacote.
-- 3. Os gráficos do resultado e dos custos da venda: o dia de cada lançamento
--    é o da unidade DELE (como no `metrics_series` desde a F62), e a barra é
--    a meia-noite desse dia no fuso do recorte. Com unidades em fusos
--    diferentes, o pagamento das 23:30 de Manaus ia para o dia seguinte.

do $$
declare
  v_def text;
  v_recorte constant text := '(select public.fuso_do_recorte(p_tenant, p_branch_ids))';
begin
  -- 1. As comissões no fuso da rede.
  v_def := pg_get_functiondef('private.comissao_acertar_linha(uuid,text,uuid)'::regprocedure);
  if position($q$to_char(now() at time zone 'America/Sao_Paulo', 'YYYY-MM')$q$ in v_def) > 0 then
    execute replace(v_def,
      $q$to_char(now() at time zone 'America/Sao_Paulo', 'YYYY-MM')$q$,
      $q$to_char(now() at time zone public.fuso_do_recorte(v_l.tenant_id, null), 'YYYY-MM')$q$);
  end if;

  v_def := pg_get_functiondef('public.comissao_fechar_escolhidos(uuid,uuid,uuid,timestamptz,uuid,text,uuid[])'::regprocedure);
  if position($q$to_char(p_fim at time zone 'America/Sao_Paulo', 'DD/MM/YYYY')$q$ in v_def) > 0 then
    execute replace(v_def,
      $q$to_char(p_fim at time zone 'America/Sao_Paulo', 'DD/MM/YYYY')$q$,
      $q$to_char(p_fim at time zone public.fuso_do_recorte(p_tenant, null), 'DD/MM/YYYY')$q$);
  end if;

  -- 2. A validade do pacote no relógio da unidade dele.
  v_def := pg_get_functiondef('public.pacote_cancelar_devolvendo(uuid,uuid,uuid,text,text,text,text,numeric,boolean,text,jsonb)'::regprocedure);
  if position($q$to_char(v_cp.expires_at at time zone 'America/Sao_Paulo', 'DD/MM/YYYY')$q$ in v_def) > 0 then
    execute replace(v_def,
      $q$to_char(v_cp.expires_at at time zone 'America/Sao_Paulo', 'DD/MM/YYYY')$q$,
      $q$to_char(v_cp.expires_at at time zone public.fuso_da_unidade(v_cp.branch_id), 'DD/MM/YYYY')$q$);
  end if;

  -- 3. O dia de cada lançamento é o da unidade dele (o de dentro do
  --    date_trunc); o de fora, a meia-noite no fuso do recorte, fica.
  v_def := pg_get_functiondef('public.metrics_series_do_resultado(uuid,uuid[],timestamptz,timestamptz,text,uuid)'::regprocedure);
  if position('coalesce(t.paid_at, t.created_at) at time zone ' || v_recorte in v_def) > 0 then
    v_def := replace(v_def, 'coalesce(t.paid_at, t.created_at) at time zone ' || v_recorte,
                            'coalesce(t.paid_at, t.created_at) at time zone public.fuso_da_unidade(t.branch_id)');
    v_def := replace(v_def, 'm.created_at at time zone ' || v_recorte,
                            'm.created_at at time zone public.fuso_da_unidade(m.branch_id)');
    v_def := replace(v_def, 'v.sold_at at time zone ' || v_recorte,
                            'v.sold_at at time zone public.fuso_da_unidade(v.branch_id)');
    execute v_def;
  end if;

  v_def := pg_get_functiondef('public.metrics_series_dos_custos_da_venda(uuid,uuid[],timestamptz,timestamptz,text,uuid)'::regprocedure);
  if position('coalesce(r.paid_at, r.created_at) at time zone ' || v_recorte in v_def) > 0 then
    v_def := replace(v_def, 'coalesce(r.paid_at, r.created_at) at time zone ' || v_recorte,
                            'coalesce(r.paid_at, r.created_at) at time zone public.fuso_da_unidade(r.branch_id)');
    v_def := replace(v_def, 'c.released_at at time zone ' || v_recorte,
                            'c.released_at at time zone public.fuso_da_unidade(c.branch_id)');
    v_def := replace(v_def, 'coalesce(t.paid_at, t.created_at) at time zone ' || v_recorte,
                            'coalesce(t.paid_at, t.created_at) at time zone public.fuso_da_unidade(t.branch_id)');
    execute v_def;
  end if;
end
$$;

notify pgrst, 'reload schema';
