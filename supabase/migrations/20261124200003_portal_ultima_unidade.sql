-- O endereço do portal da cliente: a última unidade que ela usou, não a de
-- cadastro (auditoria das regras, 18/11; o Heitor: "o cliente não é da
-- unidade, o cliente é da rede" — H16; "Nada se prende a clients.branch_id").
--
-- O login, o seletor de rede e o "entrar" levavam ao portal da unidade em que
-- a ficha NASCEU (`clients.branch_id`). Agora o portal anota a unidade do
-- endereço a cada entrada (`registrarEntradaNoPortal`), e o próximo login vai
-- a ela; sem nenhuma, a primeira unidade ativa da rede
-- (`lib/clientes/unidade-do-portal.ts`).
--
-- SEM chave estrangeira de propósito: uma segunda FK de `clients` para
-- `branches` deixaria o embed `clients → branches` ambíguo no PostgREST
-- (PGRST201, CLAUDE.md §14) em todo o sistema. A unidade que sumir ou se
-- desativar simplesmente não é achada entre as ativas, e vale a primeira.

alter table public.clients add column if not exists portal_ultima_unidade uuid;

comment on column public.clients.portal_ultima_unidade is
  'A unidade (branches.id) do portal em que a cliente entrou por último — o destino do próximo login. Sem FK de propósito (PGRST201).';

notify pgrst, 'reload schema';
