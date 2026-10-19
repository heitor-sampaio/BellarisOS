-- A clínica nova LIGA a ficha à conta que a cliente já tem (2026-10-19,
-- decisão do Heitor: liga sozinho quando o e-mail e o CPF batem).
--
-- O Auth tem um login por e-mail. Quando a clínica B dá acesso a um e-mail que
-- já tem login, esta função diz o que fazer com ele:
--   'ligar'          → é login de CLIENTE e uma ficha dele (de outra clínica)
--                      tem o mesmo CPF: a ficha nova vai para esta conta;
--   'cpf'            → é de cliente, mas nenhuma ficha dele tem este CPF
--                      (e-mail digitado errado mostraria a ficha a um estranho);
--   'ja_nesta_rede'  → esse login já tem ficha nesta clínica;
--   'equipe'         → é login de membro de rede ou da plataforma (fica de
--                      fora, decisão do Heitor: ela usa outro e-mail).
-- Nenhuma linha: o e-mail não tem login (cria-se um, como sempre).
--
-- Lê auth.users: security definer, e só o servidor chama (service role).

create or replace function public.login_de_cliente_para_ligar(p_email text, p_cpf text, p_tenant uuid)
returns table (auth_id uuid, motivo text)
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_id   uuid;
  v_meta jsonb;
  v_cpf  text := regexp_replace(coalesce(p_cpf, ''), '\D', '', 'g');
begin
  select u.id, u.raw_app_meta_data into v_id, v_meta
    from auth.users u
   where lower(u.email) = lower(trim(p_email))
   limit 1;
  if v_id is null then return; end if;

  if coalesce(v_meta ->> 'role', '') <> 'CLIENT' or v_meta ? 'plataforma' then
    return query select v_id, 'equipe'::text; return;
  end if;
  if exists (select 1 from public.clients c where c.auth_id = v_id::text and c.tenant_id = p_tenant) then
    return query select v_id, 'ja_nesta_rede'::text; return;
  end if;
  if v_cpf = '' or not exists (
    select 1 from public.clients c
     where c.auth_id = v_id::text
       and regexp_replace(coalesce(c.document, ''), '\D', '', 'g') = v_cpf
  ) then
    return query select v_id, 'cpf'::text; return;
  end if;
  return query select v_id, 'ligar'::text;
end $$;

revoke execute on function public.login_de_cliente_para_ligar(text, text, uuid) from public, anon, authenticated;
grant execute on function public.login_de_cliente_para_ligar(text, text, uuid) to service_role;

notify pgrst, 'reload schema';
