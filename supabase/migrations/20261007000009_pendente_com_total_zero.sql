-- Cobrança ligada e total zero é SEMPRE pendente: o sistema pausa pela
-- cortesia (lib/redes/cobranca.ts). Antes só contava se o valor anotado no
-- Asaas fosse diferente — com a anotação também zero, ninguém pausava
-- (achado pelo E2E de planos-adicionais, 2026-10-07).
do $$
declare
  v_antes text;
  v_depois text;
  v_velho text := $x$(v_sub.cobranca = 'ativa' and v_sub.valor_no_asaas_centavos is distinct from v_sub.valor_total_centavos)$x$;
  v_novo text := $x$(v_sub.cobranca = 'ativa' and (v_sub.valor_no_asaas_centavos is distinct from v_sub.valor_total_centavos or v_sub.valor_total_centavos = 0))$x$;
  f text;
begin
  foreach f in array array['public.assinatura_adicional_definir(uuid,text,int,int)', 'public.assinatura_condicao_definir(uuid,text,jsonb)'] loop
    v_antes := pg_get_functiondef(f::regprocedure);
    v_depois := replace(v_antes, v_velho, v_novo);
    if v_depois = v_antes then raise exception '%: o trecho de referência mudou', f; end if;
    execute v_depois;
  end loop;
end $$;

notify pgrst, 'reload schema';
