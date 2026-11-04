-- A15 da 6ª simulação (2026-11-04): os contatos importados SEM "criar
-- oportunidade" não apareciam em lugar nenhum — Clientes, Ctrl K, Inbox e
-- Oportunidades só listam a ficha, a conversa e o card, e a pessoa do CRM
-- (`contacts`) que não tem nenhum dos dois ficava invisível.
--
-- A busca universal passa a achá-la: a pessoa da rede SEM oportunidade e SEM
-- conversa (quem tem um dos dois já se acha por ele, com o alcance de lá). A
-- regra de casar é a da `busca_universal` (sem acento, todas as palavras,
-- telefone por dígitos só quando o termo é um telefone). Quem chama é o
-- servidor (`buscarTudo`), que decide quem pode: o CRM em Gerenciar, porque o
-- destino é criar a oportunidade dela.

create or replace function public.busca_pessoas_sem_oportunidade(p_tenant uuid, p_termo text, p_limite integer default 5)
 returns table(id uuid, titulo text, subtitulo text, extra jsonb)
 language sql
 stable security definer
 set search_path to 'public'
as $function$
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
  select k.id, k.name, k.phone, jsonb_build_object('email', k.email)
  from public.contacts k, q
  where k.tenant_id = p_tenant
    and not exists (select 1 from public.leads l where l.contato_id = k.id)
    and not exists (select 1 from public.conversations c where c.contato_id = k.id)
    and (private.tem_todas(private.sem_acento(concat_ws(' ', k.name, k.email,
           regexp_replace(coalesce(k.phone, ''), '\D', '', 'g'))), q.v_palavras)
         or (q.v_dig is not null
             and regexp_replace(coalesce(k.phone, ''), '\D', '', 'g') like '%' || q.v_dig || '%'))
  order by (private.sem_acento(coalesce(k.name, '')) like q.v_esc || '%') desc, k.name
  limit greatest(1, least(coalesce(p_limite, 5), 20))
$function$;

revoke execute on function public.busca_pessoas_sem_oportunidade(uuid, text, integer) from public, anon, authenticated;
grant  execute on function public.busca_pessoas_sem_oportunidade(uuid, text, integer) to service_role;

notify pgrst, 'reload schema';
