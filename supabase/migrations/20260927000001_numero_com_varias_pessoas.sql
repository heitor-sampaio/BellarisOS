-- Um número de WhatsApp atendido por VÁRIAS pessoas.
--
-- Até aqui o vínculo era `whatsapp_numbers.user_id`: uma pessoa por número. O
-- caso real que isso não cobre é o mais comum numa clínica única — UM número de
-- atendimento e três SDRs respondendo por ele (pedido do Heitor, 2026-09-27).
--
-- O que NÃO muda: cada pessoa continua falando por no máximo UM número. É a
-- mesma garantia de antes, agora de outro lado da relação — com duas caixas
-- para a mesma pessoa, "por onde ela responde" voltaria a ser desempate, que é o
-- defeito que `whatsapp_numbers` existe para matar. Por isso tabela de junção
-- com `unique (user_id)`, e não um `uuid[]` no número: índice nenhum proíbe o
-- mesmo id em dois arrays (é o problema de `contacts.identifiers`).
--
-- Mesma rede garantida pelo BANCO: as duas chaves estrangeiras são compostas com
-- `tenant_id`, então não existe linha ligando número de uma rede a pessoa de
-- outra, venha a escrita de onde vier.

alter table public.whatsapp_numbers
  add constraint whatsapp_numbers_id_tenant_key unique (id, tenant_id);
alter table public.users
  add constraint users_id_tenant_key unique (id, tenant_id);

create table if not exists public.whatsapp_number_users (
  whatsapp_number_id uuid not null,
  user_id            uuid not null,
  tenant_id          uuid not null,
  created_at         timestamptz not null default now(),
  primary key (whatsapp_number_id, user_id),
  -- UMA chave para o número (a composta): duas para a mesma tabela deixariam o
  -- embed do PostgREST ambíguo.
  foreign key (whatsapp_number_id, tenant_id)
    references public.whatsapp_numbers (id, tenant_id) on delete cascade,
  foreign key (user_id, tenant_id)
    references public.users (id, tenant_id) on delete cascade
);

-- Uma pessoa, um número.
create unique index if not exists uniq_whatsapp_number_users_usuario
  on public.whatsapp_number_users (user_id);

alter table public.whatsapp_number_users enable row level security;

drop policy if exists "Rede gerencia quem fala por cada número" on public.whatsapp_number_users;
create policy "Rede gerencia quem fala por cada número" on public.whatsapp_number_users
  for all using (
    public.eh_da_rede()
    and tenant_id::text = public.jwt_claim('tenant_id')
  );

comment on table public.whatsapp_number_users is
  'Quem responde por cada número. Várias pessoas por número; no máximo um número por pessoa (índice único em user_id).';

-- Cópia do vínculo antigo. Idempotente.
insert into public.whatsapp_number_users (whatsapp_number_id, user_id, tenant_id)
select w.id, w.user_id, w.tenant_id
from public.whatsapp_numbers w
where w.user_id is not null
on conflict do nothing;

comment on column public.whatsapp_numbers.user_id is
  'LEGADO desde 2026-09-27: ninguém lê nem escreve. O vínculo é whatsapp_number_users. Sai numa migration própria.';

-- Nome, unidade e pessoas de um número, numa transação só.
--
-- Função porque são duas tabelas: gravar o nome e falhar nas pessoas deixaria a
-- tela dizendo "erro" com metade salva. O nome das variáveis começa com `p_`
-- para nunca coincidir com coluna (o 42702 de §9.2.1).
create or replace function public.definir_vinculos_do_numero(
  p_numero   uuid,
  p_tenant   uuid,
  p_label    text,
  p_branch   uuid,
  p_usuarios uuid[]
) returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if p_branch is not null and not exists (
    select 1 from public.branches b where b.id = p_branch and b.tenant_id = p_tenant
  ) then
    raise exception 'unidade de outra rede' using errcode = '23503';
  end if;

  update public.whatsapp_numbers w
     set label = p_label, branch_id = p_branch, updated_at = now()
   where w.id = p_numero and w.tenant_id = p_tenant;
  if not found then
    raise exception 'número não encontrado nesta rede' using errcode = 'P0002';
  end if;

  delete from public.whatsapp_number_users v
   where v.whatsapp_number_id = p_numero
     and not (v.user_id = any (coalesce(p_usuarios, '{}')));

  -- Pessoa de outra rede bate na chave composta (23503); pessoa que já fala
  -- por outro número bate no índice único (23505). Os dois abortam tudo.
  insert into public.whatsapp_number_users (whatsapp_number_id, user_id, tenant_id)
  select p_numero, x.id, p_tenant
    from unnest(coalesce(p_usuarios, '{}')) as x(id)
  on conflict (whatsapp_number_id, user_id) do nothing;
end;
$$;

revoke all on function public.definir_vinculos_do_numero(uuid, uuid, text, uuid, uuid[])
  from public, anon, authenticated;
grant execute on function public.definir_vinculos_do_numero(uuid, uuid, text, uuid, uuid[])
  to service_role;

notify pgrst, 'reload schema';
