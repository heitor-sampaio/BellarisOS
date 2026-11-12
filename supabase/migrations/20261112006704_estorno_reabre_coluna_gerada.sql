-- 20261112006703: `data_de_referencia` é coluna GERADA — a reabertura não a
-- grava (ela sai do próprio lançamento). Corrigido no arquivo de origem; aqui,
-- para o banco que já recebeu a versão de antes.
do $$
declare
  v_def text := pg_get_functiondef('public.estornar_e_reabrir(uuid, uuid, text, text)'::regprocedure);
begin
  if position('data_de_referencia' in v_def) > 0 then
    v_def := replace(v_def, 'parcela_numero, parcela_total, parcela_grupo, data_de_referencia)', 'parcela_numero, parcela_total, parcela_grupo)');
    v_def := replace(v_def, 'v_tx.parcela_numero, v_tx.parcela_total, v_tx.parcela_grupo, v_tx.data_de_referencia)', 'v_tx.parcela_numero, v_tx.parcela_total, v_tx.parcela_grupo)');
    if position('data_de_referencia' in v_def) > 0 then
      raise exception 'estornar_e_reabrir: a coluna gerada não saiu';
    end if;
    execute v_def;
  end if;
end $$;

notify pgrst, 'reload schema';
