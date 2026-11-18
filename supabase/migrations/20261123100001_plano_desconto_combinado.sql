-- 22ª A20: o desconto do PLANO combinado no editor ("as três por 420"), em R$
-- ou %, em vez de mexer no preço de cada sessão. Fica guardado no plano e vai
-- pronto ao checkout do plano (no PDV), que o aplica pelo
-- `plano_aplicar_desconto` de sempre — e ali ainda se ajusta. Não mexe nos
-- preços nem no `desconto` (o APLICADO, que só o receber grava).
alter table public.treatment_plans
  add column if not exists desconto_combinado_tipo  text,
  add column if not exists desconto_combinado_valor numeric(12, 2) not null default 0,
  add column if not exists desconto_combinado_por   uuid references public.users(id) on delete set null;

alter table public.treatment_plans
  drop constraint if exists treatment_plans_desconto_combinado_ok;
alter table public.treatment_plans
  add constraint treatment_plans_desconto_combinado_ok check (
    desconto_combinado_valor >= 0
    and (desconto_combinado_tipo is null or desconto_combinado_tipo in ('VALOR', 'PERCENTUAL'))
    and (desconto_combinado_tipo is distinct from 'PERCENTUAL' or desconto_combinado_valor <= 100)
  );

comment on column public.treatment_plans.desconto_combinado_tipo is
  '22ª A20: o desconto do plano combinado no editor (VALOR em reais, PERCENTUAL sobre o total das sessões). O checkout do plano parte dele.';

-- A avaliação gera o plano numa transação só (`gerar_plano_da_avaliacao`): o
-- combinado vai junto, na mesma gravação. Sem a chave, o que havia fica.
do $$
declare
  v_def  text := pg_get_functiondef('public.gerar_plano_da_avaliacao(uuid, uuid, uuid, text, jsonb)'::regprocedure);
  v_novo text;
begin
  v_novo := replace(v_def,
$a$  -- As sessões do editor substituem as que havia (cascade leva os procedimentos).$a$,
$b$  -- 22ª A20: o desconto do plano combinado no editor (sem a chave, o que havia fica).
  if p_dados ? 'desconto_combinado' then
    update public.treatment_plans
       set desconto_combinado_tipo  = case when coalesce((p_dados -> 'desconto_combinado' ->> 'valor')::numeric, 0) > 0
                                           then p_dados -> 'desconto_combinado' ->> 'tipo' end,
           desconto_combinado_valor = greatest(coalesce((p_dados -> 'desconto_combinado' ->> 'valor')::numeric, 0), 0),
           desconto_combinado_por   = case when coalesce((p_dados -> 'desconto_combinado' ->> 'valor')::numeric, 0) > 0
                                           then p_ator end
     where id = v_plano;
  end if;

  -- As sessões do editor substituem as que havia (cascade leva os procedimentos).$b$);
  if v_novo = v_def then
    raise exception 'gerar_plano_da_avaliacao: o trecho das sessões não foi achado.';
  end if;
  execute v_novo;
end $$;

notify pgrst, 'reload schema';
