-- O endereço (slug) da unidade é ÚNICO no sistema inteiro (2026-10-19,
-- decisão do Heitor). Até aqui era único só dentro da rede
-- (`branches_tenant_id_slug_key`), e a cliente de duas clínicas com uma
-- unidade "centro" cada tinha o mesmo endereço para as duas — o link de um
-- aviso de uma abria a ficha dela na outra.
--
-- Quem cria a unidade (`createBranch`) escolhe um endereço livre sozinho
-- (lib/unidades/endereco.ts): o nome; ocupado, o nome com a clínica no fim;
-- depois, numerado. Este índice é a segunda linha (dois cadastros ao mesmo
-- tempo, ou gravação por fora do app). Entrou sem conflito: nenhum repetido.
-- O índice por rede fica (é redundante, não atrapalha).

create unique index if not exists branches_slug_unico on public.branches (slug);
