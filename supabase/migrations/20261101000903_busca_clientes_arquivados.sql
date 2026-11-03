-- A busca universal acha a cliente ARQUIVADA (A19 da 5ª simulação,
-- 2026-11-01): `busca_universal` só olha as ativas, e quem procurava "Valdir"
-- não o achava e recebia "Cadastrar Valdir como cliente" — a duplicata, em vez
-- de reativar. Esta função devolve as arquivadas que casam com o termo, com a
-- MESMA regra de casar do bloco de clientes de `busca_universal` (sem acento,
-- todas as palavras, telefone e CPF por dígitos só quando o termo é número);
-- a tela as mostra com a marca "Arquivada" e a ação "Reativar".
-- Separada para não reescrever a `busca_universal` inteira.

create or replace function public.busca_clientes_arquivados(p_tenant uuid, p_termo text, p_limite integer default 5)
returns table (id uuid, titulo text, subtitulo text, extra jsonb)
language sql
stable
security definer
set search_path to 'public'
as $$
  with t as (
    select private.sem_acento(regexp_replace(trim(coalesce(p_termo, '')), '\s+', ' ', 'g')) as v_bruto,
           regexp_replace(coalesce(p_termo, ''), '\D', '', 'g') as v_digitos
  ),
  q as (
    select
      replace(replace(replace(v_bruto, '\', '\\'), '%', '\%'), '_', '\_') as v_esc,
      string_to_array(replace(replace(replace(v_bruto, '\', '\\'), '%', '\%'), '_', '\_'), ' ') as v_palavras,
      case when length(v_digitos) >= 3 and v_bruto !~ '[a-z]' then v_digitos end as v_dig
    from t
    where length(v_bruto) >= 2
  )
  select c.id, c.name, c.phone, jsonb_build_object('email', c.email, 'arquivada', true)
  from public.clients c, q
  where c.tenant_id = p_tenant
    and not c.is_active
    and (private.tem_todas(private.sem_acento(concat_ws(' ', c.name, c.email,
           regexp_replace(coalesce(c.phone, ''), '\D', '', 'g'),
           regexp_replace(coalesce(c.document, ''), '\D', '', 'g'))), q.v_palavras)
         or (q.v_dig is not null and (
               regexp_replace(coalesce(c.phone, ''), '\D', '', 'g') like '%' || q.v_dig || '%'
            or regexp_replace(coalesce(c.document, ''), '\D', '', 'g') like '%' || q.v_dig || '%')))
  order by (private.sem_acento(c.name) like q.v_esc || '%') desc, c.name
  limit greatest(1, least(coalesce(p_limite, 5), 20))
$$;

comment on function public.busca_clientes_arquivados(uuid, text, integer) is
  'As clientes ARQUIVADAS que casam com o termo da busca universal (A19), com a regra de casar de busca_universal. Só o servidor.';

revoke execute on function public.busca_clientes_arquivados(uuid, text, integer) from public, anon, authenticated;
grant  execute on function public.busca_clientes_arquivados(uuid, text, integer) to service_role;

notify pgrst, 'reload schema';
