-- Quebra dos módulos que viraram baldes, e remoção de um que não governa nada.
--
-- `settings` acumulava 28 gates e três assuntos sem relação entre si. O pior
-- deles era de segurança: `settings MANAGE` permitia editar a própria matriz de
-- permissões (actions/permissions.ts) — auto-escalação de acesso. Quem monta
-- ficha de anamnese também não deveria alcançar token de integração.
--
--   settings → settings (rede, unidades, integrações)
--            + roles    (cargos e permissões)
--            + forms    (fichas de anamnese e atendimento)
--
-- `financial` misturava lançar/estornar com operar o caixa. Na tela da filial
-- isso aparecia literalmente como `canReverse = canWrite`: quem recebia
-- pagamento também estornava e lançava qualquer despesa.
--
--   financial → financial (lançar, relatórios, estornar)
--             + cashier   (abrir/fechar caixa, receber)
--
-- `loyalty` sai do catálogo: zero gates no app. Aparecia na tela de cargos, o
-- admin escolhia um nível e nada acontecia. Volta quando o módulo existir.
--
-- Backfill: cada módulo novo HERDA o nível do módulo de origem, exceto `roles` e
-- `forms`, que entram em NONE. Herdar `settings` neles daria a todo cargo com
-- configurações o poder de editar cargos — exatamente o furo que motivou a
-- quebra. Assim, nenhum cargo existente muda de comportamento sem alguém decidir.

-- 1. cashier herda de financial
insert into public.role_permissions (tenant_id, role_id, module, level, scope)
select tenant_id, role_id, 'cashier', level, 'ALL'
  from public.role_permissions
 where module = 'financial'
on conflict (role_id, module) do nothing;

-- 2. roles e forms entram fechados para quem tinha settings
insert into public.role_permissions (tenant_id, role_id, module, level, scope)
select tenant_id, role_id, m, 'NONE', 'ALL'
  from public.role_permissions, unnest(array['roles', 'forms']) as m
 where module = 'settings'
on conflict (role_id, module) do nothing;

-- 3. loyalty sai do catálogo
delete from public.role_permissions where module = 'loyalty';

notify pgrst, 'reload schema';
