-- A16 da 6ª simulação (2026-11-04): a Pri criou a Alice no quadro com
-- "(81) 99600-0070", e o gatilho deu à pessoa o identificador "81996000070" —
-- só os dígitos digitados, SEM o 55. O telefone da pessoa é o do WhatsApp
-- (55 + DDD + número, crm-inbox.md: "Gravar telefone … fora do formato do
-- WhatsApp" é o que nunca fazer), e assim nem o cadastro da recepção ("É a
-- mesma pessoa do lead X?", D-9) nem a mensagem do WhatsApp a achavam: a Alice
-- virou uma ficha solta, e a Pri não soube que ela agendou.
--
-- Agora o número nacional (10 ou 11 dígitos, sem "+") ganha o 55, e a busca
-- da pessoa olha as duas formas do celular (com e sem o nono dígito) e também
-- a forma antiga, sem o 55 — a pessoa gravada assim antes desta migration
-- continua sendo achada. O número escrito com "+" é de outro país e fica como
-- veio. Parte do corpo atual da produção (pg_get_functiondef).

create or replace function public.fn_oportunidade_ganha_contato()
 returns trigger
 language plpgsql
 security definer
 set search_path to ''
as $function$
declare
  fone   text;
  formas text[];
  achado uuid;
begin
  if new.contato_id is not null then
    return new;
  end if;

  if new.conversation_id is not null then
    select c.contato_id into achado
    from public.conversations c
    where c.id = new.conversation_id;
  end if;

  fone := nullif(regexp_replace(coalesce(new.phone, ''), '\D', '', 'g'), '');
  -- O número nacional vai para o formato do WhatsApp (o de fora começa com "+").
  if fone is not null and length(fone) in (10, 11) and left(btrim(new.phone), 1) <> '+' then
    fone := '55' || fone;
  end if;

  if achado is null and fone is not null then
    formas := array[fone];
    -- As duas formas do celular brasileiro (o WhatsApp guarda muito sem o nono dígito).
    if fone ~ '^55[0-9]{2}9[0-9]{8}$' then
      formas := formas || (substr(fone, 1, 4) || substr(fone, 6));
    elsif fone ~ '^55[0-9]{2}[6-9][0-9]{7}$' then
      formas := formas || (substr(fone, 1, 4) || '9' || substr(fone, 5));
    end if;
    -- A pessoa gravada antes, sem o 55.
    formas := formas || coalesce((
      select array_agg(substr(f, 3)) from unnest(formas) f
      where f like '55%' and length(f) in (12, 13)
    ), '{}'::text[]);

    select k.id into achado
    from public.contacts k
    where k.tenant_id = new.tenant_id
      and k.identifiers && formas
    order by k.created_at
    limit 1;
  end if;

  if achado is null then
    insert into public.contacts (tenant_id, name, phone, identifiers)
    values (
      new.tenant_id, new.name, fone,
      case when fone is null then '{}'::text[] else array[fone] end
    )
    returning id into achado;
  end if;

  new.contato_id := achado;
  return new;
end;
$function$;

notify pgrst, 'reload schema';
