-- O dump traz os GRANTs de cada objeto como estão na nuvem, mas não tira o que
-- as permissões PADRÃO dariam ao criar (anon/authenticated/service_role em
-- tudo de public). Sem isto, a função que a nuvem fechou para a anon key nasce
-- aberta aqui. Desliga o padrão enquanto a base é criada; o fim o religa.
ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public REVOKE ALL ON TABLES FROM anon, authenticated, service_role;
ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public REVOKE ALL ON FUNCTIONS FROM anon, authenticated, service_role;
ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public REVOKE ALL ON SEQUENCES FROM anon, authenticated, service_role;
