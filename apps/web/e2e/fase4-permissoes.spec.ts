import { test, expect } from '@playwright/test'
import { banco } from './apoio/banco'
import { ALL_MODULES, MODULE_LEVELS } from '../lib/permissions'

/**
 * O admin da rede não depende de um claim legado.
 *
 * O cargo "Admin da rede" tinha zero linhas em `role_permissions`: quem lhe
 * dava tudo era `role === 'NETWORK_ADMIN'` no JWT — o "decidir por nome de
 * cargo" que o CLAUDE.md §11 proíbe. Um segundo admin criado pela tela de
 * Cargos nasceria sem nada. As linhas foram gravadas por migração e é isso que
 * este teste guarda.
 */

test('o cargo Admin da rede tem acesso a todos os módulos, gravado no banco', async () => {
  const db = banco()

  const { data: cargo, error: cargoErr } = await db
    .from('tenant_roles').select('id, label').eq('key', 'NETWORK_ADMIN').maybeSingle()
  expect(cargoErr).toBeNull()
  expect(cargo, 'a rede precisa ter o cargo Admin da rede').not.toBeNull()

  const { data: linhas, error } = await db
    .from('role_permissions').select('module, level, scope').eq('role_id', cargo!.id)
  expect(error).toBeNull()

  const porModulo = new Map((linhas ?? []).map(l => [l.module as string, l]))

  for (const modulo of ALL_MODULES) {
    const linha = porModulo.get(modulo)
    expect(linha, `faltou a linha do módulo ${modulo}`).toBeDefined()
    expect(linha!.level, `${modulo} não pode estar em NONE para o admin`).not.toBe('NONE')
    // Oferecer um nível que o módulo não distingue é o defeito que MODULE_LEVELS
    // existe para impedir — inclusive vindo do banco.
    expect(MODULE_LEVELS[modulo], `${modulo} não aceita ${linha!.level}`).toContain(linha!.level)
  }

  expect(porModulo.size, 'nenhum módulo a mais que os declarados em ALL_MODULES').toBe(ALL_MODULES.length)
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
