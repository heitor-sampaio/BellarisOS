-- F29 (7ª simulação, 2026-11-05) — as decisões 1 e 2 do Heitor ("concordo").
--
-- Decisão 2 — a menor de idade e o responsável legal. A Beatriz tinha 16
-- anos, e a recepção escrevia o nome da mãe nas Anotações. A ficha ganha o
-- responsável (nome, CPF, parentesco, telefone): a tela o pede quando a idade
-- é menor que 18, o termo o cita (`responsavel.*`) e é ele quem assina. Avisar,
-- não barrar (princípio 2): nada aqui é obrigatório. As fichas de antes não
-- mudam (o que está nas Anotações fica lá).
alter table public.clients
  add column if not exists responsavel_nome       text,
  add column if not exists responsavel_cpf        text,
  add column if not exists responsavel_parentesco text,
  add column if not exists responsavel_telefone   text;

comment on column public.clients.responsavel_nome is
  'O responsável legal da menor de idade (decisão 2 do Heitor, 2026-11-05): assina o termo por ela.';
comment on column public.clients.responsavel_cpf is 'O CPF do responsável legal, só os dígitos.';

-- Decisão 1 — o acesso ao app de quem não tem CPF. A senha inicial passa a ser
-- o número do documento da ficha (passaporte ou RNE), provisória como a do
-- CPF. "Dar acesso a quem já tem conta" (CLAUDE.md §5) seguia SÓ pelo CPF:
-- sem CPF, a mesma pessoa só se liga com o MESMO documento — o tipo e o número
-- (decidido pelo §5: "a mesma pessoa" é provada pelo documento, como o CPF).
-- A função antiga (`login_de_cliente_para_ligar`, só CPF) fica, sem chamador.
create or replace function public.login_de_cliente_para_ligar_doc(
  p_email text, p_tenant uuid, p_cpf text, p_documento_tipo text, p_documento_numero text)
returns table(auth_id uuid, motivo text)
language plpgsql stable security definer set search_path to ''
as $function$
declare
  v_id   uuid;
  v_meta jsonb;
  v_cpf  text := regexp_replace(coalesce(p_cpf, ''), '\D', '', 'g');
  v_num  text := upper(regexp_replace(coalesce(p_documento_numero, ''), '\s', '', 'g'));
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

  if v_cpf <> '' then
    if not exists (
      select 1 from public.clients c
       where c.auth_id = v_id::text
         and regexp_replace(coalesce(c.document, ''), '\D', '', 'g') = v_cpf
    ) then
      return query select v_id, 'cpf'::text; return;
    end if;
  elsif v_num <> '' and p_documento_tipo in ('PASSAPORTE', 'RNE') then
    if not exists (
      select 1 from public.clients c
       where c.auth_id = v_id::text
         and c.documento_tipo = p_documento_tipo
         and upper(coalesce(c.documento_numero, '')) = v_num
    ) then
      return query select v_id, 'documento'::text; return;
    end if;
  else
    return query select v_id, 'documento'::text; return;
  end if;

  return query select v_id, 'ligar'::text;
end $function$;

revoke execute on function public.login_de_cliente_para_ligar_doc(text, uuid, text, text, text) from public, anon, authenticated;
grant execute on function public.login_de_cliente_para_ligar_doc(text, uuid, text, text, text) to service_role;

notify pgrst, 'reload schema';
