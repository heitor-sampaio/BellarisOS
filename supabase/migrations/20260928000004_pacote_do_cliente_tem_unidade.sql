-- `client_packages.branch_id` passa a ser chave estrangeira para `branches`.
--
-- Sem ela, o PostgREST não reconhece a relação, e todo embed
-- `client_packages → branches` respondia PGRST200. As duas leituras que
-- conferem a rede do pacote faziam exatamente isso:
--  - `getClientPackageSessions` — a lista de sessões de um pacote nunca abria;
--  - `schedulePackageSession` — agendar uma sessão de pacote nunca funcionou
--    (e, passando dali, ainda gravava um status que não existe no enum).
-- Achado em 2026-09-28 escrevendo `e2e/pacote-agendar.spec.ts`. A produção não
-- tem nenhum pacote vendido: a chave entra sem conflito.

alter table public.client_packages
  add constraint client_packages_branch_id_fkey
  foreign key (branch_id) references public.branches(id);

notify pgrst, 'reload schema';
