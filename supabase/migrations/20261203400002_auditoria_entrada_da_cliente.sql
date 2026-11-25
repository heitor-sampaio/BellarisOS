-- A entrada da cliente no portal e no app fica na Auditoria.
--
-- AD-04 do catálogo da Plataforma: o CF3 aprovado (docs/revisao.md) diz
-- "entradas no sistema (login)", sem recorte. A `auditoria_registrar_entrada`
-- (20261116000001) grava só o membro, e o login pela tela e a sessão do app
-- pulavam a cliente.
--
-- Decisão do Claude (catálogo de 24/11; "cada rede só vê a sua", CLAUDE.md
-- §5): a entrada fica na REDE em que ela entra — a ficha do destino do login,
-- ou a que ela escolhe no seletor. O app decide a ficha
-- (`lib/clientes/entrada-na-auditoria.ts`); aqui só se grava a linha, com a
-- cliente como quem agiu (`ator_tipo = 'cliente'`, `ator_cliente_id`) e a
-- ficha em `client_id` (o filtro "cliente" da tela). A ficha é da rede, não de
-- uma unidade: `branch_id` fica nulo, como o da entrada do membro da rede.

create or replace function public.auditoria_registrar_entrada_da_cliente(p_client uuid)
returns void
language sql
security definer
set search_path = ''
as $$
  insert into public.auditoria (tenant_id, branch_id, client_id, tabela, operacao, registro_id, ator_cliente_id, ator_nome, ator_tipo)
  select c.tenant_id, null, c.id, 'clients', 'entrou', c.id::text, c.id,
         coalesce(nullif(btrim(c.name), ''), 'Cliente'), 'cliente'
    from public.clients c
    join public.tenants t on t.id = c.tenant_id
   where c.id = p_client
$$;

revoke execute on function public.auditoria_registrar_entrada_da_cliente(uuid) from public, anon, authenticated;
grant execute on function public.auditoria_registrar_entrada_da_cliente(uuid) to service_role;

notify pgrst, 'reload schema';
