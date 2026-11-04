-- F20 (6ª simulação, 2026-11-04) — D3: a lista do "A receber da operadora"
-- mostra TODO o em aberto, não só o que vence no período.
--
-- O cartão dizia "Em aberto R$ 2.360, próximo R$ 617,66 em 04/12", e a lista
-- logo abaixo não aparecia: ela trazia só as parcelas que VENCEM no período
-- (novembro), e todas venciam a partir de 04/12 (princípio 3: o cartão mostra
-- um total, e a tela não mostra o que ele é). A lista da tela passa a ser: o
-- que vence no período (de qualquer situação — o recebido do mês aparece) MAIS
-- todo o em aberto, de qualquer vencimento (A_RECEBER, e a antecipada que
-- ainda não venceu, para o "Desfazer"). A situação é a de sempre, a de
-- `recebiveis_do_cartao_lista`: a regra mora num lugar só.

create or replace function public.recebiveis_do_cartao_da_tela(
  p_tenant uuid, p_branch_ids uuid[], p_from timestamptz, p_to timestamptz)
 returns table(id uuid, branch_id uuid, transaction_id uuid, descricao text, cliente_nome text,
               parcela_numero smallint, parcela_total smallint, valor numeric, valor_original numeric,
               estornado numeric, taxa_pct numeric, taxa numeric, liquido numeric,
               vencimento timestamptz, vencimento_dia date, situacao text, recebida_na timestamptz)
 language sql
 stable
 set search_path to ''
as $function$
  select l.*
    from public.recebiveis_do_cartao_lista(p_tenant, p_branch_ids, null, null) l
   where (l.vencimento between p_from and p_to)
      or (l.vencimento > now() and l.situacao in ('A_RECEBER', 'ANTECIPADA'))
$function$;

revoke execute on function public.recebiveis_do_cartao_da_tela(uuid, uuid[], timestamptz, timestamptz) from public, anon, authenticated;
grant execute on function public.recebiveis_do_cartao_da_tela(uuid, uuid[], timestamptz, timestamptz) to service_role;

notify pgrst, 'reload schema';
