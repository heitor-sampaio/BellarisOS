-- F71 (C2 que sobrou da F69): o fato do BANCO sabe quando quem gravou foi a
-- sessão de suporte.
--
-- Os gatilhos SQL (pagamento, estoque, comissão, termo, pontos) gravam o fato
-- em domain_events com origem 'banco' e sem ator: não sabiam que a gravação
-- veio de uma sessão de suporte, porque o suporte grava pelo cliente de
-- serviço. O cron, por isso, calava TODO fato do banco ocorrido com uma
-- sessão de suporte ativa na rede — inclusive o pagamento que a recepção
-- recebeu no mesmo período.
--
-- Agora o servidor diz ao banco: na requisição da sessão de suporte, o cliente
-- de serviço manda o cabeçalho `x-bellaris-suporte-sessao` (o id da sessão),
-- e este gatilho grava a marca `suporte_sessao_id` no fato — a mesma que o
-- fato do app já levava (gravarEvento). Só o fato com a marca deixa de
-- disparar automação.
--
-- Só vale o cabeçalho que chega com a chave de SERVIÇO (a sessão do
-- navegador não o forja) e só para uma sessão de suporte DA MESMA REDE do fato.
-- Aditiva: cria uma função e um gatilho.

create or replace function public.domain_events_marca_do_suporte()
returns trigger
language plpgsql
set search_path = public
as $$
declare
  v_claims     text;
  v_cabecalhos text;
  v_sessao     text;
  v_achada     uuid;
begin
  if new.suporte_sessao_id is not null then
    return new;
  end if;

  v_claims := nullif(current_setting('request.jwt.claims', true), '');
  if v_claims is null or (v_claims::json ->> 'role') is distinct from 'service_role' then
    return new;
  end if;

  v_cabecalhos := nullif(current_setting('request.headers', true), '');
  if v_cabecalhos is null then
    return new;
  end if;

  v_sessao := v_cabecalhos::json ->> 'x-bellaris-suporte-sessao';
  if v_sessao is null
     or v_sessao !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' then
    return new;
  end if;

  select s.id into v_achada
    from public.support_sessions s
   where s.id = v_sessao::uuid
     and s.tenant_id = new.tenant_id;

  new.suporte_sessao_id := v_achada;
  return new;
exception when others then
  -- Nunca derruba a gravação de quem emitiu o fato: sem a marca, o fato só
  -- segue o caminho comum.
  return new;
end;
$$;

revoke execute on function public.domain_events_marca_do_suporte() from public, anon, authenticated;

drop trigger if exists trg_domain_events_marca_do_suporte on public.domain_events;
create trigger trg_domain_events_marca_do_suporte
  before insert on public.domain_events
  for each row execute function public.domain_events_marca_do_suporte();

notify pgrst, 'reload schema';
