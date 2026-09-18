-- Encontrar um cliente pelo telefone, apesar da máscara.
--
-- `clients.phone` guarda o que foi digitado: "(47) 99123-4567" num cadastro
-- pelo formulário, "5544988887777" quando veio do WhatsApp. Comparar texto com
-- texto faz a mesma pessoa virar dois clientes — foi o que aconteceu assim que
-- agendar passou a aceitar nome e telefone, sem CPF para servir de chave.
--
-- A comparação é pelos 8 últimos dígitos: é o que sobrevive a DDD escrito ou
-- não, ao nono dígito e ao código do país.

create index if not exists clients_telefone_digitos_idx
  on clients (tenant_id, right(regexp_replace(phone, '\D', '', 'g'), 8));

create or replace function public.cliente_por_telefone(
  p_tenant  uuid,
  p_digitos text,
  -- Só fichas sem CPF: é o caso de completar um cadastro rápido. Cliente COM
  -- CPF tem o documento como chave, e o telefone pode repetir de propósito
  -- (mãe e filha, casal).
  p_sem_cpf boolean default false
)
returns uuid
language sql
stable
security definer
set search_path = public
as $$
  select c.id
  from clients c
  where c.tenant_id = p_tenant
    and length(regexp_replace(p_digitos, '\D', '', 'g')) >= 10
    and right(regexp_replace(c.phone, '\D', '', 'g'), 8)
      = right(regexp_replace(p_digitos, '\D', '', 'g'), 8)
    and (not p_sem_cpf or c.document is null)
  order by c.created_at
  limit 1
$$;

comment on function public.cliente_por_telefone is
  'Cliente da rede com este telefone, comparando só os dígitos. Usada pelo cadastro rápido feito ao agendar.';

-- A função recebe o tenant por parâmetro e roda como definer: só o servidor
-- pode chamá-la, nunca o navegador.
revoke execute on function public.cliente_por_telefone(uuid, text, boolean) from public, anon, authenticated;
grant  execute on function public.cliente_por_telefone(uuid, text, boolean) to service_role;
