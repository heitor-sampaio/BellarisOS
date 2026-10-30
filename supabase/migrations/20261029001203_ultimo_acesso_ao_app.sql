-- O "último acesso" do pacote LGPD (contaNoApp.ultimoAcesso) saía sempre nulo:
-- nada gravava clients.last_app_login_at (J-65, 2026-10-30). Daqui em diante
-- a entrada no portal grava as duas colunas juntas (registrarEntradaNoPortal);
-- para as fichas de antes, a última entrada que já estava anotada.

update public.clients
   set last_app_login_at = portal_ultima_entrada_em
 where last_app_login_at is null
   and portal_ultima_entrada_em is not null;
