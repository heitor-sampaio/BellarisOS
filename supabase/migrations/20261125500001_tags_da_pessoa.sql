-- A tag é da PESSOA (o Heitor, 18/11, noite — a pergunta: "a tag é uma só,
-- da pessoa? Marcou na ficha, no inbox ou na oportunidade, vale em todo
-- filtro. Ou a oportunidade pode ter tags próprias?"; a resposta: "a tag é da
-- pessoa e pode ter mais de uma tag").
--
-- Até aqui as tags moravam em TRÊS colunas que nunca se encontravam:
-- `clients.tags` (a ficha: lista de Clientes, campanhas, automações, Copilot,
-- Financeiro, Agenda, Relatórios), `contacts.tags` (o painel e o filtro do
-- inbox) e `leads.tags` (o card e o filtro do quadro). A mesma pessoa tinha
-- três listas.
--
-- O desenho (crm-inbox.md §9.2.1, "As TAGS são da pessoa"):
-- - UMA lista por pessoa, guardada na ficha (`clients.tags`) e nos contatos
--   dela (`contacts.tags`) — e o BANCO as mantém iguais (os espelhos abaixo).
--   Cada leitor continua lendo a sua coluna, com o índice GIN de sempre.
-- - A ligação é `contacts.client_id` (nova): a ficha deste contato. Não é
--   única — a mesma pessoa pode ter dois contatos (Instagram e WhatsApp sem
--   identificador em comum). Nunca `clients.contato_id` também: duas chaves
--   entre as duas tabelas deixariam o embed do PostgREST ambíguo (PGRST201).
-- - A ligação é posta por GATILHO (como `trg_conversa_ganha_contato`: há
--   vários pontos que gravam `client_id` numa oportunidade ou conversa, e
--   instrumentar um a um é garantir esquecer o próximo), num lugar só:
--   `private.ligar_contato_a_ficha`. Nunca religa um contato que já é de outra
--   ficha (mãe e filha com o mesmo telefone).
-- - A conversa que chega pelo telefone de UMA ficha ativa se liga sozinha (o
--   Heitor, 18/11, noite: "sim, liga sozinha quando bater com uma ficha só"):
--   `private.ligar_conversa_a_ficha`, com a MESMA régua da importação (D11,
--   `lib/crm/ficha-do-telefone.ts`): o telefone nacional (10 ou 11 dígitos,
--   sem o 55) ou o de fora com "+", e `fichas_do_telefone` só com as ativas;
--   zero ou duas+ fichas, não liga.
-- - Quando ficha e contato se encontram, as tags dos dois lados se JUNTAM
--   (sem repetir, sem distinguir a caixa, com o nome do vocabulário).
-- - Toda gravação de tag em `clients` e `contacts` sai com o nome do
--   vocabulário (`private.juntar_tags`) — o `cs`/`@>` dos filtros (Financeiro,
--   Agenda, inbox) acha "VIP" mesmo que alguém tenha escrito "vip".
-- - `leads.tags` sai (a oportunidade não tem tag própria; o card mostra e
--   edita as da pessoa). Esta migration é ADITIVA: a coluna fica até o código
--   novo estar no ar, e uma PONTE leva a tag que o código velho gravar no card
--   para a pessoa. A 20261125500002 tira a ponte e a coluna.
--
-- Junto (as regras que a pessoa única expõe):
-- - o público das campanhas (`clientes_do_publico`) passa a E, como todo
--   filtro de tag (crm-inbox.md, "O filtro de Tags é E em todo lugar"; era OU);
-- - `copilot_aniversariantes` compara a tag pelo nome do vocabulário;
-- - a busca "Contatos do CRM" não mostra o contato que já tem ficha (ele é
--   achado como a cliente);
-- - `contacts` e `clients` a sessão só LÊ (CLAUDE.md §4, F63: "dado sensível:
--   a sessão só lê"; a ficha tem CPF). Todos os escritores do app usam o
--   cliente de serviço (conferido em 18/11). Com o espelho, quem gravasse
--   `contacts.tags` pela chave pública mudaria a ficha sem a trava da action.
--
-- Os dados que já existem: ligados pelas oportunidades e conversas que já
-- têm ficha (sem conflito), juntadas as tags, e as de `leads.tags` levadas à
-- pessoa. Na produção (18/11): 16 fichas ligadas por oportunidade, nenhum
-- conflito, 10 oportunidades com tag (nenhuma com ficha).

-- 1. A ligação --------------------------------------------------------------

alter table public.contacts
  add column if not exists client_id uuid references public.clients(id) on delete set null;

create index if not exists idx_contacts_client on public.contacts (client_id) where client_id is not null;

comment on column public.contacts.client_id is
  'A ficha (clients) desta pessoa. Posta por gatilho (private.ligar_contato_a_ficha), nunca religada. As tags da ficha e dos contatos dela são UMA lista (crm-inbox.md §9.2.1).';

-- 2. As tags com o nome do vocabulário, sem repetir --------------------------

create or replace function private.juntar_tags(p_tenant uuid, p_a text[], p_b text[])
returns text[]
language sql
stable
set search_path = ''
as $$
  with todas as (
    select btrim(u.x) as nome, u.ord
      from unnest(coalesce(p_a, '{}'::text[]) || coalesce(p_b, '{}'::text[])) with ordinality as u(x, ord)
     where u.x is not null and btrim(u.x) <> ''
  ), uma as (
    select distinct on (lower(t.nome)) t.nome, t.ord
      from todas t
     order by lower(t.nome), t.ord
  )
  select coalesce(array_agg(coalesce(
           (select v.nome from public.tags v where v.tenant_id = p_tenant and lower(v.nome) = lower(uma.nome)),
           uma.nome) order by uma.ord), '{}'::text[])
    from uma
$$;

revoke execute on function private.juntar_tags(uuid, text[], text[]) from public, anon, authenticated;

-- Toda gravação de tag na ficha e no contato sai com o nome do vocabulário.
create or replace function private.trg_tags_com_o_nome_do_vocabulario()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if tg_op = 'INSERT' or new.tags is distinct from old.tags then
    new.tags := private.juntar_tags(new.tenant_id, new.tags, null);
  end if;
  return new;
end
$$;

drop trigger if exists trg_tags_com_o_nome_do_vocabulario on public.clients;
create trigger trg_tags_com_o_nome_do_vocabulario
  before insert or update of tags on public.clients
  for each row execute function private.trg_tags_com_o_nome_do_vocabulario();

drop trigger if exists trg_tags_com_o_nome_do_vocabulario on public.contacts;
create trigger trg_tags_com_o_nome_do_vocabulario
  before insert or update of tags on public.contacts
  for each row execute function private.trg_tags_com_o_nome_do_vocabulario();

-- O que já está gravado, com o nome do vocabulário.
update public.clients c set tags = private.juntar_tags(c.tenant_id, c.tags, null)
 where cardinality(c.tags) > 0 and c.tags is distinct from private.juntar_tags(c.tenant_id, c.tags, null);
update public.contacts k set tags = private.juntar_tags(k.tenant_id, k.tags, null)
 where cardinality(k.tags) > 0 and k.tags is distinct from private.juntar_tags(k.tenant_id, k.tags, null);

-- 3. Os espelhos: a ficha e os contatos dela têm a MESMA lista ---------------

-- A ficha mudou de tag: os contatos dela também.
create or replace function private.trg_ficha_espelha_nos_contatos()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.tags is distinct from old.tags then
    update public.contacts k
       set tags = new.tags, updated_at = now()
     where k.client_id = new.id
       and k.tenant_id = new.tenant_id
       and k.tags is distinct from new.tags;
  end if;
  return null;
end
$$;

drop trigger if exists trg_ficha_espelha_nos_contatos on public.clients;
create trigger trg_ficha_espelha_nos_contatos
  after update of tags on public.clients
  for each row execute function private.trg_ficha_espelha_nos_contatos();

-- O contato mudou de tag: a ficha também (e, por ela, os outros contatos).
-- O contato ganhou a ficha: as tags dos dois lados se juntam.
create or replace function private.trg_contato_e_ficha_iguais()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_juntas text[];
begin
  if new.client_id is null then
    return null;
  end if;

  if tg_op = 'INSERT' or new.client_id is distinct from old.client_id then
    select private.juntar_tags(new.tenant_id, c.tags, new.tags) into v_juntas
      from public.clients c
     where c.id = new.client_id and c.tenant_id = new.tenant_id;
    if v_juntas is null then
      return null;
    end if;
    update public.clients c
       set tags = v_juntas, updated_at = now()
     where c.id = new.client_id and c.tags is distinct from v_juntas;
    -- A ficha já tinha a lista: o espelho dela não roda, e este contato acerta aqui.
    update public.contacts k
       set tags = v_juntas, updated_at = now()
     where k.id = new.id and k.tags is distinct from v_juntas;
  elsif new.tags is distinct from old.tags then
    update public.clients c
       set tags = new.tags, updated_at = now()
     where c.id = new.client_id and c.tenant_id = new.tenant_id and c.tags is distinct from new.tags;
  end if;
  return null;
end
$$;

drop trigger if exists trg_contato_e_ficha_iguais on public.contacts;
create trigger trg_contato_e_ficha_iguais
  after insert or update of tags, client_id on public.contacts
  for each row execute function private.trg_contato_e_ficha_iguais();

-- 4. Onde contato e ficha se encontram — num lugar só --------------------------

-- A ligação. Nunca religa: o contato que já é de outra ficha fica com ela.
create or replace function private.ligar_contato_a_ficha(p_tenant uuid, p_contato uuid, p_cliente uuid)
returns void
language sql
security definer
set search_path = ''
as $$
  update public.contacts k
     set client_id = p_cliente, updated_at = now()
   where k.id = p_contato
     and k.tenant_id = p_tenant
     and k.client_id is null
     and exists (select 1 from public.clients c where c.id = p_cliente and c.tenant_id = p_tenant)
$$;

revoke execute on function private.ligar_contato_a_ficha(uuid, uuid, uuid) from public, anon, authenticated;

-- A ÚNICA ficha ativa do telefone, pela régua da importação (D11,
-- `fichasDoTelefoneDoLead` + `fichaDaOportunidadeImportada`): o número de fora
-- com "+" (8 a 15 dígitos, sem o 55), senão o nacional (10 ou 11 dígitos, sem
-- o 55); menos de 10 dígitos não casa. Zero ou duas+ fichas: nula.
create or replace function private.ficha_unica_do_telefone(p_tenant uuid, p_fone text)
returns uuid
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_digitos text := regexp_replace(coalesce(p_fone, ''), '\D', '', 'g');
  v_chave   text;
  v_fichas  uuid[];
begin
  if left(btrim(coalesce(p_fone, '')), 1) = '+' and v_digitos not like '55%' and length(v_digitos) between 8 and 15 then
    v_chave := v_digitos;
  else
    v_chave := private.telefone_nacional(p_fone);
    if length(v_chave) not in (10, 11) then
      v_chave := null;
    end if;
  end if;
  if v_chave is null or length(v_chave) < 10 then
    return null;
  end if;
  select array_agg(f.id) into v_fichas
    from public.fichas_do_telefone(p_tenant, v_chave) f
   where f.ativa;
  if coalesce(cardinality(v_fichas), 0) <> 1 then
    return null;
  end if;
  return v_fichas[1];
end
$$;

revoke execute on function private.ficha_unica_do_telefone(uuid, text) from public, anon, authenticated;

-- A conversa e a ficha. A conversa que já é da ficha (o cadastro, o agendar)
-- liga o contato a ela. A que não é: a ficha do contato, ou a ÚNICA ficha
-- ativa do telefone (o Heitor, 18/11, noite: "sim, liga sozinha quando bater
-- com uma ficha só"), e a conversa ganha o selo. Só por telefone.
create or replace function private.ligar_conversa_a_ficha(p_conversa uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_tenant  uuid;
  v_contato uuid;
  v_cliente uuid;
  v_fone    text;
  v_ficha   uuid;
begin
  select c.tenant_id, c.contato_id, c.client_id, coalesce(k.phone, c.contact_phone), k.client_id
    into v_tenant, v_contato, v_cliente, v_fone, v_ficha
    from public.conversations c
    left join public.contacts k on k.id = c.contato_id
   where c.id = p_conversa;

  if v_contato is null then
    return;
  end if;

  if v_cliente is not null then
    perform private.ligar_contato_a_ficha(v_tenant, v_contato, v_cliente);
    return;
  end if;

  if v_ficha is null then
    v_ficha := private.ficha_unica_do_telefone(v_tenant, v_fone);
    if v_ficha is null then
      return;
    end if;
    perform private.ligar_contato_a_ficha(v_tenant, v_contato, v_ficha);
    select k.client_id into v_ficha from public.contacts k where k.id = v_contato;
    if v_ficha is null then
      return;
    end if;
  end if;

  update public.conversations c
     set client_id = v_ficha
   where c.id = p_conversa and c.client_id is null;
end
$$;

revoke execute on function private.ligar_conversa_a_ficha(uuid) from public, anon, authenticated;

-- A conversa nasce, ganha a ficha, troca de contato ou de telefone. Um erro
-- aqui NÃO pode descartar a mensagem que está chegando (crm-inbox.md §9.2.1).
create or replace function private.trg_conversa_liga_a_ficha()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.contato_id is null then
    return null;
  end if;
  if tg_op = 'INSERT'
     or new.client_id is distinct from old.client_id
     or new.contato_id is distinct from old.contato_id
     or new.contact_phone is distinct from old.contact_phone then
    begin
      perform private.ligar_conversa_a_ficha(new.id);
    exception when others then
      raise warning '[pessoa] ligar a conversa % à ficha: %', new.id, sqlerrm;
    end;
  end if;
  return null;
end
$$;

drop trigger if exists trg_conversa_liga_a_ficha on public.conversations;
create trigger trg_conversa_liga_a_ficha
  after insert or update of client_id, contato_id, contact_phone on public.conversations
  for each row execute function private.trg_conversa_liga_a_ficha();

-- A oportunidade ganha a ficha (o "Cadastrar cliente" do card, o "É a mesma
-- pessoa", o agendar pelo CRM, a importação): o contato dela passa a ser da ficha.
create or replace function private.trg_oportunidade_liga_a_ficha()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.client_id is not null and new.contato_id is not null
     and (tg_op = 'INSERT'
          or new.client_id is distinct from old.client_id
          or new.contato_id is distinct from old.contato_id) then
    begin
      perform private.ligar_contato_a_ficha(new.tenant_id, new.contato_id, new.client_id);
    exception when others then
      raise warning '[pessoa] ligar a oportunidade % à ficha: %', new.id, sqlerrm;
    end;
  end if;
  return null;
end
$$;

drop trigger if exists trg_oportunidade_liga_a_ficha on public.leads;
create trigger trg_oportunidade_liga_a_ficha
  after insert or update of client_id, contato_id on public.leads
  for each row execute function private.trg_oportunidade_liga_a_ficha();

-- A oportunidade nova de quem já tem ficha nasce com o contato DELA (depois do
-- contato da conversa de origem, antes do telefone): sem isso, o telefone
-- repetido (mãe e filha) daria à oportunidade da filha o contato da mãe.
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
end
$f$;

select pg_temp.trocar_no_corpo(
  'public.fn_oportunidade_ganha_contato()'::regprocedure,
  array[$t$  fone := nullif($t$],
  array[$t$  if achado is null and new.client_id is not null then
    select k.id into achado
    from public.contacts k
    where k.client_id = new.client_id
      and k.tenant_id = new.tenant_id
    order by k.created_at
    limit 1;
  end if;

  fone := nullif($t$],
  array[1]);

-- 5. O quadro recarrega quando a tag da pessoa muda --------------------------
-- (o card mostra as tags da pessoa; o sinal era só de leads, etapas e funis)

drop trigger if exists trg_quadro_tags_do_contato on public.contacts;
create trigger trg_quadro_tags_do_contato
  after update of tags on public.contacts
  for each row when (old.tags is distinct from new.tags)
  execute function public.on_crm_quadro_mudou();

drop trigger if exists trg_quadro_tags_da_ficha on public.clients;
create trigger trg_quadro_tags_da_ficha
  after update of tags on public.clients
  for each row when (old.tags is distinct from new.tags)
  execute function public.on_crm_quadro_mudou();

-- 6. As regras que a pessoa única expõe ---------------------------------------

-- O público das campanhas: E, sem distinguir a caixa (era `&&`, OU).
select pg_temp.trocar_no_corpo(
  'public.clientes_do_publico(uuid,jsonb)'::regprocedure,
  array[$t$(f.tags is null or c.tags && f.tags)$t$],
  array[$t$(f.tags is null or not exists (
           select 1 from unnest(f.tags) q(t)
            where btrim(q.t) <> ''
              and not exists (select 1 from unnest(c.tags) x(t) where lower(btrim(x.t)) = lower(btrim(q.t)))))$t$],
  array[1]);

-- O Copilot: a tag pedida com o nome do vocabulário ("vip" acha "VIP").
select pg_temp.trocar_no_corpo(
  'public.copilot_aniversariantes(uuid,integer,integer,text)'::regprocedure,
  array[$t$coalesce(c.tags, '{}'::text[]) @> array[p_tag]$t$],
  array[$t$coalesce(c.tags, '{}'::text[]) @> private.juntar_tags(p_tenant, array[p_tag], null)$t$],
  array[1]);

-- A busca "Contatos do CRM": o contato que já tem ficha é achado como a cliente.
select pg_temp.trocar_no_corpo(
  'public.busca_pessoas_sem_oportunidade(uuid,text,integer)'::regprocedure,
  array[$t$    and not exists (select 1 from public.leads l where l.contato_id = k.id)$t$],
  array[$t$    and k.client_id is null
    and not exists (select 1 from public.leads l where l.contato_id = k.id)$t$],
  array[1]);

-- A sessão só LÊ o contato e a ficha (CLAUDE.md §4, F63). Quem grava é o
-- servidor, depois da trava da action.
drop policy if exists contacts_operacional on public.contacts;
drop policy if exists contacts_select on public.contacts;
create policy contacts_select on public.contacts
  for select to authenticated
  using ((tenant_id)::text = jwt_claim('tenant_id') and jwt_claim('role') <> 'CLIENT');

drop policy if exists clients_insert on public.clients;
drop policy if exists clients_update on public.clients;

-- 7. Os dados que já existem --------------------------------------------------

-- a) As ligações que as oportunidades e as conversas já diziam (sem conflito:
--    o contato com duas fichas fica sem nenhuma, e é contado).
do $$
declare
  v_conflitos int;
begin
  with pares as (
    select l.tenant_id, l.contato_id, l.client_id from public.leads l where l.client_id is not null
    union
    select c.tenant_id, c.contato_id, c.client_id from public.conversations c
     where c.client_id is not null and c.contato_id is not null
  ), por_contato as (
    select p.contato_id, min(p.tenant_id::text)::uuid as tenant_id,
           min(p.client_id::text)::uuid as client_id, count(distinct p.client_id) as fichas
      from pares p group by p.contato_id
  )
  select count(*) into v_conflitos from por_contato where fichas > 1;

  with pares as (
    select l.tenant_id, l.contato_id, l.client_id from public.leads l where l.client_id is not null
    union
    select c.tenant_id, c.contato_id, c.client_id from public.conversations c
     where c.client_id is not null and c.contato_id is not null
  ), por_contato as (
    select p.contato_id, min(p.tenant_id::text)::uuid as tenant_id,
           min(p.client_id::text)::uuid as client_id, count(distinct p.client_id) as fichas
      from pares p group by p.contato_id
  )
  update public.contacts k
     set client_id = pc.client_id, updated_at = now()
    from por_contato pc
   where k.id = pc.contato_id and pc.fichas = 1 and k.client_id is null and k.tenant_id = pc.tenant_id;

  if v_conflitos > 0 then
    raise notice '[pessoa] % contato(s) com mais de uma ficha ficaram sem ligação', v_conflitos;
  end if;
end
$$;

-- b) A conversa que ainda não tem ficha: a ÚNICA ficha ativa do telefone.
select private.ligar_conversa_a_ficha(c.id)
  from public.conversations c
 where c.client_id is null and c.contato_id is not null;

-- c) As tags das oportunidades vão para a pessoa delas (a ficha; sem ela, o contato).
update public.clients c
   set tags = private.juntar_tags(c.tenant_id, c.tags, x.tags), updated_at = now()
  from (select l.client_id, l.tenant_id, array_agg(t order by t) as tags
          from public.leads l, unnest(l.tags) t
         where l.client_id is not null and cardinality(l.tags) > 0
         group by l.client_id, l.tenant_id) x
 where c.id = x.client_id and c.tenant_id = x.tenant_id
   and c.tags is distinct from private.juntar_tags(c.tenant_id, c.tags, x.tags);

update public.contacts k
   set tags = private.juntar_tags(k.tenant_id, k.tags, x.tags), updated_at = now()
  from (select l.contato_id, l.tenant_id, array_agg(t order by t) as tags
          from public.leads l, unnest(l.tags) t
         where l.client_id is null and cardinality(l.tags) > 0
         group by l.contato_id, l.tenant_id) x
 where k.id = x.contato_id and k.tenant_id = x.tenant_id
   and k.tags is distinct from private.juntar_tags(k.tenant_id, k.tags, x.tags);

-- 8. A PONTE (sai na 20261125500002): enquanto o código velho estiver no ar,
--    a tag que ele gravar no card vai para a pessoa (soma; o tirar do card
--    velho não tira da pessoa nesse intervalo).
create or replace function private.trg_tag_da_oportunidade_vai_para_a_pessoa()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if coalesce(cardinality(new.tags), 0) > 0 and (tg_op = 'INSERT' or new.tags is distinct from old.tags) then
    begin
      if new.client_id is not null then
        update public.clients c
           set tags = private.juntar_tags(c.tenant_id, c.tags, new.tags), updated_at = now()
         where c.id = new.client_id and c.tenant_id = new.tenant_id
           and c.tags is distinct from private.juntar_tags(c.tenant_id, c.tags, new.tags);
      elsif new.contato_id is not null then
        update public.contacts k
           set tags = private.juntar_tags(k.tenant_id, k.tags, new.tags), updated_at = now()
         where k.id = new.contato_id and k.tenant_id = new.tenant_id
           and k.tags is distinct from private.juntar_tags(k.tenant_id, k.tags, new.tags);
      end if;
    exception when others then
      raise warning '[pessoa] levar a tag da oportunidade % à pessoa: %', new.id, sqlerrm;
    end;
  end if;
  return null;
end
$$;

drop trigger if exists trg_tag_da_oportunidade_vai_para_a_pessoa on public.leads;
create trigger trg_tag_da_oportunidade_vai_para_a_pessoa
  after insert or update of tags on public.leads
  for each row execute function private.trg_tag_da_oportunidade_vai_para_a_pessoa();

notify pgrst, 'reload schema';
