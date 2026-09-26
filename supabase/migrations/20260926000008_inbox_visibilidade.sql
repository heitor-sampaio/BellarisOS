-- Com escopo OWN no CRM, o que decide se uma conversa aparece: a PESSOA ou a
-- THREAD. Escolha da clínica (pedido do Heitor, 2026-09-26).
--
-- 'conversa' é o comportamento até aqui: cada thread aparece conforme a
-- oportunidade ligada a ELA (`conversations.lead_id`). Com várias threads por
-- pessoa isso vaza e esconde ao mesmo tempo — a thread nova da unidade, sem
-- oportunidade, aparece para qualquer SDR, e a thread em que outro SDR abriu
-- negócio some para quem já negociava com a pessoa.
--
-- 'pessoa' segue o resto do sistema (§9.2.1): se a pessoa tem oportunidade
-- sua, você vê todas as threads dela; se só tem de outros, nenhuma; se não tem
-- nenhuma, todo mundo vê. É o padrão, porque é o que a espinha pede.
--
-- Não afeta quem tem escopo ALL, que é o padrão dos cargos.

alter table public.tenants
  add column if not exists inbox_visibilidade text not null default 'pessoa';

alter table public.tenants
  drop constraint if exists tenants_inbox_visibilidade_check;
alter table public.tenants
  add constraint tenants_inbox_visibilidade_check
  check (inbox_visibilidade in ('pessoa', 'conversa'));

comment on column public.tenants.inbox_visibilidade is
  'Com escopo OWN no CRM: pessoa = vê todas as threads de quem tem oportunidade sua; conversa = cada thread pela oportunidade ligada a ela.';

-- As pessoas escondidas de um dono no modo 'pessoa': têm oportunidade de outro
-- dono e nenhuma dele. Oportunidade sem dono não esconde ninguém (bolo comum).
--
-- No banco, e devolvendo UM array: calcular no app exigiria ler todos os leads
-- com dono, e o PostgREST corta em 1000 linhas — a partir daí a pessoa de outro
-- SDR voltaria a aparecer, em silêncio (§13.1).
--
-- `security definer` lê leads de outros donos, então só o cliente de serviço a
-- executa: exposta a `authenticated`, qualquer sessão mapearia quem negocia
-- com quem.
create or replace function public.contatos_ocultos_do_dono(p_tenant uuid, p_owner uuid)
returns uuid[]
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(array_agg(distinct l.contato_id), '{}')
  from public.leads l
  where l.tenant_id = p_tenant
    and l.owner_id is not null
    and l.owner_id <> p_owner
    and not exists (
      select 1 from public.leads m
      where m.tenant_id = p_tenant
        and m.contato_id = l.contato_id
        and m.owner_id = p_owner
    );
$$;

revoke all on function public.contatos_ocultos_do_dono(uuid, uuid) from public, anon, authenticated;
grant execute on function public.contatos_ocultos_do_dono(uuid, uuid) to service_role;
