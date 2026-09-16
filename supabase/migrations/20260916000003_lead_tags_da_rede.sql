-- Catálogo de tags em uso pela rede.
--
-- Existe para o card do lead poder OFERECER tags sem deixar criar: quem atende
-- escolhe entre as que já existem, e a lista de tags da rede para de crescer a
-- cada atendimento com variações da mesma coisa ("botox", "Botox", "botox ").
--
-- A agregação é no Postgres, não em JS: `leads` passa de 1000 linhas com
-- facilidade, o PostgREST corta ali, e o catálogo ficaria faltando tags sem
-- ninguém perceber — a mesma armadilha descrita no CLAUDE.md §13.1.

create or replace function public.lead_tags_da_rede(p_tenant uuid)
returns table (tag text)
language sql
stable
security definer
set search_path = public
as $$
  select distinct t
  from public.leads l, unnest(l.tags) as t
  where l.tenant_id = p_tenant
    and t is not null
    and length(btrim(t)) > 0
  order by 1
$$;

comment on function public.lead_tags_da_rede(uuid) is
  'Tags distintas em uso nos leads da rede. Alimenta o seletor de tags do card, que nao cria tag nova.';
