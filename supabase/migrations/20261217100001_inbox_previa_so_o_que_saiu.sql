-- A6 e A7 da 38ª simulação (2026-11-27): a prévia da lista do inbox mostrava o
-- texto da resposta NÃO enviada como se tivesse saído, e ela punha "Última
-- interação há agora". crm-inbox:IN-18 ("a resposta que não saiu não é
-- resposta"), princípio 3. Decisão do Claude, 27/11: a prévia (o texto, a
-- hora e a direção da última mensagem) e a última saída contam só o que SAIU
-- (aceito pelo provedor: 'sent', 'delivered', 'read') ou CHEGOU — a mesma
-- régua do "aguardando" e da 1ª resposta (migration 20261210100001).
--
--  1. No INSERT (`on_new_message`, troca de trechos no corpo VIVO, com a
--     conferência da contagem): a saída que não nasce aceita ('sending',
--     'failed') não mexe na prévia nem na última saída. A hora só entra se a
--     conversa ainda não tinha nenhuma: a conversa que a equipe abriu e cuja
--     primeira mensagem não saiu segue na lista (sem hora, ela some dela), com
--     a bolha "Não enviada" e o "Tentar de novo". A importada e a que chega não
--     mudam.
--  2. No UPDATE da situação (`on_mensagem_aceita`): a mensagem que PASSA a
--     aceita (o envio que deu certo, o "Tentar de novo" que deu certo, a nota
--     interna) vira a prévia — se não houver uma mais nova (a cliente que
--     escreveu no meio do envio continua sendo a prévia).
--  3. Os dados de antes: a conversa cuja última mensagem é uma saída não
--     aceita volta à prévia da última que saiu ou chegou; sem nenhuma, fica sem
--     texto e com a hora que tinha.

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
end $f$;

select pg_temp.trocar_no_corpo(
  'public.on_new_message()'::regprocedure,
  array[
    $t$last_message           = left(new.content, 80),$t$,
    $t$last_message_at        = new.created_at,$t$,
    $t$last_message_direction = new.direction,$t$,
    $t$last_outbound_at = case when new.direction = 'outbound' then new.created_at else c.last_outbound_at end$t$
  ],
  array[
    $t$last_message           = case when new.direction = 'outbound' and new.status not in ('sent', 'delivered', 'read') then c.last_message else left(new.content, 80) end,$t$,
    $t$last_message_at        = case when new.direction = 'outbound' and new.status not in ('sent', 'delivered', 'read') then coalesce(c.last_message_at, new.created_at) else new.created_at end,$t$,
    $t$last_message_direction = case when new.direction = 'outbound' and new.status not in ('sent', 'delivered', 'read') then c.last_message_direction else new.direction end,$t$,
    $t$last_outbound_at = case when new.direction = 'outbound' and new.status in ('sent', 'delivered', 'read') then new.created_at else c.last_outbound_at end$t$
  ],
  array[1, 1, 1, 1]
);

create or replace function public.on_mensagem_aceita()
 returns trigger
 language plpgsql
 set search_path to 'public'
as $function$
begin
  if new.direction <> 'outbound' or new.importada then
    return new;
  end if;
  if old.status in ('sent', 'delivered', 'read') or new.status not in ('sent', 'delivered', 'read') then
    return new;
  end if;

  update public.conversations c
  set
    first_response_seconds = case
      when c.first_response_seconds is null and c.awaiting_since is not null
        then greatest(0, extract(epoch from (now() - c.awaiting_since))::int)
      else c.first_response_seconds
    end,
    awaiting_since = null,
    last_message           = case when c.last_message_at is null or new.created_at >= c.last_message_at then left(new.content, 80) else c.last_message end,
    last_message_direction = case when c.last_message_at is null or new.created_at >= c.last_message_at then new.direction else c.last_message_direction end,
    last_message_at        = greatest(c.last_message_at, new.created_at),
    last_outbound_at       = greatest(c.last_outbound_at, new.created_at)
  where c.id = new.conversation_id;
  return new;
end;
$function$;

revoke all on function public.on_mensagem_aceita() from public, anon, authenticated;
grant execute on function public.on_mensagem_aceita() to service_role;

-- 3. Os dados de antes. "Conta" = a que chegou, a importada, ou a saída aceita.
with ultima as (
  select c.id,
    (select m.id from public.messages m
      where m.conversation_id = c.id
      order by m.created_at desc, m.id desc limit 1) as msg_id
  from public.conversations c
), alvo as (
  select u.id from ultima u
  join public.messages m on m.id = u.msg_id
  where m.direction = 'outbound' and not m.importada
    and m.status not in ('sent', 'delivered', 'read')
), conta as (
  select a.id, x.content, x.created_at, x.direction
  from alvo a
  left join lateral (
    select m.content, m.created_at, m.direction from public.messages m
    where m.conversation_id = a.id
      and (m.direction = 'inbound' or m.importada or m.status in ('sent', 'delivered', 'read'))
    order by m.created_at desc, m.id desc limit 1
  ) x on true
)
update public.conversations c
set last_message           = left(k.content, 80),
    last_message_at        = coalesce(k.created_at, c.last_message_at),
    last_message_direction = k.direction
from conta k
where c.id = k.id;

notify pgrst, 'reload schema';
