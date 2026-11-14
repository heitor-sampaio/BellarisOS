-- O PDV, fase 3: o desconto do plano é dado no RECEBER (no PDV), e o receber
-- é do plano ACEITO (20261113008201). A trava antiga pedia PROPOSED — era o
-- fechamento de antes, em que aceitar e receber eram um gesto só.
do $$
declare
  v_def text;
begin
  select pg_get_functiondef(p.oid) into v_def
    from pg_proc p join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'public' and p.proname = 'plano_aplicar_desconto';
  v_def := replace(v_def, $x$if v_status <> 'PROPOSED' then$x$, $x$if v_status <> 'ACCEPTED' then$x$);
  v_def := replace(v_def, $x$'O desconto só se aplica no fechamento do plano.'$x$, $x$'O desconto só se aplica ao receber o plano aceito.'$x$);
  execute v_def;
end $$;

notify pgrst, 'reload schema';
