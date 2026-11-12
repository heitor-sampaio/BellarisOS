-- C38 do levantamento das regras (F67, 2026-11-12; a D10 mudada pelo Heitor:
-- "Decisão da rede"): até quantas parcelas a clínica divide o crediário
-- ("entrada + parcelas"). Padrão 12, igual no Vender, no checkout e no
-- check-in do plano (que cortavam em 12 e em 48, calados). A despesa não muda.
-- O teto do registro é o da despesa parcelada (48).

alter table public.tenants
  add column if not exists crediario_max_parcelas smallint not null default 12
    check (crediario_max_parcelas between 1 and 48);

comment on column public.tenants.crediario_max_parcelas is
  'C38: até quantas parcelas a clínica divide o crediário (entrada + parcelas). Padrão 12.';

-- `plano_checkout` (20261112006701): o primeiro agendamento devolvido é o da
-- primeira sessão do plano (a ordem dela), não um qualquer.
do $$
declare
  v_def text := pg_get_functiondef('public.plano_checkout(uuid, uuid, uuid, numeric, jsonb, jsonb, jsonb, boolean, uuid)'::regprocedure);
begin
  if position('order by s.sort_order' in v_def) = 0 then
    v_def := replace(v_def,
      'where s.plan_id = p_plano' || chr(10) || '  loop',
      'where s.plan_id = p_plano order by s.sort_order, s.id' || chr(10) || '  loop');
    if position('order by s.sort_order' in v_def) = 0 then
      raise exception 'plano_checkout: o laço das sessões não foi encontrado';
    end if;
    execute v_def;
  end if;
end $$;

notify pgrst, 'reload schema';
