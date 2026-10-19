-- A segunda metade de 20261019000001: sai o índice único antigo de
-- `clients.auth_id` (um login, uma ficha no banco inteiro). No lugar ficou
-- `clients_um_login_por_rede` (uma ficha por rede) e `clients_auth_id_idx`
-- (a busca pelo login). Separada porque é o único passo que apaga algo.

alter table public.clients drop constraint clients_auth_id_key;
