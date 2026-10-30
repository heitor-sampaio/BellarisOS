import { test, expect } from '@playwright/test'
import { banco, PREFIXO } from './apoio/banco'
import { criarMembro, type MembroDeTeste } from './apoio/sessao'
import { criarOutraRede, type OutraRede } from './apoio/outra-rede'

/**
 * J-9 (simulação): na Equipe, desmarcar "Segue o horário da unidade" fazia o
 * horário da profissional nascer no padrão comercial (seg–sáb 08–20), mesmo
 * com a unidade abrindo seg–sex 10–18. Quem só queria tirar a quarta tinha de
 * redigitar a semana inteira — e, sem perceber, salvava a profissional
 * "atendendo" no sábado em que a unidade nem abre. Agora o horário parte do
 * horário da UNIDADE do membro.
 */

const marca = Date.now().toString(36)
const db = () => banco()
let rede: OutraRede | null = null
let gestora: MembroDeTeste | null = null
let esteticista: MembroDeTeste | null = null
const HORARIO_DA_UNIDADE = { dias: {
  0: [], 1: [{ de: '10:00', ate: '18:00' }], 2: [{ de: '10:00', ate: '18:00' }], 3: [{ de: '10:00', ate: '18:00' }],
  4: [{ de: '10:00', ate: '18:00' }], 5: [{ de: '10:00', ate: '18:00' }], 6: [],
} }

test.use({ storageState: { cookies: [], origins: [] } })

test.beforeAll(async () => {
  rede = await criarOutraRede(`eh${marca}`)
  expect((await db().from('branches').update({ horario: HORARIO_DA_UNIDADE }).eq('id', rede.branchId)).error).toBeNull()
  gestora = await criarMembro(`ehg${marca}`, {
    tenant: rede.tenantId, rotulo: 'Gestora', permissoes: [{ modulo: 'team', nivel: 'MANAGE' }],
  })
  esteticista = await criarMembro(`ehe${marca}`, {
    tenant: rede.tenantId, branchId: rede.branchId, rotulo: 'Esteticista',
    permissoes: [{ modulo: 'agenda', nivel: 'MANAGE', escopo: 'OWN' }],
  })
})

test.afterAll(async () => {
  await esteticista?.limpar(); await gestora?.limpar(); await rede?.limpar()
})

test('desmarcar "Segue o horário da unidade" parte do horário da unidade, não do comercial', async ({ browser }) => {
  const ctx = await browser.newContext({ storageState: gestora!.estado })
  const p = await ctx.newPage()
  try {
    await p.goto('/admin/team')
    await p.getByTitle(`Editar ${PREFIXO} Esteticista ehe${marca}`).click()
    const janela = p.getByRole('dialog')
    await janela.getByLabel('Segue o horário da unidade').uncheck()
    await expect(janela.getByLabel('Segunda, abre às')).toHaveValue('10:00')
    await expect(janela.getByLabel('Segunda, fecha às')).toHaveValue('18:00')
    await expect(janela.getByLabel('Sábado abre')).not.toBeChecked()
    await expect(janela.getByLabel('Domingo abre')).not.toBeChecked()
  } finally {
    await ctx.close()
  }
})
