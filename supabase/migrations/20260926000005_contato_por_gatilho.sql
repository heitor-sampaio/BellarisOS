-- Toda conversa nasce ligada a uma PESSOA, e ninguém precisa lembrar disso.
--
-- A migration anterior criou `contacts` e ligou as conversas que existiam. Mas a
-- ligação era feita no código, em cada ponto que cria conversa — hoje três
-- (`resolveConversation`, `openLeadConversation`, `createConversationForLead`) e
-- amanhã mais. Um esquecido e a coluna nasce certa e apodrece: nenhum leitor
-- depende dela ainda, então o defeito não aparece até o dia em que aparecer no
-- pior lugar.
--
-- É o mesmo argumento que já pôs `pagamento.*` e `estoque.*` em gatilho
-- (CLAUDE.md §9.9): "esses fatos nascem em cinco ou seis lugares do código e
-- instrumentar um a um é garantir esquecer o próximo".
--
-- O que está aqui é integridade de identidade — de quem é esta thread —, não
-- regra de negócio. Preço, permissão e comissão continuam fora do banco.
--
-- ⚠️ Quem lê o TypeScript não vê isto acontecer. `lib/inbox/resolve-conversation.ts`
-- diz onde olhar.

create or replace function public.fn_conversa_ganha_contato()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  ids   text[];
  achado uuid;
begin
  if new.contato_id is not null then
    return new;
  end if;

  -- Os identificadores desta thread. `contact_aliases` é o normal; o
  -- `contact_external_id` é a rede de segurança para quem insere sem alias —
  -- contato sem identificador nenhum não é reencontrável, e a próxima mensagem
  -- criaria uma segunda pessoa.
  ids := array_remove(
    coalesce(nullif(new.contact_aliases, '{}'), array[new.contact_external_id]),
    null
  );

  if array_length(ids, 1) is null then
    -- Sem nada por onde identificar: cria a pessoa mesmo assim, para a coluna
    -- não nascer nula, e ela fica isolada. É melhor que thread sem dono.
    insert into public.contacts (tenant_id, name, phone, identifiers)
    values (new.tenant_id, new.contact_name, new.contact_phone, '{}')
    returning id into achado;
    new.contato_id := achado;
    return new;
  end if;

  -- A MESMA pessoa, por qualquer identificador, **sem recorte de canal nem de
  -- caixa**: é justamente o cruzamento que interessa. Com filtro, cada caixa
  -- criaria o seu contato e o problema voltaria com outro nome.
  select c.id into achado
  from public.contacts c
  where c.tenant_id = new.tenant_id
    and c.identifiers && ids
  limit 1;

  if achado is null then
    insert into public.contacts (tenant_id, name, phone, identifiers)
    values (new.tenant_id, new.contact_name, new.contact_phone, ids)
    returning id into achado;
  else
    -- Mantém a invariante: os aliases da conversa são subconjunto dos
    -- identificadores da pessoa. Se um ficasse só na conversa, a próxima
    -- mensagem que chegasse por ele não acharia o contato.
    update public.contacts
    set identifiers = (
          select array_agg(distinct x)
          from unnest(identifiers || ids) as t(x)
        ),
        updated_at  = now()
    where id = achado;
  end if;

  new.contato_id := achado;
  return new;
end;
$$;

comment on function public.fn_conversa_ganha_contato() is
  'Liga toda conversa nova à pessoa dela, achando por identificador em qualquer canal ou caixa. Em gatilho porque há vários pontos que criam conversa e instrumentar um a um é esquecer o próximo.';

drop trigger if exists trg_conversa_ganha_contato on public.conversations;
create trigger trg_conversa_ganha_contato
  before insert on public.conversations
  for each row execute function public.fn_conversa_ganha_contato();

-- ── A pessoa aprende o que a thread aprendeu ─────────────────────────────────
--
-- `completarIdentidade` descobre depois o telefone de quem chegou por @lid, e o
-- nome de verdade de quem nasceu com o próprio identificador no lugar do nome.
-- Isso ia para a conversa e para a oportunidade; agora vai para a pessoa também,
-- e pelo banco, para não depender de um terceiro chamador lembrar.
create or replace function public.fn_contato_aprende_da_conversa()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.contato_id is null then
    return null;
  end if;

  update public.contacts c
  set identifiers = (
        select array_agg(distinct x)
        from unnest(
          c.identifiers || array_remove(coalesce(new.contact_aliases, '{}'), null)
        ) as t(x)
      ),
      -- Nome só quando a conversa trocou o dela, ou seja, quando o anterior era
      -- provisório. Sobrescrever nome escrito por quem atende seria perda.
      name  = case when new.contact_name is distinct from old.contact_name
                   then coalesce(new.contact_name, c.name) else c.name end,
      -- Telefone só ganha, nunca perde: quem chegou por @lid e depois revelou o
      -- número não pode voltar a ficar sem.
      phone = coalesce(c.phone, new.contact_phone),
      updated_at = now()
  where c.id = new.contato_id;

  return null;
end;
$$;

comment on function public.fn_contato_aprende_da_conversa() is
  'Propaga para a pessoa o alias, o nome e o telefone que a thread descobriu depois. Mantém a invariante contact_aliases ⊆ identifiers.';

drop trigger if exists trg_contato_aprende on public.conversations;
create trigger trg_contato_aprende
  after update of contact_aliases, contact_name, contact_phone
  on public.conversations
  for each row
  when (
    new.contact_aliases is distinct from old.contact_aliases
    or new.contact_name is distinct from old.contact_name
    or new.contact_phone is distinct from old.contact_phone
  )
  execute function public.fn_contato_aprende_da_conversa();
