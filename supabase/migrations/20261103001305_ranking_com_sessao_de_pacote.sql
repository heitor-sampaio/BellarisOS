-- r2-ind-01 (F13; o Heitor, 2026-11-03: "Somar também o pacote, rateado por
-- sessão feita"). O ranking por procedimento e por profissional é de
-- EXECUÇÃO: além do que entrou pelo atendimento avulso (a receita paga, pela
-- regra única, desde a F7/D3), a SESSÃO DE PACOTE feita entra com o valor do
-- rateio dela (`package_sessions.preco` — o mesmo do "manter como avulso" do
-- cancelamento do pacote, F2b), no dia da sessão (`aconteceu_em`), para quem
-- ATENDEU. Sem a parte gravada (pacote de antes do rateio), o preço ÷ sessões.
--
-- Não conta duas vezes: a sessão não tem lançamento (o dinheiro do pacote é da
-- venda, e está no "Meu faturamento" de quem vendeu — r2-ven-15). O "Abater do
-- pacote" zera a conta a receber do avulso, e a sessão entra pelo rateio.
--
-- Vale nas quatro contas da mesma tela: metrics_top_procedures,
-- metrics_top_professionals, metrics_relatorio (por procedimento, por
-- profissional e o total "receita_dos_atendimentos", o denominador do "% do
-- Total") e metrics_receita_por_categoria_de_procedimento. Troca de texto
-- sobre o corpo ATUAL da produção.

create function pg_temp.trocar_no_corpo(p_fn regprocedure, p_de text[], p_para text[], p_vezes int[])
returns void language plpgsql as $f$
declare
  d text := pg_get_functiondef(p_fn);
  i int;
  n int;
begin
  for i in 1 .. array_length(p_de, 1) loop
    n := (length(d) - length(replace(d, p_de[i], ''))) / length(p_de[i]);
    if n <> p_vezes[i] then
      raise exception 'trecho % de %: achado % vez(es), esperado %', i, p_fn, n, p_vezes[i];
    end if;
    d := replace(d, p_de[i], p_para[i]);
  end loop;
  execute d;
end
$f$;

-- Os rankings do dashboard: o "pago" ganha as sessões de pacote feitas.
select pg_temp.trocar_no_corpo(f::regprocedure,
  array[E'from public.metrics_receitas_pagas(p_tenant, p_branch_ids, p_from, p_to, p_professional_id) t\n    join public.appointments ap on ap.id = t.appointment_id'],
  array[E'from (\n      select t.appointment_id, t.amount\n        from public.metrics_receitas_pagas(p_tenant, p_branch_ids, p_from, p_to, p_professional_id) t\n      union all\n      -- r2-ind-01: a sessão de pacote feita, pelo rateio, no dia da sessão.\n      select sx.appointment_id, coalesce(sx.preco, round(cpx.price / greatest(cpx.total_sessions, 1), 2))\n        from public.package_sessions sx\n        join public.client_packages cpx on cpx.id = sx.client_package_id\n        join public.appointments ax on ax.id = sx.appointment_id\n        join scope sc on sc.id = ax.branch_id\n       where sx.status = ''USED'' and ax.status = ''COMPLETED''\n         and ax.aconteceu_em between p_from and p_to\n         and (p_professional_id is null or ax.professional_id = p_professional_id)\n    ) t\n    join public.appointments ap on ap.id = t.appointment_id'],
  array[1])
from unnest(array[
  'public.metrics_top_procedures(uuid,uuid[],timestamptz,timestamptz,integer,uuid)',
  'public.metrics_top_professionals(uuid,uuid[],timestamptz,timestamptz,integer,uuid)'
]) as f;

-- Os Relatórios: as duas tabelas e o total.
select pg_temp.trocar_no_corpo(
  'public.metrics_relatorio(uuid,uuid[],timestamptz,timestamptz,timestamptz,timestamptz,text,text,uuid)',
  array[
    E'from public.metrics_receitas_pagas(p_tenant, unidades, p_from, p_to, p_professional_id) t\n                    join public.appointments a on a.id = t.appointment_id',
    E'select sum(t.amount)\n        from public.metrics_receitas_pagas(p_tenant, unidades, p_from, p_to, p_professional_id) t\n        where t.appointment_id is not null'
  ],
  array[
    E'from (\n                      select t.appointment_id, t.amount\n                        from public.metrics_receitas_pagas(p_tenant, unidades, p_from, p_to, p_professional_id) t\n                      union all\n                      -- r2-ind-01: a sessão de pacote feita, pelo rateio, no dia da sessão.\n                      select sx.appointment_id, coalesce(sx.preco, round(cpx.price / greatest(cpx.total_sessions, 1), 2))\n                        from public.package_sessions sx\n                        join public.client_packages cpx on cpx.id = sx.client_package_id\n                        join public.appointments ax on ax.id = sx.appointment_id\n                       where ax.branch_id = any (unidades) and sx.status = ''USED'' and ax.status = ''COMPLETED''\n                         and ax.aconteceu_em between p_from and p_to\n                         and (p_professional_id is null or ax.professional_id = p_professional_id)\n                    ) t\n                    join public.appointments a on a.id = t.appointment_id',
    E'select sum(t.amount)\n        from (\n          select t.appointment_id, t.amount\n            from public.metrics_receitas_pagas(p_tenant, unidades, p_from, p_to, p_professional_id) t\n          union all\n          -- r2-ind-01: a sessão de pacote feita, pelo rateio.\n          select sx.appointment_id, coalesce(sx.preco, round(cpx.price / greatest(cpx.total_sessions, 1), 2))\n            from public.package_sessions sx\n            join public.client_packages cpx on cpx.id = sx.client_package_id\n            join public.appointments ax on ax.id = sx.appointment_id\n           where ax.branch_id = any (unidades) and sx.status = ''USED'' and ax.status = ''COMPLETED''\n             and ax.aconteceu_em between p_from and p_to\n             and (p_professional_id is null or ax.professional_id = p_professional_id)\n        ) t\n        where t.appointment_id is not null'
  ],
  array[2, 1]);

-- A receita por categoria (a mesma aba): fecha com a tabela.
create or replace function public.metrics_receita_por_categoria_de_procedimento(p_tenant uuid, p_branch_ids uuid[], p_from timestamp with time zone, p_to timestamp with time zone, p_professional_id uuid DEFAULT NULL::uuid)
 RETURNS TABLE(categoria text, receita numeric)
 LANGUAGE sql
 STABLE
 SET search_path TO ''
AS $function$
  select coalesce(pr.category, '—'), sum(t.amount)
  from (
    select t.appointment_id, t.amount
      from public.metrics_receitas_pagas(p_tenant, p_branch_ids, p_from, p_to, p_professional_id) t
    union all
    -- r2-ind-01: a sessão de pacote feita, pelo rateio, no dia da sessão.
    select sx.appointment_id, coalesce(sx.preco, round(cpx.price / greatest(cpx.total_sessions, 1), 2))
      from public.package_sessions sx
      join public.client_packages cpx on cpx.id = sx.client_package_id
      join public.appointments ax on ax.id = sx.appointment_id
      join public.branches b on b.id = ax.branch_id
     where b.tenant_id = p_tenant and (p_branch_ids is null or b.id = any (p_branch_ids))
       and sx.status = 'USED' and ax.status = 'COMPLETED'
       and ax.aconteceu_em between p_from and p_to
       and (p_professional_id is null or ax.professional_id = p_professional_id)
  ) t
  join public.appointments a on a.id = t.appointment_id
  join public.procedures pr on pr.id = a.procedure_id
  group by 1;
$function$;

notify pgrst, 'reload schema';
