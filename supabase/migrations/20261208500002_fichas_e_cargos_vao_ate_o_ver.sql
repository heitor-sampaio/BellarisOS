-- O Heitor, 25/11, sobre as Fichas e os Cargos na tela de Cargos: "8 - a" — "o
-- nível passa a se chamar 'Ver': a pessoa abre a aba e lê, como já acontece".
--
-- Mudar as fichas e os cargos é só da Admin da rede desde 18/11
-- ("Configuração da rede toda só pela conta admin"); o Gerenciar prometia o que
-- não dava. A matriz passa a oferecer Sem acesso e Ver (`MODULE_LEVELS`), e o
-- app já lê o Gerenciar gravado como Ver (`nivelAceito`). Aqui o gravado passa
-- a ser o que a tela mostra (princípio 3): o Gerenciar de `forms` e `roles`
-- vira Ver. Ninguém perde a aba: ela abre com o Ver (`nivelQueAbreAAba`).
-- Na produção de 25/11, um cargo com cada um.

update public.role_permissions
   set level = 'VIEW'
 where module in ('forms', 'roles')
   and level = 'MANAGE';

notify pgrst, 'reload schema';
