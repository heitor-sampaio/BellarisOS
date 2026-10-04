import { test, expect } from '@playwright/test'
import { banco } from './apoio/banco'
import { criarMembro, type MembroDeTeste } from './apoio/sessao'
import { criarOutraRede, type OutraRede } from './apoio/outra-rede'
import { criarAtendente, type AtendenteDeTeste } from './apoio/plataforma'
import { chamarAcao } from './apoio/acao-direta'
import {
  sessaoDoNavegador, rest, restBruto, autorizarPor, entrarComo, sessoesAtivasDaRede, limparSuporteDaRede,
} from './apoio/suporte'

/**
 * Dado clínico no modo suporte (decisão do Heitor: bloqueado por padrão).
 *
 * A trava é da RLS (`private.suporte_sem_clinico`, política RESTRITIVA nas
 * tabelas clínicas), porque o atendente tem o token do membro na mão — o
 * cookie do Supabase não é httpOnly. Por isso a prova é pelo PostgREST:
 *  - sem dado clínico na autorização: não LÊ e não GRAVA prontuário, nem na
 *    tela nem com o token;
 *  - com a autorização que o inclui (dada por quem gerencia prontuário): lê.
 * O controle de cada recusa é o próprio membro, com o token dele.
 */

const marca = Date.now().toString(36)
const db = () => banco()
const ANAMNESE = `ANAMNESE-CLINICO-${marca}`

let outra: OutraRede | null = null
const membros: MembroDeTeste[] = []
let atendente: AtendenteDeTeste | null = null
let alvo: MembroDeTeste, gestor: MembroDeTeste
let clienteComFicha = '', clienteSemFicha = ''

test.beforeAll(async () => {
  test.setTimeout(240_000)
  outra = await criarOutraRede(`sc${marca}`)
  alvo = await criarMembro(`scalvo${marca}`, {
    tenant: outra.tenantId, rotulo: 'Alvo',
    permissoes: [{ modulo: 'clients', nivel: 'MANAGE' }, { modulo: 'medical_records', nivel: 'MANAGE' }],
  })
  gestor = await criarMembro(`scgest${marca}`, {
    tenant: outra.tenantId, rotulo: 'Gestor',
    permissoes: [{ modulo: 'settings', nivel: 'MANAGE' }, { modulo: 'medical_records', nivel: 'MANAGE' }],
  })
  membros.push(alvo, gestor)
  atendente = await criarAtendente(`sc${marca}`, { papel: 'SUPORTE' })
  clienteComFicha = await outra.criarCliente('Paciente Clinico')
  clienteSemFicha = await outra.criarCliente('Paciente Sem Ficha')
  const { error } = await db().from('medical_records')
    .upsert({ client_id: clienteComFicha, general_anamnesis: { queixa: ANAMNESE } }, { onConflict: 'client_id' })
  expect(error).toBeNull()
})

test.afterAll(async () => {
  const falhas: string[] = []
  if (outra) {
    falhas.push(...await limparSuporteDaRede(outra.tenantId))
    const { error } = await db().from('medical_records').delete().in('client_id', [clienteComFicha, clienteSemFicha].filter(Boolean))
    if (error) falhas.push(`prontuários: ${error.message}`)
  }
  for (const m of membros) {
    const { error } = await db().from('user_notifications').delete().eq('user_id', m.userId)
    if (error) falhas.push(`notificações: ${error.message}`)
    await m.limpar()
  }
  if (atendente) await atendente.limpar()
  if (outra) await outra.limpar()
  expect(falhas).toEqual([])
})

test.describe.serial('suporte: dado clínico', () => {
  test('sem dado clínico na autorização: não lê nem grava prontuário, nem pelo token', async ({ browser }) => {
    await autorizarPor(browser, gestor.estado, alvo.userId, { clinico: false })
    const sup = await entrarComo(browser, atendente!.estado, outra!.tenantId, `Alvo scalvo${marca}`)
    try {
      await sup.page.goto(`/admin/clients/${clienteComFicha}`)
      await expect(sup.page.getByText('Paciente Clinico').first()).toBeVisible()
      expect(await sup.page.content()).not.toContain(ANAMNESE)

      const token = (await sessaoDoNavegador(sup.ctx)).access_token
      expect(await rest(token, `medical_records?select=id&client_id=eq.${clienteComFicha}`)).toHaveLength(0)
      // O resto da rede ele alcança — a trava é só do clínico.
      expect(await rest(token, `clients?select=id&id=eq.${clienteComFicha}`)).toHaveLength(1)
      const gravar = await restBruto(token, 'POST', 'medical_records', { client_id: clienteSemFicha, general_anamnesis: { x: 1 } })
      expect(gravar.status, 'gravar prontuário é recusado').toBeGreaterThanOrEqual(400)
      const alterar = await restBruto(token, 'PATCH', `medical_records?client_id=eq.${clienteComFicha}`, { general_anamnesis: { x: 2 } })
      expect(Array.isArray(alterar.corpo) ? alterar.corpo : [], 'alterar não atinge linha nenhuma').toHaveLength(0)
    } finally {
      await sup.page.goto('/auth/suporte-fim')
      await sup.ctx.close()
    }
    const { data: ficha } = await db().from('medical_records').select('general_anamnesis').eq('client_id', clienteComFicha).single()
    expect(JSON.stringify(ficha!.general_anamnesis)).toContain(ANAMNESE)
    const { data: nova } = await db().from('medical_records').select('id').eq('client_id', clienteSemFicha)
    expect(nova ?? []).toHaveLength(0)
    expect(await sessoesAtivasDaRede(outra!.tenantId)).toHaveLength(0)

    // Controle: o próprio membro, com o token dele, lê.
    expect(await rest(alvo.accessToken, `medical_records?select=id&client_id=eq.${clienteComFicha}`)).toHaveLength(1)
  })

  test('com a autorização que inclui dado clínico, o suporte lê o prontuário', async ({ browser }) => {
    await autorizarPor(browser, gestor.estado, alvo.userId, { clinico: true })
    const sup = await entrarComo(browser, atendente!.estado, outra!.tenantId, `Alvo scalvo${marca}`)
    try {
      const token = (await sessaoDoNavegador(sup.ctx)).access_token
      expect(await rest(token, `medical_records?select=id&client_id=eq.${clienteComFicha}`)).toHaveLength(1)
      await sup.page.goto(`/admin/clients/${clienteComFicha}`)
      await expect(sup.page.getByText('Paciente Clinico').first()).toBeVisible()
      expect(await sup.page.content()).toContain(ANAMNESE)
    } finally {
      await sup.page.goto('/auth/suporte-fim')
      await sup.ctx.close()
    }
  })

  test('só quem gerencia o prontuário libera dado clínico', async ({ browser }) => {
    const semProntuario = await criarMembro(`scsem${marca}`, {
      tenant: outra!.tenantId, rotulo: 'SemProntuario', permissoes: [{ modulo: 'settings', nivel: 'MANAGE' }],
    })
    membros.push(semProntuario)
    const ctx = await browser.newContext({ storageState: semProntuario.estado })
    try {
      const p = await ctx.newPage()
      const r = await chamarAcao(p, 'actions/suporte-autorizacao.ts', 'autorizarSuporte', '/admin/settings',
        [{ userId: alvo.userId, horas: 24, incluiClinico: true }])
      expect(r.texto).toContain('Só quem gerencia o prontuário')
    } finally { await ctx.close() }
  })
})
