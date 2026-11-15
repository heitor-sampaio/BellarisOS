import { test, expect } from '@playwright/test'
import { banco, tenantId } from './apoio/banco'
import { ALL_MODULES, ALL_PERMISSIONS, MODULE_LEVELS } from '../lib/permissions'

/**
 * O admin da rede não depende de um claim legado.
 *
 * Em 2026-09-18 o "tudo" do admin vinha de `role === 'NETWORK_ADMIN'` no JWT
 * — o "decidir por nome de cargo" que o CLAUDE.md §11 proíbe —, e a correção
 * de então gravou a matriz inteira no cargo. Desde a C58/F70 o tudo vem do
 * CARGO DE SISTEMA no banco (`tenant_roles.key = 'NETWORK_ADMIN'` com
 * `is_system`, lido no membro: `ehAdminDaRede` → `ALL_PERMISSIONS`), e a
 * rede nova nasce com o cargo e SEM linhas (`seed_tenant_admin_role`, que é
 * assim desde 2026-10-21): a tela de Cargos o mostra como "Acesso total à
 * rede", e ninguém lê a matriz dele. A completa de 14–15/11, a primeira na
 * rede de teste nascida do script de 13/11, cobrava as linhas da migração de
 * setembro — que só as redes antigas tinham.
 */

test('o cargo Admin da rede é o de sistema, com o membro nele, e o tudo dele cobre todos os módulos', async () => {
  const db = banco()
  const tenant = await tenantId()

  const { data: cargo, error: cargoErr } = await db
    .from('tenant_roles').select('id, label, is_system').eq('key', 'NETWORK_ADMIN').eq('tenant_id', tenant).maybeSingle()
  expect(cargoErr).toBeNull()
  expect(cargo, 'a rede precisa ter o cargo Admin da rede').not.toBeNull()
  expect(cargo!.is_system, 'o Admin da rede é o cargo de SISTEMA (é a chave que decide, não o rótulo)').toBe(true)

  const email = process.env.E2E_ADMIN_EMAIL ?? 'admin@bellaris.com.br'
  const { data: membro, error: eMembro } = await db
    .from('users').select('role_id').eq('tenant_id', tenant).eq('email', email).maybeSingle()
  expect(eMembro).toBeNull()
  expect(membro?.role_id, 'o admin da suíte está no cargo de sistema').toBe(cargo!.id)

  // O que o contexto dá ao cargo de sistema: todo módulo, no nível mais alto que ele aceita.
  for (const modulo of ALL_MODULES) {
    expect(ALL_PERMISSIONS[modulo], `${modulo} não pode estar em NONE para o admin`).not.toBe('NONE')
  }
  expect(Object.keys(ALL_PERMISSIONS).sort(), 'nenhum módulo a mais nem a menos que ALL_MODULES').toEqual([...ALL_MODULES].sort())

  // Linha que sobrou de antes no cargo (as redes antigas) não oferece um nível
  // que o módulo não distingue — é o defeito que MODULE_LEVELS existe para impedir.
  const { data: linhas, error } = await db
    .from('role_permissions').select('module, level').eq('role_id', cargo!.id)
  expect(error).toBeNull()
  for (const l of linhas ?? []) {
    expect(ALL_MODULES as readonly string[], `módulo ${l.module} fora de ALL_MODULES`).toContain(l.module)
    expect(MODULE_LEVELS[l.module as keyof typeof MODULE_LEVELS], `${l.module} não aceita ${l.level}`).toContain(l.level)
  }
})

test('quem é da rede tem abrangência nula — é o que abre o portal da rede', async () => {
  const db = banco()
  const email = process.env.E2E_ADMIN_EMAIL ?? 'admin@bellaris.com.br'

  const { data: usuario, error } = await db
    .from('users').select('branch_id, is_active, role_id').eq('email', email).maybeSingle()
  expect(error).toBeNull()
  expect(usuario, `o usuário ${email} deveria existir`).not.toBeNull()
  expect(usuario!.is_active).toBe(true)
  // Abrangência, não nome de cargo: é `branch_id is null` que define "da rede".
  expect(usuario!.branch_id).toBeNull()
  expect(usuario!.role_id, 'o cargo vem do banco, não do claim').not.toBeNull()
})
