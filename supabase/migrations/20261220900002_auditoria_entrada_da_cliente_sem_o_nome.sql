-- A entrada da cliente na Auditoria sem o nome dela gravado.
--
-- docs/regras/plataforma.md (Auditoria): "O nome da cliente e do membro se lê
-- na hora de mostrar (lib/auditoria/frase.ts)", e dos registros vão "os nomes
-- e uma lista curta de valores sem dado pessoal". A função de 20261203400002
-- gravava o NOME da cliente em `ator_nome`, numa tabela que não se altera: era
-- o único ponto em que a Auditoria guardava o nome de uma cliente. Os gatilhos
-- gravam "A cliente, pelo portal" e a ficha (`ator_cliente_id`); a tela lê o
-- nome dessa ficha na hora (quemAgiu). A entrada passa a gravar igual — arremate
-- da 41ª, decisão do Claude (28/11). As linhas de antes ficam como estão (a
-- Auditoria não se altera), e a tela já as mostra pelo nome lido da ficha.
--
-- O resto não muda: a rede da ficha, sem unidade, a cliente como quem agiu,
-- e só o servidor chama.

create or replace function public.auditoria_registrar_entrada_da_cliente(p_client uuid)
returns void
language sql
security definer
set search_path = ''
as $$
  insert into public.auditoria (tenant_id, branch_id, client_id, tabela, operacao, registro_id, ator_cliente_id, ator_nome, ator_tipo)
  select c.tenant_id, null, c.id, 'clients', 'entrou', c.id::text, c.id,
         'A cliente, pelo portal', 'cliente'
    from public.clients c
    join public.tenants t on t.id = c.tenant_id
   where c.id = p_client
$$;

revoke execute on function public.auditoria_registrar_entrada_da_cliente(uuid) from public, anon, authenticated;
grant execute on function public.auditoria_registrar_entrada_da_cliente(uuid) to service_role;

notify pgrst, 'reload schema';
