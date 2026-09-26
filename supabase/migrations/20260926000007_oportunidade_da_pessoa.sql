-- A oportunidade passa a ser da PESSOA, não da thread.
--
-- Último passo do contato separado da conversa (§9.2.1). `leads.conversation_id`
-- é singular, e com várias threads por pessoa isso prendia o card numa delas:
-- lead entra pelo número do marketing, a unidade assume por outro, e a
-- oportunidade continua "morando" na thread do marketing. Quem abre a thread da
-- unidade não via o negócio da pessoa que está atendendo.
--
-- `leads.contato_id` é a dona. `leads.conversation_id` fica, com o sentido que
-- sempre teve na prática: a thread onde a oportunidade NASCEU. Nenhum leitor
-- pergunta mais "as oportunidades desta conversa" — a pergunta é "desta pessoa".
--
-- E havia um furo que isto fecha: `createLead` (cadastro manual em
-- Oportunidades) nunca gravou `conversation_id`. Desde 2026-09-17 todo lead
-- criado por lá nasceria SEM pessoa — fora do card do contato, fora dos filtros
-- do inbox. Não aconteceu só porque ninguém criou lead por lá desde então (0 de
-- 25 sem conversa, medido antes de escrever isto).

alter table public.leads
  add column if not exists contato_id uuid
  references public.contacts(id) on delete restrict;

create index if not exists idx_leads_contato
  on public.leads (contato_id);

comment on column public.leads.contato_id is
  'A PESSOA dona desta oportunidade. Preenchida por gatilho: da conversa de origem, ou pelo telefone, ou criando a pessoa.';
comment on column public.leads.conversation_id is
  'A thread onde a oportunidade NASCEU. Não é a dona — a dona é contato_id. Não use para listar "as oportunidades desta conversa".';

-- ── Backfill ─────────────────────────────────────────────────────────────────
update public.leads l
set contato_id = c.contato_id
from public.conversations c
where c.id = l.conversation_id
  and l.contato_id is null
  and c.contato_id is not null;

-- ── Toda oportunidade nasce com pessoa ───────────────────────────────────────
--
-- Em gatilho, pelo mesmo motivo de `trg_conversa_ganha_contato`: há mais de um
-- ponto que cria lead (o card do inbox e o cadastro manual), e o cadastro manual
-- já provou que esquecer é o que acontece.
--
-- Ordem da busca:
--   1. a pessoa da conversa de origem, quando há uma;
--   2. a pessoa com este telefone — o mesmo formato (só dígitos) que o webhook
--      e `openLeadConversation` usam, então quem escrever depois pelo WhatsApp
--      cai na mesma pessoa;
--   3. uma pessoa nova.
--
-- Sem 55 adivinhado nem nono dígito: o resto do sistema também não adivinha, e
-- uma heurística só aqui juntaria pessoas que o webhook separaria.
create or replace function public.fn_oportunidade_ganha_contato()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  -- ⚠️ Nenhuma variável com nome de coluna de `contacts` ou `leads` (42702).
  fone   text;
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

  if achado is null and fone is not null then
    select k.id into achado
    from public.contacts k
    where k.tenant_id = new.tenant_id
      and k.identifiers && array[fone]
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
$$;

comment on function public.fn_oportunidade_ganha_contato() is
  'Dá dono a toda oportunidade: a pessoa da conversa de origem, a do telefone, ou uma nova. Em gatilho porque o cadastro manual já esqueceu uma vez.';

drop trigger if exists trg_oportunidade_ganha_contato on public.leads;
create trigger trg_oportunidade_ganha_contato
  before insert or update of conversation_id, contato_id on public.leads
  for each row execute function public.fn_oportunidade_ganha_contato();

-- Com o gatilho e o backfill, não há como ficar nula. Travar no banco é o que
-- impede o próximo caminho de escrita de reabrir o furo.
alter table public.leads alter column contato_id set not null;

-- ── Conversa criada JÁ com dono também ensina a pessoa ───────────────────────
--
-- `openLeadConversation` passa a criar a thread com o `contato_id` do lead. O
-- gatilho da conversa saía cedo quando o dono vinha pronto, e aí os aliases da
-- thread (`lead:<id>`, por exemplo) não entravam em `identifiers` — quebrando a
-- invariante `contact_aliases ⊆ identifiers` do §9.2.1.
create or replace function public.fn_conversa_ganha_contato()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  ids       text[];
  -- ⚠️ NÃO chame esta variável de `tags`: `contacts.tags` é coluna, e no `update`
  -- abaixo a referência fica ambígua — `42702`, dentro do gatilho, o que faz o
  -- INSERT da conversa falhar e a mensagem do cliente ser descartada. Foi
  -- exatamente o que aconteceu na primeira versão desta função.
  tags_novas text[];
  achado    uuid;
begin
  ids := array_remove(
    coalesce(nullif(new.contact_aliases, '{}'), array[new.contact_external_id]),
    null
  );
  tags_novas := array_remove(coalesce(new.tags, '{}'), null);

  achado := new.contato_id;

  if achado is null and array_length(ids, 1) is null then
    insert into public.contacts (tenant_id, name, phone, identifiers, tags)
    values (new.tenant_id, new.contact_name, new.contact_phone, '{}', tags_novas)
    returning id into achado;
    new.contato_id := achado;
    return new;
  end if;

  if achado is null then
    select c.id into achado
    from public.contacts c
    where c.tenant_id = new.tenant_id
      and c.identifiers && ids
    limit 1;
  end if;

  if achado is null then
    insert into public.contacts (tenant_id, name, phone, identifiers, tags)
    values (new.tenant_id, new.contact_name, new.contact_phone, ids, tags_novas)
    returning id into achado;
  else
    -- Colunas QUALIFICADAS (`c.`) — é o que torna impossível uma variável
    -- declarada aqui voltar a sombrear uma coluna sem ninguém notar.
    update public.contacts c
    set identifiers = (
          select coalesce(array_agg(distinct x), '{}')
          from unnest(c.identifiers || coalesce(ids, '{}')) as t(x)
          where x is not null
        ),
        tags = (
          select coalesce(array_agg(distinct x), '{}')
          from unnest(c.tags || tags_novas) as t(x)
          where x is not null
        ),
        updated_at  = now()
    where c.id = achado;
  end if;

  new.contato_id := achado;
  return new;
end;
$$;
