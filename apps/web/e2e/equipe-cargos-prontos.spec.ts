import { test, expect } from '@playwright/test'
import { banco, PREFIXO } from './apoio/banco'
import { apagarRedeCriada } from './apoio/rede-criada'

/**
 * A rede nasce com cargos PRONTOS para usar: Gerente, Recepcionista,
 * Profissional e Financeiro, destravados e com uma matriz inicial.
 *
 * A simulação de um dia de clínica (2026-10-20) viu os quatro com cadeado,
 * "acesso total à rede" na tela e NENHUMA permissão — e as actions recusavam
 * atribuí-los. A dona criou os dela do zero. Decisão do Heitor: virarem
 * modelos editáveis. O "Admin da rede" continua o único de sistema (com o
 * "Não definido", o cargo de quem ainda não tem um).
 *
 * Sem o "só os meus" (SM1, o Heitor, 2026-11-23, e a resposta dele à pergunta
 * dos cargos: o Financeiro e a Agenda "só os meus" viram Sem acesso): nenhum
 * modelo nasce com escopo próprio; a Recepcionista sem o Financeiro, o
 * Profissional sem a Agenda e com o Atendimento e o Prontuário em Gerenciar.
 */

const marca = Date.now().toString(36)
const db = () => banco()
let rede = ''

test.afterAll(async () => {
  if (rede) expect(await apagarRedeCriada(rede)).toEqual([])
})

test('a rede nova nasce com os quatro cargos destravados e com permissões', async () => {
  const { data: t, error } = await db().from('tenants').insert({
    name: `${PREFIXO} Rede dos cargos ${marca}`, slug: `e2e-cargos-${marca}`, email: `e2e-cargos-${marca}@bellaris.invalid`, plan_status: 'trial',
  }).select('id').single<{ id: string }>()
  expect(error).toBeNull()
  rede = t!.id

  const { data: cargos } = await db().from('tenant_roles').select('id, key, is_system').eq('tenant_id', rede)
  const porChave = Object.fromEntries((cargos ?? []).map(c => [c.key as string, c]))
  for (const k of ['BRANCH_ADMIN', 'RECEPTIONIST', 'PROFESSIONAL', 'FINANCIAL']) {
    expect(porChave[k], `o cargo ${k} existe`).toBeTruthy()
    expect(porChave[k]!.is_system, `${k} é editável`).toBe(false)
  }
  expect(porChave.NETWORK_ADMIN?.is_system).toBe(true)

  const nivel = async (k: string, modulo: string) => {
    const { data } = await db().from('role_permissions').select('level, scope').eq('role_id', porChave[k]!.id).eq('module', modulo).maybeSingle()
    return data ? `${data.level}:${data.scope}` : 'NONE'
  }
  expect(await nivel('RECEPTIONIST', 'agenda')).toBe('MANAGE:ALL')
  expect(await nivel('RECEPTIONIST', 'cashier')).toBe('MANAGE:ALL')
  expect(await nivel('RECEPTIONIST', 'medical_records')).toBe('NONE')
  expect(await nivel('RECEPTIONIST', 'financial')).toBe('NONE')
  expect(await nivel('PROFESSIONAL', 'medical_records')).toBe('MANAGE:ALL')
  expect(await nivel('PROFESSIONAL', 'atendimento')).toBe('MANAGE:ALL')
  expect(await nivel('PROFESSIONAL', 'agenda')).toBe('NONE')
  expect(await nivel('PROFESSIONAL', 'financial')).toBe('NONE')
  expect(await nivel('FINANCIAL', 'financial')).toBe('MANAGE:ALL')
  expect(await nivel('BRANCH_ADMIN', 'team')).toBe('MANAGE:ALL')
  const { data: abas } = await db().from('role_report_tabs').select('tab').eq('role_id', porChave.FINANCIAL!.id)
  expect((abas ?? []).map(a => a.tab), 'o Financeiro vê as abas de dinheiro dos relatórios').toContain('financeiro')
})
