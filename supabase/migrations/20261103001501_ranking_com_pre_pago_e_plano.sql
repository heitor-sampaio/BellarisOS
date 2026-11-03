-- r3-f13-07 (F15; o Heitor, revisão de 2026-11-03: "para quem atende, sessão
-- de pacote, de pré-pago ou de plano é o mesmo trabalho"). O ranking por
-- procedimento e por profissional é de EXECUÇÃO: além do avulso pago e da
-- sessão de pacote pelo rateio (r2-ind-01, migration 20261103001305), entram
-- pelo rateio, no dia da sessão, para quem ATENDEU:
-- - a unidade PRÉ-PAGA usada (`procedure_sale_units.preco`, a parte dela no
--   vendido — "3 limpezas por R$ 450" → R$ 150 por limpeza atendida);
-- - a sessão de PLANO feita, de um plano vendido (ACCEPTED/COMPLETED): a soma
--   dos procedimentos da sessão no plano (`treatment_plan_session_procedures
--   .price`, já com o desconto rateado), no procedimento do atendimento.
--
-- Não conta duas vezes: nenhuma das duas tem lançamento ligado ao atendimento
-- (o dinheiro é da VENDA — o "Meu faturamento" de quem vendeu, r2-ven-15, não
-- muda). Conferido na produção em 2026-11-03: 0 lançamentos de receita com o
-- atendimento de uma sessão de plano ou de uma unidade pré-paga.
--
-- Vale nas quatro contas da tela, as mesmas do r2-ind-01:
-- metrics_top_procedures, metrics_top_professionals, metrics_relatorio (as
-- três ocorrências) e metrics_receita_por_categoria_de_procedimento. Troca de
-- texto sobre o corpo ATUAL da produção: o ramo da sessão de pacote passa a
-- ler de um conjunto com as três sessões (pacote, pré-pago e plano), com o
-- valor já resolvido.

create function pg_temp.sessoes_pelo_rateio(p_fn regprocedure, p_vezes int)
returns void language plpgsql as $f$
declare
  d text := pg_get_functiondef(p_fn);
  n int;
  v_de_sel  constant text := 'select sx.appointment_id, coalesce(sx.preco, round(cpx.price / greatest(cpx.total_sessions, 1), 2))';
  v_de_from constant text := 'from public\.package_sessions sx\s+join public\.client_packages cpx on cpx\.id = sx\.client_package_id';
  v_conjunto constant text :=
       'from (' || chr(10)
    || '          select ps.appointment_id, coalesce(ps.preco, round(cp.price / greatest(cp.total_sessions, 1), 2)) as preco, ps.status::text as status' || chr(10)
    || '            from public.package_sessions ps join public.client_packages cp on cp.id = ps.client_package_id' || chr(10)
    || '          union all' || chr(10)
    || '          -- r3-f13-07: a unidade pré-paga usada, pela parte dela no vendido.' || chr(10)
    || '          select u.appointment_id, u.preco, ''USED'' from public.procedure_sale_units u' || chr(10)
    || '           where u.status = ''USADA'' and u.appointment_id is not null' || chr(10)
    || '          union all' || chr(10)
    || '          -- r3-f13-07: a sessão do plano vendido, pela soma dos procedimentos dela.' || chr(10)
    || '          select s.appointment_id, sum(sp.price), ''USED''' || chr(10)
    || '            from public.treatment_plan_sessions s' || chr(10)
    || '            join public.treatment_plans tp on tp.id = s.plan_id and tp.status in (''ACCEPTED'', ''COMPLETED'')' || chr(10)
    || '            join public.treatment_plan_session_procedures sp on sp.session_id = s.id' || chr(10)
    || '           where s.appointment_id is not null' || chr(10)
    || '           group by s.appointment_id' || chr(10)
    || '        ) sx';
begin
  n := (length(d) - length(replace(d, v_de_sel, ''))) / length(v_de_sel);
  if n <> p_vezes then raise exception 'seleção em %: achada % vez(es), esperado %', p_fn, n, p_vezes; end if;
  n := (select count(*) from regexp_matches(d, v_de_from, 'g'));
  if n <> p_vezes then raise exception 'origem em %: achada % vez(es), esperado %', p_fn, n, p_vezes; end if;
  d := replace(d, v_de_sel, 'select sx.appointment_id, sx.preco');
  d := regexp_replace(d, v_de_from, v_conjunto, 'g');
  execute d;
end
$f$;

select pg_temp.sessoes_pelo_rateio('public.metrics_top_procedures(uuid,uuid[],timestamptz,timestamptz,integer,uuid)', 1);
select pg_temp.sessoes_pelo_rateio('public.metrics_top_professionals(uuid,uuid[],timestamptz,timestamptz,integer,uuid)', 1);
select pg_temp.sessoes_pelo_rateio('public.metrics_relatorio(uuid,uuid[],timestamptz,timestamptz,timestamptz,timestamptz,text,text,uuid)', 3);
select pg_temp.sessoes_pelo_rateio('public.metrics_receita_por_categoria_de_procedimento(uuid,uuid[],timestamptz,timestamptz,uuid)', 1);

notify pgrst, 'reload schema';
