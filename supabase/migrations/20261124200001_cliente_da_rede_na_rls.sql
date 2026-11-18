-- A ficha é da REDE, também na RLS (auditoria das regras, 18/11).
--
-- O Heitor: "o cliente não é da unidade, o cliente é da rede" (H16); "Como o
-- cliente pertence à clínica, a unidade, o portal da unidade vê todos os
-- clientes" (CL-P1, revisao.md:504); "Nada se prende a clients.branch_id"
-- (CLAUDE.md §5); "o cliente é da rede, já falei 1000x" (18/11).
--
-- Até aqui `clients_select`/`clients_update` (e as aplicações e o mapa de
-- injetáveis) conferiam `can_access_branch(clients.branch_id)` — a unidade em
-- que a ficha NASCEU: o membro de uma unidade não lia, pela sessão, a cliente
-- cadastrada na outra. Agora a equipe confere a REDE (a trava do módulo —
-- Clientes em Gerenciar — é da action, como em toda tabela). O lado CLIENT
-- (`clientes_do_login()`), as RESTRICTIVE do suporte e o `to authenticated`
-- da leitura (`clients` está na publicação do Realtime — F26) ficam.
--
-- `clients.branch_id` fica no banco como "onde a ficha nasceu"; nada o lê para
-- decidir acesso.

alter policy clients_select on public.clients to authenticated using (
  ((jwt_claim('role') <> 'CLIENT') and (tenant_id)::text = jwt_claim('tenant_id'))
  or ((jwt_claim('role') = 'CLIENT') and id in (select private.clientes_do_login()))
);

-- A "de rede" (branch_id nulo) passa a ser o caso geral: sai a política à parte.
drop policy if exists clients_select_network on public.clients;
drop policy if exists clients_update_network on public.clients;

alter policy clients_update on public.clients
  using ((jwt_claim('role') <> 'CLIENT') and (tenant_id)::text = jwt_claim('tenant_id'))
  with check ((jwt_claim('role') <> 'CLIENT') and (tenant_id)::text = jwt_claim('tenant_id'));

-- Nascer: na rede da sessão; a unidade "onde nasceu", se vier, é uma das dela.
alter policy clients_insert on public.clients with check (
  (jwt_claim('role') <> 'CLIENT')
  and (tenant_id)::text = jwt_claim('tenant_id')
  and (branch_id is null or private.can_access_branch(branch_id))
);

-- As aplicações e o mapa de injetáveis seguem a ficha: a rede, não a unidade
-- de cadastro (`cliente_da_minha_rede` confere a rede pela ficha).
alter policy injectable_maps_all on public.injectable_maps using (
  ((jwt_claim('client_id') is null) and (jwt_claim('role') <> 'CLIENT') and private.cliente_da_minha_rede(client_id))
  or (client_id in (select private.clientes_do_login()))
) with check (
  ((jwt_claim('client_id') is null) and (jwt_claim('role') <> 'CLIENT') and private.cliente_da_minha_rede(client_id))
  or (client_id in (select private.clientes_do_login()))
);

alter policy injectable_applications_all on public.injectable_applications using (
  ((jwt_claim('client_id') is null) and (jwt_claim('role') <> 'CLIENT') and private.cliente_da_minha_rede(client_id))
  or (client_id in (select private.clientes_do_login()))
) with check (
  ((jwt_claim('client_id') is null) and (jwt_claim('role') <> 'CLIENT') and private.cliente_da_minha_rede(client_id))
  or (client_id in (select private.clientes_do_login()))
);

notify pgrst, 'reload schema';
