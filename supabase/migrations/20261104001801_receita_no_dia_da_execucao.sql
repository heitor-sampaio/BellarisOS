-- F18 (o Heitor, à decisão da F17 — opção a: "contar no dia que foi feita";
-- princípio 5 do CLAUDE.md: "o indicador de execução conta o dinheiro no dia
-- em que o atendimento foi feito; o caixa e o faturamento, no dia em que o
-- dinheiro entrou").
--
-- O ranking e o relatório de EXECUÇÃO por procedimento e por profissional
-- somavam o pagamento do avulso pelo dia do PAGAMENTO: a Limpeza concluída em
-- 31/10 e paga em 03/11 aparecia em novembro como "0 execuções · R$ 180" e em
-- outubro como "1 execução · R$ 0". Agora o pagamento do atendimento entra no
-- dia da EXECUÇÃO (`aconteceu_em` do atendimento concluído), qualquer que seja
-- o dia em que foi pago — como já era a sessão de pacote, a unidade pré-paga e
-- a sessão de plano. O relatório de outubro muda quando o pagamento chega
-- depois (aceito pelo Heitor).
--
-- A régua é UMA: `metrics_receitas_pagas_dos_executados`, o predicado INTEIRO
-- de `metrics_receitas_pagas` (INCOME pago, sem crédito interno, sem os dois
-- lados do estorno) sobre os lançamentos ligados a um atendimento CONCLUÍDO
-- com `aconteceu_em` no período. Vale nas quatro contas de execução:
-- metrics_top_procedures, metrics_top_professionals, metrics_relatorio (por
-- procedimento, por profissional e `receita_dos_atendimentos`) e
-- metrics_receita_por_categoria_de_procedimento.
--
-- NÃO muda: `metrics_receitas_pagas`, o caixa, o faturamento, o Fechamento, o
-- "Meu faturamento" e toda receita por dia de pagamento.
--
-- Troca de texto sobre o corpo ATUAL da produção, conferindo quantas vezes
-- cada trecho aparece.

create or replace function public.metrics_receitas_pagas_dos_executados(
  p_tenant uuid, p_branch_ids uuid[], p_from timestamptz, p_to timestamptz, p_professional_id uuid default null)
returns table (appointment_id uuid, amount numeric)
language sql
stable
set search_path to ''
as $$
  select t.appointment_id, t.amount
  from public.appointments a
  join public.branches b on b.id = a.branch_id
  join public.financial_transactions t on t.appointment_id = a.id
  where b.tenant_id = p_tenant
    and (p_branch_ids is null or b.id = any (p_branch_ids))
    and a.status = 'COMPLETED'
    and a.aconteceu_em between p_from and p_to
    and (p_professional_id is null or a.professional_id = p_professional_id)
    and t.type = 'INCOME' and t.is_paid
    and t.payment_method is distinct from 'INTERNAL_CREDIT'
    and coalesce(t.notes, '')    <> 'Estornada'
    and coalesce(t.category, '') <> 'Estorno'
$$;

revoke execute on function public.metrics_receitas_pagas_dos_executados(uuid, uuid[], timestamptz, timestamptz, uuid) from public, anon, authenticated;
grant execute on function public.metrics_receitas_pagas_dos_executados(uuid, uuid[], timestamptz, timestamptz, uuid) to service_role;

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

select pg_temp.trocar_no_corpo(
  'public.metrics_top_procedures(uuid,uuid[],timestamptz,timestamptz,integer,uuid)',
  array[E'from public.metrics_receitas_pagas(p_tenant, p_branch_ids, p_from, p_to, p_professional_id) t\n'],
  array[E'from public.metrics_receitas_pagas_dos_executados(p_tenant, p_branch_ids, p_from, p_to, p_professional_id) t\n'],
  array[1]);

select pg_temp.trocar_no_corpo(
  'public.metrics_top_professionals(uuid,uuid[],timestamptz,timestamptz,integer,uuid)',
  array[E'from public.metrics_receitas_pagas(p_tenant, p_branch_ids, p_from, p_to, p_professional_id) t\n'],
  array[E'from public.metrics_receitas_pagas_dos_executados(p_tenant, p_branch_ids, p_from, p_to, p_professional_id) t\n'],
  array[1]);

select pg_temp.trocar_no_corpo(
  'public.metrics_receita_por_categoria_de_procedimento(uuid,uuid[],timestamptz,timestamptz,uuid)',
  array[E'from public.metrics_receitas_pagas(p_tenant, p_branch_ids, p_from, p_to, p_professional_id) t\n'],
  array[E'from public.metrics_receitas_pagas_dos_executados(p_tenant, p_branch_ids, p_from, p_to, p_professional_id) t\n'],
  array[1]);

-- No relatório, só as três somas de EXECUÇÃO (as que têm o alias `t`); a
-- receita por unidade, por forma e por categoria financeira seguem o caixa.
select pg_temp.trocar_no_corpo(
  'public.metrics_relatorio(uuid,uuid[],timestamptz,timestamptz,timestamptz,timestamptz,text,text,uuid)',
  array[E'from public.metrics_receitas_pagas(p_tenant, unidades, p_from, p_to, p_professional_id) t\n'],
  array[E'from public.metrics_receitas_pagas_dos_executados(p_tenant, unidades, p_from, p_to, p_professional_id) t\n'],
  array[3]);

notify pgrst, 'reload schema';
