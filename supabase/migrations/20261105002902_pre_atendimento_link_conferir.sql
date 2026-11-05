-- F29 (7ª simulação, 2026-11-05) — A52: a equipe preencheu a ficha de
-- pré-atendimento na clínica, e o link mandado à cliente dizia "Ficha já
-- respondida": ela não podia conferir nem completar o que faltou.
--
-- A ficha respondida pela EQUIPE (`pre_atendimentos.origem = 'EQUIPE'`) com o
-- link ainda não usado, nem revogado, nem vencido, passa a abrir para a
-- cliente CONFERIR: a espiada diz `conferir: true` (o estado segue 'usado',
-- para o código que ainda está no ar até o push continuar dizendo "já
-- respondida"), e `abrir` deixa passar (a mesma identidade de sempre, as
-- mesmas contas de tentativas) e diz `conferir: true`. A que a própria
-- cliente respondeu (app ou link) segue "já respondida". Partindo do corpo
-- atual da produção.

create or replace function public.pre_atendimento_link_espiar(p_token_hash text)
 returns jsonb
 language plpgsql
 stable security definer
 set search_path to ''
as $function$
declare
  v_link public.pre_atendimento_links%rowtype;
  v_pre  public.pre_atendimentos%rowtype;
  v_cpf  text;
begin
  select * into v_link from public.pre_atendimento_links l where l.token_hash = p_token_hash;
  if not found then return jsonb_build_object('estado', 'invalido'); end if;
  select * into v_pre from public.pre_atendimentos p where p.id = v_link.pre_atendimento_id;
  select regexp_replace(coalesce(c.document, ''), '\D', '', 'g') into v_cpf from public.clients c where c.id = v_pre.client_id;
  return jsonb_build_object(
    'estado', case
      when v_link.used_at is not null or v_pre.status = 'RESPONDIDO' then 'usado'
      when v_link.revoked_at is not null then 'revogado'
      when v_link.expires_at < now() then 'vencido'
      when v_pre.status <> 'PENDENTE' then 'indisponivel'
      else 'valido' end,
    'conferir', v_link.used_at is null and v_link.revoked_at is null and v_link.expires_at >= now()
      and v_pre.status = 'RESPONDIDO' and coalesce(v_pre.origem, '') = 'EQUIPE',
    'clinica', coalesce(
      (select b.name from public.appointments a join public.branches b on b.id = a.branch_id where a.id = v_pre.appointment_id),
      (select t.name from public.tenants t where t.id = v_pre.tenant_id)),
    'telefone', (select nullif(btrim(b.phone), '') from public.appointments a join public.branches b on b.id = a.branch_id where a.id = v_pre.appointment_id),
    'pede', case when v_cpf <> '' then 'CPF' else 'NASCIMENTO' end);
end $function$;

create or replace function public.pre_atendimento_link_abrir(p_token_hash text, p_cpf text, p_nascimento date, p_ip inet)
 returns jsonb
 language plpgsql
 security definer
 set search_path to ''
as $function$
declare
  v_link     public.pre_atendimento_links%rowtype;
  v_pre      public.pre_atendimentos%rowtype;
  v_cpf      text;
  v_nasc     date;
  v_ok       boolean;
  v_erros_ip int;
begin
  select * into v_link from public.pre_atendimento_links l where l.token_hash = p_token_hash for update;
  if not found then return jsonb_build_object('erro', 'invalido'); end if;
  if v_link.used_at is not null then return jsonb_build_object('erro', 'usado'); end if;
  if v_link.revoked_at is not null then return jsonb_build_object('erro', 'revogado'); end if;
  if v_link.expires_at < now() then return jsonb_build_object('erro', 'vencido'); end if;

  if p_ip is not null then
    select count(*) into v_erros_ip from public.pre_atendimento_link_attempts a
     where a.ip = p_ip and not a.ok and a.created_at > now() - interval '1 hour';
    if v_erros_ip >= 20 then return jsonb_build_object('erro', 'limite'); end if;
  end if;

  select * into v_pre from public.pre_atendimentos p where p.id = v_link.pre_atendimento_id;
  -- A respondida pela EQUIPE se confere pelo link (A52); a da cliente, não.
  if v_pre.status = 'RESPONDIDO' and coalesce(v_pre.origem, '') <> 'EQUIPE' then return jsonb_build_object('erro', 'usado'); end if;
  if v_pre.status not in ('PENDENTE', 'RESPONDIDO') then return jsonb_build_object('erro', 'indisponivel'); end if;

  select regexp_replace(coalesce(c.document, ''), '\D', '', 'g'), (c.birth_date at time zone 'UTC')::date
    into v_cpf, v_nasc
    from public.clients c where c.id = v_pre.client_id;

  if v_cpf <> '' then
    v_ok := regexp_replace(coalesce(p_cpf, ''), '\D', '', 'g') = v_cpf;
  elsif v_nasc is not null then
    v_ok := p_nascimento is not null and p_nascimento = v_nasc;
  else
    return jsonb_build_object('erro', 'sem_identidade');
  end if;

  insert into public.pre_atendimento_link_attempts (link_id, ip, ok) values (v_link.id, p_ip, v_ok);

  if not v_ok then
    update public.pre_atendimento_links l
       set failed_attempts = l.failed_attempts + 1,
           revoked_at = case when l.failed_attempts + 1 >= 5 then now() else l.revoked_at end
     where l.id = v_link.id;
    return jsonb_build_object('erro', case when v_link.failed_attempts + 1 >= 5 then 'revogado' else 'identidade' end,
                              'restantes', greatest(0, 4 - v_link.failed_attempts));
  end if;

  return jsonb_build_object('ok', true, 'pre', v_pre.id, 'tenant', v_pre.tenant_id, 'cliente', v_pre.client_id, 'link', v_link.id,
                            'conferir', v_pre.status = 'RESPONDIDO');
end $function$;

notify pgrst, 'reload schema';
