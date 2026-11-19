-- A tag é da PESSOA (o Heitor, 18/11, noite: "a tag é da pessoa e pode ter
-- mais de uma tag") — a segunda metade. Roda DEPOIS do código novo no ar (ele
-- não lê nem grava `leads.tags`) e depois da 20261125100002 e da 20261125400001.
--
-- A 20261125500001 ligou a ficha aos contatos, juntou as tags e deixou uma
-- PONTE: a tag que o código velho gravasse no card ia para a pessoa. Com o
-- código novo no ar, a ponte e a coluna saem:
-- - a ponte e o gatilho do vocabulário em `leads`;
-- - `renomear_tag` não passa mais pelas oportunidades;
-- - `tags_da_rede` conta PESSOAS: as fichas e os contatos sem ficha (o
--   contato com ficha é a mesma pessoa, já contada) — sem a coluna
--   "oportunidades", que a aba Tags mostrava;
-- - `lead_tags_da_rede` (as opções de tag do quadro, sem uso no app) sai;
-- - o índice e a coluna `leads.tags`.

-- A última tag que o código velho gravou no card, antes de a coluna sair.
update public.clients c
   set tags = private.juntar_tags(c.tenant_id, c.tags, x.tags), updated_at = now()
  from (select l.client_id, l.tenant_id, array_agg(t order by t) as tags
          from public.leads l, unnest(l.tags) t
         where l.client_id is not null and cardinality(l.tags) > 0
         group by l.client_id, l.tenant_id) x
 where c.id = x.client_id and c.tenant_id = x.tenant_id
   and c.tags is distinct from private.juntar_tags(c.tenant_id, c.tags, x.tags);

update public.contacts k
   set tags = private.juntar_tags(k.tenant_id, k.tags, x.tags), updated_at = now()
  from (select l.contato_id, l.tenant_id, array_agg(t order by t) as tags
          from public.leads l, unnest(l.tags) t
         where l.client_id is null and cardinality(l.tags) > 0
         group by l.contato_id, l.tenant_id) x
 where k.id = x.contato_id and k.tenant_id = x.tenant_id
   and k.tags is distinct from private.juntar_tags(k.tenant_id, k.tags, x.tags);

drop trigger if exists trg_tag_da_oportunidade_vai_para_a_pessoa on public.leads;
drop function if exists private.trg_tag_da_oportunidade_vai_para_a_pessoa();
drop trigger if exists trg_registrar_tags on public.leads;

-- Renomear: as fichas, os contatos e as conversas (a semente), sem as oportunidades.
create or replace function pg_temp.trocar_no_corpo(p_fn regprocedure, p_de text[], p_para text[], p_vezes int[])
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
  'public.renomear_tag(uuid,uuid,text)'::regprocedure,
  array[$t$  update public.leads r set tags = private.trocar_tag(r.tags, v_antigo, v_final)
  where r.tenant_id = p_tenant and exists (select 1 from unnest(r.tags) x where lower(btrim(x)) = lower(v_antigo));
  get diagnostics v_n = row_count; v_total := v_total + v_n;
$t$],
  array[''],
  array[1]);

-- O uso de cada tag, em PESSOAS (o tipo da volta mudou: drop + create).
drop function if exists public.tags_da_rede(uuid);
create function public.tags_da_rede(p_tenant uuid)
returns table(id uuid, nome text, arquivada_em timestamptz, clientes bigint, contatos bigint)
language sql
stable
security definer
set search_path to 'public'
as $function$
  with uso as (
    select lower(btrim(x)) as chave, 'c' as onde from public.clients r, unnest(r.tags) x where r.tenant_id = p_tenant
    union all
    select lower(btrim(x)), 'p' from public.contacts r, unnest(r.tags) x where r.tenant_id = p_tenant and r.client_id is null
  ), contagem as (
    select chave,
           count(*) filter (where onde = 'c') as clientes,
           count(*) filter (where onde = 'p') as contatos
    from uso group by chave
  )
  select t.id, t.nome, t.arquivada_em,
         coalesce(k.clientes, 0), coalesce(k.contatos, 0)
  from public.tags t
  left join contagem k on k.chave = lower(t.nome)
  where t.tenant_id = p_tenant
  order by lower(t.nome)
$function$;

revoke execute on function public.tags_da_rede(uuid) from public, anon, authenticated;
grant execute on function public.tags_da_rede(uuid) to service_role;

drop function if exists public.lead_tags_da_rede(uuid);

drop index if exists public.idx_leads_tags;
alter table public.leads drop column if exists tags;

notify pgrst, 'reload schema';
