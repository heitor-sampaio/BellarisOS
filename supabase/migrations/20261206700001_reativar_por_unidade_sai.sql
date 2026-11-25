-- O "Reativar clientes" por unidade sai (o Heitor, 25/11: "ok mas tenha certeza
-- absoluta que não é usada"). A cliente é da rede (24ª), e as duas telas usam a
-- função da rede inteira (lib/metrics/unidade.ts; CC-05). Conferido em 25/11:
-- nenhum app, função, view ou agendamento a chama, e os registros da API de três
-- dias (com duas simulações em produção) não têm nenhuma chamada a ela.
drop function if exists public.metrics_clientes_para_reativar(uuid, uuid, timestamp with time zone, integer, uuid);

notify pgrst, 'reload schema';
