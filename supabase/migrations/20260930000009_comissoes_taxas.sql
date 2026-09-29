-- Comissões, fase 1: gravar a tabela de taxas da maquininha numa transação
-- (substitui o conjunto inteiro da rede — apagar e inserir soltos deixariam a
-- rede sem taxa nenhuma se o segundo passo falhasse).

create or replace function public.comissao_taxas_definir(p_tenant uuid, p_taxas jsonb)
returns void
language plpgsql security definer set search_path = ''
as $$
begin
  delete from public.payment_fees f where f.tenant_id = p_tenant;
  insert into public.payment_fees (tenant_id, metodo, parcelas, taxa_pct)
  select p_tenant, t->>'metodo', (t->>'parcelas')::int, (t->>'taxa_pct')::numeric
    from jsonb_array_elements(coalesce(p_taxas, '[]'::jsonb)) t;
end $$;

revoke execute on function public.comissao_taxas_definir(uuid, jsonb) from public, anon, authenticated;
grant execute on function public.comissao_taxas_definir(uuid, jsonb) to service_role;

notify pgrst, 'reload schema';
