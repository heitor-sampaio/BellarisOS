-- O admin da rede deixa de depender de um claim legado.
--
-- Quem dá tudo ao admin hoje é `role = 'NETWORK_ADMIN'` no JWT
-- (`lib/auth.ts`: `isNetworkAdmin` → ALL_PERMISSIONS). O cargo "Admin da rede"
-- tem ZERO linhas em `role_permissions` — ou seja, um segundo admin criado pela
-- tela de Cargos, com um cargo novo, ficaria sem permissão nenhuma. E decidir
-- acesso por nome de cargo é justamente o que o CLAUDE.md §11 proíbe.
--
-- Aqui as permissões passam a estar escritas onde todas as outras estão. O
-- atalho do claim continua no código, como compatibilidade para tokens antigos.
--
-- O nível é o TETO DE CADA MÓDULO (`MODULE_LEVELS` em lib/permissions.ts):
-- `reports` só distingue NONE/VIEW, então gravar MANAGE nele deixaria a matriz
-- da tela de Cargos mostrando um nível que ela mesma não oferece.

insert into role_permissions (tenant_id, role_id, module, level, scope)
select r.tenant_id, r.id, m.module, m.level::permission_level, 'ALL'::permission_scope
from tenant_roles r
cross join (values
  ('agenda',          'MANAGE'),
  ('clients',         'MANAGE'),
  ('medical_records', 'MANAGE'),
  ('procedures',      'MANAGE'),
  ('stock',           'MANAGE'),
  ('financial',       'MANAGE'),
  ('cashier',         'MANAGE'),
  ('crm',             'MANAGE'),
  ('marketing',       'MANAGE'),
  ('reports',         'VIEW'),
  ('team',            'MANAGE'),
  ('forms',           'MANAGE'),
  ('roles',           'MANAGE'),
  ('settings',        'MANAGE')
) as m(module, level)
where r.key = 'NETWORK_ADMIN'
on conflict (role_id, module) do update
  set level = excluded.level,
      scope = excluded.scope,
      updated_at = now();
